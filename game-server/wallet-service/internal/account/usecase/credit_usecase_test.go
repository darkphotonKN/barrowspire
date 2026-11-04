package usecase_test

import (
	"context"
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

// Credit is the mailbox's gold step (FS-1GZGD §Req 23, 29; ADR-0044). Like
// CreditSeller it is a bare increment, so exactly-once rests on the dedup row and
// the credit committing in ONE transaction. That is a property of a transaction,
// so these run against wallet's real database.

func newCreditUC(db *sqlx.DB) *usecase.CreditUC {
	return usecase.NewCreditUC(db, accountrepo.NewAccountRepository(db), accountrepo.NewProcessedActivityRepo())
}

// mailKey is the key notification-service mints for one letter and one member.
// Fresh ids per test, so parallel runs and leftovers never collide.
func mailKey(memberID uuid.UUID) string {
	return "mail:" + uuid.NewString() + ":" + memberID.String()
}

// seedMember births an account for a fresh member, and removes it and the dedup
// row of the key the test will use when the test ends.
func seedMember(t *testing.T, db *sqlx.DB) (account.AccountSnapshot, string) {
	t.Helper()
	acc := seedSeller(t, db, "")
	snap := acc.Snapshot()
	key := mailKey(snap.MemberID)
	cleanupDedupRow(t, db, key)
	return snap, key
}

func dedupRows(t *testing.T, db *sqlx.DB, key string) int {
	t.Helper()
	var rows int
	require.NoError(t, db.Get(&rows, `SELECT COUNT(*) FROM processed_activities WHERE idempotency_key = $1`, key))
	return rows
}

func TestCreditUC_FirstCredit_RaisesTheMembersGoldAndReportsApplied(t *testing.T) {
	db := walletDB(t)
	member, key := seedMember(t, db)

	applied, err := newCreditUC(db).Handle(context.Background(), &usecase.CreditCommand{
		MemberID: member.MemberID, Amount: 500, IdempotencyKey: key, Now: time.Now(),
	})

	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, 500, goldOf(t, db, member.MemberID))
	assert.Equal(t, 1, dedupRows(t, db, key), "the key is recorded with the credit")
}

// Guard 4 (D20): a claim re-driven after a crash or a wallet failure re-sends the
// same key. The second call credits nothing and answers success, already applied.
func TestCreditUC_SameKeyTwice_CreditsOnceAndReportsAlreadyApplied(t *testing.T) {
	db := walletDB(t)
	member, key := seedMember(t, db)
	uc := newCreditUC(db)
	cmd := &usecase.CreditCommand{MemberID: member.MemberID, Amount: 500, IdempotencyKey: key, Now: time.Now()}

	first, err := uc.Handle(context.Background(), cmd)
	require.NoError(t, err)
	second, err := uc.Handle(context.Background(), cmd)

	require.NoError(t, err, "already applied is success, not an error the claim must interpret")
	assert.True(t, first)
	assert.False(t, second, "the retry reports the credit was already applied")
	assert.Equal(t, 500, goldOf(t, db, member.MemberID), "the member is credited exactly once")
}

// Guard 4, "in one transaction": the save fails AFTER the dedup row was written.
// A row that outlived its failed credit would make every retry report
// already-applied, and the member would never get the gold.
func TestCreditUC_CreditFailsAfterTheMark_RollsBothBackSoTheRetryCredits(t *testing.T) {
	db := walletDB(t)
	member, key := seedMember(t, db)
	cmd := &usecase.CreditCommand{MemberID: member.MemberID, Amount: 500, IdempotencyKey: key, Now: time.Now()}

	broken := usecase.NewCreditUC(db, failingSave{accountrepo.NewAccountRepository(db)}, accountrepo.NewProcessedActivityRepo())
	_, err := broken.Handle(context.Background(), cmd)
	require.Error(t, err)
	assert.Zero(t, dedupRows(t, db, key), "the mark rolled back with the failed credit")
	assert.Zero(t, goldOf(t, db, member.MemberID))

	applied, err := newCreditUC(db).Handle(context.Background(), cmd)

	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, 500, goldOf(t, db, member.MemberID))
}

// Two claims re-driving one letter at once, or a retry overlapping a slow first
// attempt. The primary key arbitrates: one applies, every other answers already
// applied, and the gold moves once.
func TestCreditUC_ConcurrentCallsWithOneKey_CreditOnce(t *testing.T) {
	db := walletDB(t)
	member, key := seedMember(t, db)
	uc := newCreditUC(db)
	cmd := &usecase.CreditCommand{MemberID: member.MemberID, Amount: 500, IdempotencyKey: key, Now: time.Now()}

	const attempts = 8
	var wg sync.WaitGroup
	applied := make([]bool, attempts)
	errs := make([]error, attempts)

	start := make(chan struct{})
	for i := range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			applied[i], errs[i] = uc.Handle(context.Background(), cmd)
		}()
	}
	close(start)
	wg.Wait()

	appliedCount := 0
	for i := range attempts {
		require.NoError(t, errs[i])
		if applied[i] {
			appliedCount++
		}
	}
	assert.Equal(t, 1, appliedCount, "exactly one call applies the credit")
	assert.Equal(t, 500, goldOf(t, db, member.MemberID))
	assert.Equal(t, 1, dedupRows(t, db, key))
}

// Distinct keys on one account are distinct credits: two letters' gold, claimed
// together, both land. They race on the account's version, so this also proves
// the OCC retry re-marks its key in the new transaction.
func TestCreditUC_ConcurrentCallsWithDifferentKeys_CreditEach(t *testing.T) {
	db := walletDB(t)
	member, _ := seedMember(t, db)
	uc := newCreditUC(db)

	const credits = 4
	keys := make([]string, credits)
	for i := range keys {
		keys[i] = mailKey(member.MemberID)
		cleanupDedupRow(t, db, keys[i])
	}

	var wg sync.WaitGroup
	errs := make([]error, credits)
	for i := range credits {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = uc.Handle(context.Background(), &usecase.CreditCommand{
				MemberID: member.MemberID, Amount: 100, IdempotencyKey: keys[i], Now: time.Now(),
			})
		}()
	}
	wg.Wait()

	for i := range credits {
		require.NoError(t, errs[i])
	}
	assert.Equal(t, 400, goldOf(t, db, member.MemberID))
}

// R24: a member with no wallet account cannot be credited. NotFound must survive
// the trip up, and the failed attempt must leave no row that would later mask
// the credit once the account exists.
func TestCreditUC_MemberHasNoAccount_IsNotFoundAndMarksNothing(t *testing.T) {
	db := walletDB(t)
	memberID := uuid.New()
	key := mailKey(memberID)
	cleanupDedupRow(t, db, key)

	applied, err := newCreditUC(db).Handle(context.Background(), &usecase.CreditCommand{
		MemberID: memberID, Amount: 500, IdempotencyKey: key, Now: time.Now(),
	})

	assert.ErrorIs(t, err, commonconstants.ErrNotFound)
	assert.False(t, applied)
	assert.Zero(t, dedupRows(t, db, key))
}

// An empty key would have every keyless credit share one dedup row; a
// non-positive amount is not a credit. Both are refused before any write: no
// gold moves and no key is marked.
func TestCreditUC_InvalidCommand_IsRefusedAndChangesNothing(t *testing.T) {
	db := walletDB(t)

	tests := []struct {
		name    string
		amount  int
		noKey   bool
		wantErr error
	}{
		{"empty key", 500, true, usecase.ErrMissingCreditKey},
		{"zero amount", 0, false, account.ErrInvalidGold},
		{"negative amount", -500, false, account.ErrInvalidGold},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			member, key := seedMember(t, db)
			if tt.noKey {
				key = ""
			}

			applied, err := newCreditUC(db).Handle(context.Background(), &usecase.CreditCommand{
				MemberID: member.MemberID, Amount: tt.amount, IdempotencyKey: key, Now: time.Now(),
			})

			assert.ErrorIs(t, err, tt.wantErr)
			assert.False(t, applied)
			assert.Zero(t, goldOf(t, db, member.MemberID))
			assert.Zero(t, dedupRows(t, db, key))
		})
	}
}

// One credit, one connection: a read outside the transaction would hold its
// connection while waiting for a second, and concurrent claims would exhaust the
// pool. A pool of one makes that visible as a hang.
func TestCreditUC_HoldsOneConnection_CompletesOnAPoolOfOne(t *testing.T) {
	db := walletDB(t)
	member, key := seedMember(t, db)

	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err := newCreditUC(db).Handle(ctx, &usecase.CreditCommand{
		MemberID: member.MemberID, Amount: 500, IdempotencyKey: key, Now: time.Now(),
	})

	require.NoError(t, err, "the credit must not wait on a second connection")
	assert.Equal(t, 500, goldOf(t, db, member.MemberID))
}
