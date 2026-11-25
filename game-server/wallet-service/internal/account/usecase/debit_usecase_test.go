package usecase_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	accountrepo "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/repository"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Debit is an in-run purchase's payment (FS-9JV5K §C R13-R15, ADR-0093). It
// mirrors Credit: exactly-once rests on the dedup row and the balance change
// committing in ONE transaction, so the transactional cases run against wallet's
// real database and skip without one. The refusals made before the mark need no
// database at all.

func newDebitUC(db *sqlx.DB) *usecase.DebitUC {
	return usecase.NewDebitUC(db, accountrepo.NewAccountRepository(db), accountrepo.NewProcessedActivityRepo())
}

// purchaseKey is the shape of key game-service derives for one purchase: the
// run, the buyer and the buyer's purchase sequence (ADR-0093). Fresh per test.
func purchaseKey(memberID uuid.UUID) string {
	return "purchase:" + uuid.NewString() + ":" + memberID.String() + ":1"
}

// debitKey is how Debit stores a caller's key in processed_activities.
func debitKey(key string) string {
	return "debit:" + key
}

// seedBuyer births an account holding gold for a fresh member, and removes it
// and the dedup row of the key the test will use when the test ends.
func seedBuyer(t *testing.T, db *sqlx.DB, gold int) (account.AccountSnapshot, string) {
	t.Helper()
	acc := seedSeller(t, db, "")
	snap := acc.Snapshot()
	_, err := db.Exec(`UPDATE accounts SET gold = $1 WHERE member_id = $2`, gold, snap.MemberID)
	require.NoError(t, err)
	key := purchaseKey(snap.MemberID)
	cleanupDedupRow(t, db, debitKey(key))
	return snap, key
}

// holdGold reserves amount of the buyer's gold for a bid, as the marketplace
// does, and removes the hold before the account when the test ends.
func holdGold(t *testing.T, db *sqlx.DB, memberID uuid.UUID, amount int) {
	t.Helper()
	bidID := uuid.New()
	require.NoError(t, usecase.NewPlaceHoldUC(accountrepo.NewAccountRepository(db)).Handle(context.Background(), &usecase.PlaceHoldCommand{
		MemberID: memberID, BidID: bidID, Gold: amount, ExpiresAt: time.Now().Add(time.Hour),
	}))
	t.Cleanup(func() {
		cleanupExec(t, db, `DELETE FROM wallet_holds WHERE bid_id = $1`, bidID)
	})
}

// debitRows counts the dedup rows a Debit with the caller's key has left.
func debitRows(t *testing.T, db *sqlx.DB, key string) int {
	t.Helper()
	var rows int
	require.NoError(t, db.Get(&rows, `SELECT COUNT(*) FROM processed_activities WHERE idempotency_key = $1`, debitKey(key)))
	return rows
}

func TestDebitUC_FreshKey_LowersTheMembersGoldAndReportsApplied(t *testing.T) {
	db := walletDB(t)
	buyer, key := seedBuyer(t, db, 500)

	applied, err := newDebitUC(db).Handle(context.Background(), &usecase.DebitCommand{
		MemberID: buyer.MemberID, Amount: 120, IdempotencyKey: key, Now: time.Now(),
	})

	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, 380, goldOf(t, db, buyer.MemberID))
	assert.Equal(t, 1, debitRows(t, db, key), "the key is recorded with the debit")
}

// ADR-0093: a retry of the same purchase carries the same key and never charges
// twice. The second call debits nothing and answers success, not applied.
func TestDebitUC_SameKeyTwice_DebitsOnceAndReportsNotApplied(t *testing.T) {
	db := walletDB(t)
	buyer, key := seedBuyer(t, db, 500)
	uc := newDebitUC(db)
	cmd := &usecase.DebitCommand{MemberID: buyer.MemberID, Amount: 120, IdempotencyKey: key, Now: time.Now()}

	first, err := uc.Handle(context.Background(), cmd)
	require.NoError(t, err)
	second, err := uc.Handle(context.Background(), cmd)

	require.NoError(t, err, "already applied is success, not an error the run must interpret")
	assert.True(t, first)
	assert.False(t, second)
	assert.Equal(t, 380, goldOf(t, db, buyer.MemberID), "the buyer is charged exactly once")
}

// R14: the debit is bounded by AVAILABLE gold. Held bid gold is not spendable, so
// a balance that covers the price only with the hold counted is refused. The
// refusal rolls the mark back: the key is not burned, and the same purchase
// applies once the gold is there.
func TestDebitUC_NotEnoughAvailableGoldWithGoldHeld_IsRefusedAndBurnsNoKey(t *testing.T) {
	db := walletDB(t)
	buyer, key := seedBuyer(t, db, 500)
	holdGold(t, db, buyer.MemberID, 450)
	uc := newDebitUC(db)
	cmd := &usecase.DebitCommand{MemberID: buyer.MemberID, Amount: 120, IdempotencyKey: key, Now: time.Now()}

	applied, err := uc.Handle(context.Background(), cmd)

	assert.ErrorIs(t, err, account.ErrHoldsExceedBalance)
	assert.False(t, applied)
	assert.Equal(t, 500, goldOf(t, db, buyer.MemberID), "the balance is untouched")
	assert.Zero(t, debitRows(t, db, key), "the key is not burned")

	_, err = db.Exec(`UPDATE accounts SET gold = gold + 100 WHERE member_id = $1`, buyer.MemberID)
	require.NoError(t, err)

	applied, err = uc.Handle(context.Background(), cmd)

	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, 480, goldOf(t, db, buyer.MemberID))
}

// "In one transaction": the save fails AFTER the dedup row was written. A row
// that outlived its failed debit would make the retry report already applied,
// and the run would grant an item that was never paid for.
func TestDebitUC_DebitFailsAfterTheMark_RollsBothBackSoTheRetryDebits(t *testing.T) {
	db := walletDB(t)
	buyer, key := seedBuyer(t, db, 500)
	cmd := &usecase.DebitCommand{MemberID: buyer.MemberID, Amount: 120, IdempotencyKey: key, Now: time.Now()}

	broken := usecase.NewDebitUC(db, failingSave{accountrepo.NewAccountRepository(db)}, accountrepo.NewProcessedActivityRepo())
	_, err := broken.Handle(context.Background(), cmd)
	require.Error(t, err)
	assert.Zero(t, debitRows(t, db, key), "the mark rolled back with the failed debit")
	assert.Equal(t, 500, goldOf(t, db, buyer.MemberID))

	applied, err := newDebitUC(db).Handle(context.Background(), cmd)

	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, 380, goldOf(t, db, buyer.MemberID))
}

// A retry overlapping a slow first attempt: the primary key arbitrates, one call
// applies, every other answers not applied, and the gold moves once.
func TestDebitUC_ConcurrentCallsWithOneKey_DebitOnce(t *testing.T) {
	db := walletDB(t)
	buyer, key := seedBuyer(t, db, 500)
	uc := newDebitUC(db)
	cmd := &usecase.DebitCommand{MemberID: buyer.MemberID, Amount: 120, IdempotencyKey: key, Now: time.Now()}

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
	assert.Equal(t, 1, appliedCount, "exactly one call applies the debit")
	assert.Equal(t, 380, goldOf(t, db, buyer.MemberID))
	assert.Equal(t, 1, debitRows(t, db, key))
}

// Two purchases at once are two debits: they race on the account's version, so
// this also proves the OCC retry re-marks its key in the new transaction.
func TestDebitUC_ConcurrentCallsWithDifferentKeys_DebitEach(t *testing.T) {
	db := walletDB(t)
	buyer, _ := seedBuyer(t, db, 500)
	uc := newDebitUC(db)

	const debits = 4
	keys := make([]string, debits)
	for i := range keys {
		keys[i] = purchaseKey(buyer.MemberID)
		cleanupDedupRow(t, db, debitKey(keys[i]))
	}

	var wg sync.WaitGroup
	errs := make([]error, debits)
	for i := range debits {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = uc.Handle(context.Background(), &usecase.DebitCommand{
				MemberID: buyer.MemberID, Amount: 100, IdempotencyKey: keys[i], Now: time.Now(),
			})
		}()
	}
	wg.Wait()

	for i := range debits {
		require.NoError(t, errs[i])
	}
	assert.Equal(t, 100, goldOf(t, db, buyer.MemberID))
}

// No account, no sale: NotFound survives the trip up, and the failed attempt
// leaves no row that would later mask the debit once the account exists.
func TestDebitUC_MemberHasNoAccount_IsNotFoundAndMarksNothing(t *testing.T) {
	db := walletDB(t)
	memberID := uuid.New()
	key := purchaseKey(memberID)
	cleanupDedupRow(t, db, debitKey(key))

	applied, err := newDebitUC(db).Handle(context.Background(), &usecase.DebitCommand{
		MemberID: memberID, Amount: 120, IdempotencyKey: key, Now: time.Now(),
	})

	assert.ErrorIs(t, err, commonconstants.ErrNotFound)
	assert.False(t, applied)
	assert.Zero(t, debitRows(t, db, key))
}

// One debit, one connection, as the credit: a read outside the transaction would
// wait on a second connection and a pool of one would hang.
func TestDebitUC_HoldsOneConnection_CompletesOnAPoolOfOne(t *testing.T) {
	db := walletDB(t)
	buyer, key := seedBuyer(t, db, 500)

	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err := newDebitUC(db).Handle(ctx, &usecase.DebitCommand{
		MemberID: buyer.MemberID, Amount: 120, IdempotencyKey: key, Now: time.Now(),
	})

	require.NoError(t, err, "the debit must not wait on a second connection")
	assert.Equal(t, 380, goldOf(t, db, buyer.MemberID))
}

// A Debit and a Credit with the same caller key are different writes: each lives
// in its own namespace, so neither reports the other as already applied.
func TestDebitUC_KeyACreditAlreadyMarked_StillDebits(t *testing.T) {
	db := walletDB(t)
	buyer, key := seedBuyer(t, db, 500)
	cleanupCreditRow(t, db, key)

	_, err := newCreditUC(db).Handle(context.Background(), &usecase.CreditCommand{
		MemberID: buyer.MemberID, Amount: 100, IdempotencyKey: key, Now: time.Now(),
	})
	require.NoError(t, err)

	applied, err := newDebitUC(db).Handle(context.Background(), &usecase.DebitCommand{
		MemberID: buyer.MemberID, Amount: 120, IdempotencyKey: key, Now: time.Now(),
	})

	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, 480, goldOf(t, db, buyer.MemberID))
}

// R14, R15: a missing key would have every keyless debit share one dedup row, and
// a non-positive amount is not a debit. Both are refused BEFORE the mark. The use
// case is built with no database and no marker, so a refusal that reached either
// would panic rather than pass: no write happens, no key is burned.
func TestDebitUC_InvalidCommand_IsRefusedBeforeTheMark(t *testing.T) {
	tests := []struct {
		name    string
		amount  int
		key     string
		wantErr error
	}{
		{"empty key", 120, "", usecase.ErrMissingDebitKey},
		{"zero amount", 0, "purchase:R:M:1", account.ErrInvalidGold},
		{"negative amount", -120, "purchase:R:M:1", account.ErrInvalidGold},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := usecase.NewDebitUC(nil, nil, nil)

			applied, err := uc.Handle(context.Background(), &usecase.DebitCommand{
				MemberID: uuid.New(), Amount: tt.amount, IdempotencyKey: tt.key, Now: time.Now(),
			})

			assert.ErrorIs(t, err, tt.wantErr)
			assert.False(t, applied)
		})
	}
}

// ========================= WITHOUT A DATABASE =========================
//
// The cases below prove the same rules with the transaction itself stubbed by
// sqlmock and the marker and accounts faked, so they run in every `make test`.
// They pin which outcome commits and which rolls back; the database cases above
// prove the rollback really takes the dedup row with it.

// fakeMarker answers the claim it was told to, and records the keys it saw.
type fakeMarker struct {
	claimed bool
	keys    []string
}

func (f *fakeMarker) MarkActivityProcessed(_ context.Context, _ *sqlx.Tx, key string) (bool, error) {
	f.keys = append(f.keys, key)
	return f.claimed, nil
}

// fakeDebitAccounts serves one account by member and records what was saved.
type fakeDebitAccounts struct {
	acc     *account.Account
	findErr error
	saved   *account.AccountSnapshot
}

func (f *fakeDebitAccounts) FindByMemberIDTx(context.Context, *sqlx.Tx, uuid.UUID) (*account.Account, error) {
	if f.findErr != nil {
		return nil, f.findErr
	}
	return f.acc, nil
}

func (f *fakeDebitAccounts) SaveTx(_ context.Context, _ *sqlx.Tx, acc *account.Account, _ account.AccountSnapshot) error {
	snap := acc.Snapshot()
	f.saved = &snap
	return nil
}

// buyerAccount is an account holding gold, with held of it reserved for a bid.
func buyerAccount(t *testing.T, gold, held int) *account.Account {
	t.Helper()
	now := time.Now()
	params := account.ReconstituteParams{ID: uuid.New(), MemberID: uuid.New(), Gold: gold, CreatedAt: now, UpdatedAt: now}
	if held > 0 {
		params.Holds = []*account.HoldReconstituteParams{{
			ID: uuid.New(), AccountID: params.ID, BidID: uuid.New(), Status: account.StatusReserved,
			Amount: held, ExpiredAt: now.Add(time.Hour), CreatedAt: now, UpdatedAt: now,
		}}
	}
	acc, err := account.Reconstitute(params)
	require.NoError(t, err)
	return acc
}

// stubTxDB is a database that only begins, commits and rolls back.
func stubTxDB(t *testing.T) (*sqlx.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return sqlx.NewDb(db, "postgres"), mock
}

func TestDebitUC_FreshKey_WithdrawsAndCommitsWithTheMark(t *testing.T) {
	db, mock := stubTxDB(t)
	mock.ExpectBegin()
	mock.ExpectCommit()
	marker := &fakeMarker{claimed: true}
	accounts := &fakeDebitAccounts{acc: buyerAccount(t, 500, 0)}

	applied, err := usecase.NewDebitUC(db, accounts, marker).Handle(context.Background(), &usecase.DebitCommand{
		MemberID: uuid.New(), Amount: 120, IdempotencyKey: "purchase:R:M:1", Now: time.Now(),
	})

	require.NoError(t, err)
	assert.True(t, applied)
	require.NotNil(t, accounts.saved)
	assert.Equal(t, 380, accounts.saved.Gold)
	assert.Equal(t, []string{"debit:purchase:R:M:1"}, marker.keys, "the key is marked in the debit namespace")
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestDebitUC_KnownKey_DebitsNothingAndReportsNotApplied(t *testing.T) {
	db, mock := stubTxDB(t)
	mock.ExpectBegin()
	mock.ExpectCommit()
	accounts := &fakeDebitAccounts{acc: buyerAccount(t, 500, 0)}

	applied, err := usecase.NewDebitUC(db, accounts, &fakeMarker{claimed: false}).Handle(context.Background(), &usecase.DebitCommand{
		MemberID: uuid.New(), Amount: 120, IdempotencyKey: "purchase:R:M:1", Now: time.Now(),
	})

	require.NoError(t, err)
	assert.False(t, applied)
	assert.Nil(t, accounts.saved, "nothing is read or saved for a key already applied")
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Every refusal after the mark rolls the transaction back, so the key is not
// burned: not enough AVAILABLE gold (the total would cover it, the hold does
// not leave enough), and no account.
func TestDebitUC_RefusalAfterTheMark_RollsBack(t *testing.T) {
	tests := []struct {
		name     string
		accounts *fakeDebitAccounts
		wantErr  error
	}{
		{"held gold leaves too little available", &fakeDebitAccounts{acc: buyerAccount(t, 500, 450)}, account.ErrHoldsExceedBalance},
		{"no account", &fakeDebitAccounts{findErr: fmt.Errorf("find: %w", commonconstants.ErrNotFound)}, commonconstants.ErrNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := stubTxDB(t)
			mock.ExpectBegin()
			mock.ExpectRollback()

			applied, err := usecase.NewDebitUC(db, tt.accounts, &fakeMarker{claimed: true}).Handle(context.Background(), &usecase.DebitCommand{
				MemberID: uuid.New(), Amount: 120, IdempotencyKey: "purchase:R:M:1", Now: time.Now(),
			})

			assert.ErrorIs(t, err, tt.wantErr)
			assert.False(t, applied)
			assert.Nil(t, tt.accounts.saved)
			assert.NoError(t, mock.ExpectationsWereMet(), "the transaction rolls back, taking the mark with it")
		})
	}
}
