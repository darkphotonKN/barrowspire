package repository

import (
	"context"
	"errors"
	"sync"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Append (requires the ledger dev database) ---

// A re-post of an already-recorded transaction is a no-op success: the first
// append applies, the second reports applied=false with no error, and the row
// counts stay at one parent and its two legs (§Req 12).
func TestAppend_RepostOfRecordedTransaction_IsNoOpSuccess(t *testing.T) {
	db := roundTripDB(t)
	repo := NewLedgerRepository(db)
	ctx := context.Background()

	transaction := settlementTransaction(t, uuid.New(), uuid.New(), uuid.New(), uuid.New())

	applied, err := repo.Append(ctx, transaction)
	require.NoError(t, err)
	assert.True(t, applied, "first append must apply")

	applied, err = repo.Append(ctx, transaction)
	require.NoError(t, err)
	assert.False(t, applied, "re-post must be a no-op, not a second write")

	assertRowCounts(t, db, transaction, 1, 2)
}

// All legs commit together or none do (§Req 7-8). The second leg is made
// unwritable by a CHECK added to the isolated test schema only, so the parent
// and the first leg reach the database before the failure; zero rows may remain.
func TestAppend_SecondLegInsertFails_LeavesNoRows(t *testing.T) {
	db := roundTripDB(t)
	repo := NewLedgerRepository(db)
	ctx := context.Background()

	poisoned := uuid.New()

	_, err := db.ExecContext(ctx, `ALTER TABLE ledger_entries
	ADD CONSTRAINT ledger_entries_reject_poisoned_account CHECK (account_id <> '`+poisoned.String()+`')`)
	require.NoError(t, err)

	transaction := settlementTransaction(t, uuid.New(), uuid.New(), uuid.New(), poisoned)

	applied, err := repo.Append(ctx, transaction)
	require.Error(t, err)
	assert.False(t, applied)

	assertRowCounts(t, db, transaction, 0, 0)
}

// Two identical posts racing each other produce exactly one set of rows. This
// is what proves idempotency is enforced by the unique key rather than by a
// read-then-write, which would let both land (§Req 13, §Edge States).
func TestAppend_ConcurrentIdenticalPosts_WriteExactlyOneSet(t *testing.T) {
	db := roundTripDB(t)
	repo := NewLedgerRepository(db)
	ctx := context.Background()

	transaction := settlementTransaction(t, uuid.New(), uuid.New(), uuid.New(), uuid.New())

	const posters = 2

	start := make(chan struct{})
	results := make([]bool, posters)
	errs := make([]error, posters)

	var wg sync.WaitGroup
	for i := range posters {
		wg.Add(1)

		go func() {
			defer wg.Done()
			<-start
			results[i], errs[i] = repo.Append(ctx, transaction)
		}()
	}

	close(start)
	wg.Wait()

	for i, err := range errs {
		require.NoError(t, err, "poster %d", i)
	}

	appliedCount := 0
	for _, applied := range results {
		if applied {
			appliedCount++
		}
	}
	assert.Equal(t, 1, appliedCount, "exactly one poster may apply; got %v", results)

	assertRowCounts(t, db, transaction, 1, 2)
}

// A different transaction_id settling the same reference is not a re-post: it is
// a second settlement of one event, which the partial unique index (000003)
// refuses. It must surface as the duplicate sentinel, never as applied=false,
// or a double settlement would be reported as a harmless retry.
func TestAppend_SecondSettlementOfSameReference_ReturnsDuplicateResource(t *testing.T) {
	db := roundTripDB(t)
	repo := NewLedgerRepository(db)
	ctx := context.Background()

	referenceID := uuid.New()

	first := settlementTransaction(t, uuid.New(), referenceID, uuid.New(), uuid.New())
	applied, err := repo.Append(ctx, first)
	require.NoError(t, err)
	require.True(t, applied)

	second := settlementTransaction(t, uuid.New(), referenceID, uuid.New(), uuid.New())
	applied, err = repo.Append(ctx, second)
	require.Error(t, err)
	assert.True(t, errors.Is(err, commonconstants.ErrDuplicateResource), "want ErrDuplicateResource, got %v", err)
	assert.False(t, applied)

	assertRowCounts(t, db, second, 0, 0)
}

// --- helpers ---

// settlementTransaction builds a balanced two-leg SETTLEMENT in GOLD through
// the domain constructor, so the tests only ever append what the domain allows.
func settlementTransaction(t *testing.T, transactionID, referenceID, debitAccount, creditAccount uuid.UUID) *ledger.Transaction {
	t.Helper()

	transaction, err := ledger.NewTransaction(transactionID, referenceID, ledger.ReasonSettlement, ledger.CurrencyGold, []ledger.LegInput{
		{AccountID: debitAccount, Direction: ledger.DirectionDebit, Amount: 1250},
		{AccountID: creditAccount, Direction: ledger.DirectionCredit, Amount: 1250},
	})
	require.NoError(t, err)

	return transaction
}

func assertRowCounts(t *testing.T, db *sqlx.DB, transaction *ledger.Transaction, wantParents, wantEntries int) {
	t.Helper()

	id := transaction.Snapshot().TransactionID
	ctx := context.Background()

	var parents int
	require.NoError(t, db.GetContext(ctx, &parents,
		`SELECT count(*) FROM ledger_transactions WHERE transaction_id = $1`, id))
	assert.Equal(t, wantParents, parents, "ledger_transactions rows")

	var entries int
	require.NoError(t, db.GetContext(ctx, &entries,
		`SELECT count(*) FROM ledger_entries WHERE transaction_id = $1`, id))
	assert.Equal(t, wantEntries, entries, "ledger_entries rows")
}
