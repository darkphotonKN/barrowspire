package usecase_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	accountrepo "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/repository"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// CreditSeller is the one saga step with no prior hold to make it idempotent, so
// exactly-once rests on the dedup row and the credit committing TOGETHER (FS-NXP1W
// §Req 23, 30). That is a property of a transaction, so these run against wallet's
// real database, for the same reason the signup tests do.

func newCreditSellerUC(db *sqlx.DB) *usecase.CreditSellerUC {
	return usecase.NewCreditSellerUC(db, accountrepo.NewAccountRepository(db), accountrepo.NewProcessedActivityRepo())
}

// seedSeller births an account for a fresh member and removes it, and any dedup
// row keyed on key, when the test ends.
func seedSeller(t *testing.T, db *sqlx.DB, key string) *account.Account {
	t.Helper()

	acc, err := account.NewAccount(uuid.New())
	require.NoError(t, err)
	require.NoError(t, accountrepo.NewAccountRepository(db).Insert(context.Background(), acc))

	memberID := acc.Snapshot().MemberID
	t.Cleanup(func() {
		cleanupExec(t, db, `DELETE FROM accounts WHERE member_id = $1`, memberID)
	})
	cleanupDedupRow(t, db, key)

	return acc
}

// cleanupDedupRow removes key's dedup row when the test ends. A leftover row would
// make a later run that reused the key report already-applied and credit nothing.
func cleanupDedupRow(t *testing.T, db *sqlx.DB, key string) {
	t.Helper()
	t.Cleanup(func() {
		cleanupExec(t, db, `DELETE FROM processed_activities WHERE idempotency_key = $1`, key)
	})
}

// cleanupExec reports a failed cleanup rather than dropping it: rows left behind
// in a shared database are how one test starts failing because of another.
func cleanupExec(t *testing.T, db *sqlx.DB, query string, args ...any) {
	t.Helper()
	_, err := db.Exec(query, args...)
	assert.NoError(t, err, "cleanup: %s", query)
}

func goldOf(t *testing.T, db *sqlx.DB, memberID uuid.UUID) int {
	t.Helper()
	var gold int
	require.NoError(t, db.Get(&gold, `SELECT gold FROM accounts WHERE member_id = $1`, memberID))
	return gold
}

// a key per test, so parallel runs and leftovers from a crashed run never collide
func settlementKey() string {
	return "settlement-" + uuid.NewString() + ":CreditSeller"
}

func TestCreditSellerUC_FirstCredit_CreditsSellerAndReturnsTheirAccount(t *testing.T) {
	db := walletDB(t)
	key := settlementKey()
	seller := seedSeller(t, db, key).Snapshot()

	accountID, err := newCreditSellerUC(db).Handle(context.Background(), &usecase.CreditSellerCommand{
		SellerID:       seller.MemberID,
		Amount:         250,
		IdempotencyKey: key,
		Now:            time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, seller.ID, accountID, "the ledger legs need the seller's account, not their member id")
	assert.Equal(t, 250, goldOf(t, db, seller.MemberID))
}

// §Req 9, 23: Temporal retrying a credit that already committed — its completion
// was lost in a crash — is the dedup's whole job. Already applied returns success
// with the first application's output, and gold moves once.
func TestCreditSellerUC_SameKeyTwice_CreditsOnceAndReturnsTheSameAccount(t *testing.T) {
	db := walletDB(t)
	key := settlementKey()
	seller := seedSeller(t, db, key).Snapshot()
	uc := newCreditSellerUC(db)
	cmd := &usecase.CreditSellerCommand{SellerID: seller.MemberID, Amount: 250, IdempotencyKey: key, Now: time.Now()}

	first, err := uc.Handle(context.Background(), cmd)
	require.NoError(t, err)
	second, err := uc.Handle(context.Background(), cmd)

	require.NoError(t, err, "already applied is success, not an error the workflow must interpret")
	assert.Equal(t, first, second, "a retry answers with the same output")
	assert.Equal(t, 250, goldOf(t, db, seller.MemberID), "the seller is credited exactly once")
}

// failingSave finds the seller for real and then fails the save — AFTER the dedup
// row was written inside the transaction. The only way to tell one transaction
// from two writes that happen to succeed.
type failingSave struct {
	*accountrepo.AccountRepository
}

func (failingSave) SaveTx(context.Context, *sqlx.Tx, *account.Account, account.AccountSnapshot) error {
	return errors.New("save failed on purpose")
}

// §Req 30, "in the same transaction". A dedup row that outlived its failed credit
// would make every retry report already-applied, and the seller would never be
// paid while the settlement looked complete.
func TestCreditSellerUC_CreditFails_LeavesNoDedupRowSoTheRetryCredits(t *testing.T) {
	db := walletDB(t)
	key := settlementKey()
	seller := seedSeller(t, db, key).Snapshot()
	cmd := &usecase.CreditSellerCommand{SellerID: seller.MemberID, Amount: 250, IdempotencyKey: key, Now: time.Now()}

	broken := usecase.NewCreditSellerUC(db, failingSave{accountrepo.NewAccountRepository(db)}, accountrepo.NewProcessedActivityRepo())
	_, err := broken.Handle(context.Background(), cmd)
	require.Error(t, err)

	_, err = newCreditSellerUC(db).Handle(context.Background(), cmd)

	require.NoError(t, err)
	assert.Equal(t, 250, goldOf(t, db, seller.MemberID), "the retry credits: the failed attempt left no row behind")
}

// A worker killed mid-activity can have Temporal start a second attempt while the
// first is still in its transaction. The primary key arbitrates; the seller is
// credited once and both attempts answer the same.
func TestCreditSellerUC_ConcurrentAttempts_CreditOnce(t *testing.T) {
	db := walletDB(t)
	key := settlementKey()
	seller := seedSeller(t, db, key).Snapshot()
	uc := newCreditSellerUC(db)
	cmd := &usecase.CreditSellerCommand{SellerID: seller.MemberID, Amount: 250, IdempotencyKey: key, Now: time.Now()}

	const attempts = 8
	var wg sync.WaitGroup
	ids := make([]uuid.UUID, attempts)
	errs := make([]error, attempts)

	for i := range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ids[i], errs[i] = uc.Handle(context.Background(), cmd)
		}()
	}
	wg.Wait()

	for i := range attempts {
		require.NoError(t, errs[i])
		assert.Equal(t, seller.ID, ids[i])
	}
	assert.Equal(t, 250, goldOf(t, db, seller.MemberID))
}

// The activity classifies a missing seller as an invariant breach by matching
// ErrNotFound, so the sentinel has to survive the trip up from the database —
// and the failed attempt must not leave a row that would later mask the credit.
func TestCreditSellerUC_SellerHasNoAccount_IsNotFoundAndLeavesNoDedupRow(t *testing.T) {
	db := walletDB(t)
	key := settlementKey()
	cleanupDedupRow(t, db, key)

	_, err := newCreditSellerUC(db).Handle(context.Background(), &usecase.CreditSellerCommand{
		SellerID: uuid.New(), Amount: 250, IdempotencyKey: key, Now: time.Now(),
	})

	assert.ErrorIs(t, err, commonconstants.ErrNotFound)

	var rows int
	require.NoError(t, db.Get(&rows, `SELECT COUNT(*) FROM processed_activities WHERE idempotency_key = $1`, key))
	assert.Zero(t, rows)
}

// An empty key is a workflow bug, and an expensive one to accept: every settlement
// carrying it would share one dedup row, so the first would be credited and every
// later seller silently reported as already paid. Refused before any write.
func TestCreditSellerUC_EmptyIdempotencyKey_IsRefusedAndCreditsNothing(t *testing.T) {
	db := walletDB(t)
	seller := seedSeller(t, db, "").Snapshot()

	_, err := newCreditSellerUC(db).Handle(context.Background(), &usecase.CreditSellerCommand{
		SellerID: seller.MemberID, Amount: 250, IdempotencyKey: "", Now: time.Now(),
	})

	assert.ErrorIs(t, err, usecase.ErrMissingIdempotencyKey)
	assert.Zero(t, goldOf(t, db, seller.MemberID))
}

// One credit must need one connection. A read outside the transaction holds the
// transaction's connection while waiting for a second, so enough concurrent credits
// would exhaust the pool with every caller waiting on another — a deadlock that only
// the activity's timeout breaks. A pool of one makes that visible as a hang.
func TestCreditSellerUC_HoldsOneConnection_CompletesOnAPoolOfOne(t *testing.T) {
	db := walletDB(t)
	key := settlementKey()
	seller := seedSeller(t, db, key).Snapshot()

	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err := newCreditSellerUC(db).Handle(ctx, &usecase.CreditSellerCommand{
		SellerID: seller.MemberID, Amount: 250, IdempotencyKey: key, Now: time.Now(),
	})

	require.NoError(t, err, "the credit must not wait on a second connection")
	assert.Equal(t, 250, goldOf(t, db, seller.MemberID))
}
