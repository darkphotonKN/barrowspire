package repository

import (
	"context"
	"errors"
	"testing"

	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newException is one raise's worth of arguments.
type newException struct {
	ListingID  uuid.UUID
	WorkflowID string
	Step       string
	Reason     string
}

func newExceptionRepo(db *sqlx.DB) *SettlementExceptionRepository {
	return NewSettlementExceptionRepository(db, commonoutbox.NewRepo(db))
}

// noEvent publishes nothing and records whether the exception was new.
func noEvent(created *bool) func(uuid.UUID, bool) (*commonoutbox.OutboxParams, error) {
	return func(_ uuid.UUID, c bool) (*commonoutbox.OutboxParams, error) {
		*created = c
		return nil, nil
	}
}

func raise(t *testing.T, ctx context.Context, repo *SettlementExceptionRepository, e newException) (uuid.UUID, bool) {
	t.Helper()

	var created bool
	id, err := repo.Raise(ctx, e.ListingID, e.WorkflowID, e.Step, e.Reason, noEvent(&created))
	require.NoError(t, err)

	return id, created
}

type exceptionRow struct {
	Status     string  `db:"status"`
	ResolvedAt *string `db:"resolved_at"`
}

func readException(t *testing.T, ctx context.Context, db *sqlx.DB, id uuid.UUID) exceptionRow {
	t.Helper()

	var row exceptionRow
	require.NoError(t, db.GetContext(ctx, &row, `SELECT status, resolved_at::text FROM settlement_exceptions WHERE id = $1`, id))
	return row
}

func countRows(t *testing.T, ctx context.Context, db *sqlx.DB, query string, args ...any) int {
	t.Helper()

	var n int
	require.NoError(t, db.GetContext(ctx, &n, query, args...))
	return n
}

func sampleException() newException {
	return newException{
		ListingID:  uuid.New(),
		WorkflowID: "settlement-" + uuid.NewString(),
		Step:       "TransferItem",
		Reason:     "items-service unavailable for 30m",
	}
}

// A park loop raises again for the same step on every lap, and the raise itself
// is retried without a cap: neither may add a second OPEN row.
func TestSettlementExceptionRepository_Raise_OneOpenPerStep(t *testing.T) {
	db := repositoryDB(t)
	ctx := context.Background()
	repo := newExceptionRepo(db)

	e := sampleException()

	first, created := raise(t, ctx, repo, e)
	assert.True(t, created, "the first raise records an exception")
	assert.Equal(t, "OPEN", readException(t, ctx, db, first).Status)

	again, created := raise(t, ctx, repo, e)
	assert.False(t, created, "a repeat raise for the same step records nothing new")
	assert.Equal(t, first, again, "a repeat raise answers with the open exception")

	otherStep := e
	otherStep.Step = "AppendLedgerTx"
	other, created := raise(t, ctx, repo, otherStep)
	assert.True(t, created, "another step of the same workflow is its own exception")
	assert.NotEqual(t, first, other)

	require.NoError(t, repo.Resolve(ctx, first))
	reopened, created := raise(t, ctx, repo, e)
	assert.True(t, created, "once resolved, the same step failing again is a new exception")
	assert.NotEqual(t, first, reopened)
}

// The event eventFn returns lands in the outbox with the exception, and eventFn
// sees the ID it is reporting.
func TestSettlementExceptionRepository_Raise_WritesTheEventToTheOutbox(t *testing.T) {
	db := repositoryDB(t)
	ctx := context.Background()
	repo := newExceptionRepo(db)

	var sawID uuid.UUID
	id, err := repo.Raise(ctx, uuid.New(), "settlement-"+uuid.NewString(), "CreditSeller", "wallet down",
		func(id uuid.UUID, created bool) (*commonoutbox.OutboxParams, error) {
			sawID = id
			return &commonoutbox.OutboxParams{
				Exchange:   "marketplace.events",
				RoutingKey: "settlement.failed",
				Payload:    []byte(id.String()),
			}, nil
		})
	require.NoError(t, err)

	assert.Equal(t, id, sawID)
	assert.Equal(t, 1, countRows(t, ctx, db,
		`SELECT count(*) FROM outbox WHERE exchange = 'marketplace.events' AND routing_key = 'settlement.failed' AND payload = $1`,
		[]byte(id.String())))
}

// One transaction: if the event cannot be built, the exception is not recorded
// either, and the raise can be retried from clean.
func TestSettlementExceptionRepository_Raise_RollsBackTogether(t *testing.T) {
	db := repositoryDB(t)
	ctx := context.Background()
	repo := newExceptionRepo(db)

	e := sampleException()
	boom := errors.New("cannot marshal event")

	_, err := repo.Raise(ctx, e.ListingID, e.WorkflowID, e.Step, e.Reason,
		func(uuid.UUID, bool) (*commonoutbox.OutboxParams, error) { return nil, boom })

	assert.ErrorIs(t, err, boom)
	assert.Zero(t, countRows(t, ctx, db, `SELECT count(*) FROM settlement_exceptions WHERE workflow_id = $1`, e.WorkflowID),
		"no exception without its event")
	assert.Zero(t, countRows(t, ctx, db, `SELECT count(*) FROM outbox`))
}

func TestSettlementExceptionRepository_Resolve(t *testing.T) {
	db := repositoryDB(t)
	ctx := context.Background()
	repo := newExceptionRepo(db)

	e := sampleException()
	e.Step = "CreditSeller"
	id, _ := raise(t, ctx, repo, e)

	require.NoError(t, repo.Resolve(ctx, id))
	row := readException(t, ctx, db, id)
	assert.Equal(t, "RESOLVED", row.Status)
	require.NotNil(t, row.ResolvedAt)
	resolvedAt := *row.ResolvedAt

	require.NoError(t, repo.Resolve(ctx, id), "resolving twice is success")
	assert.Equal(t, resolvedAt, *readException(t, ctx, db, id).ResolvedAt, "a repeat resolve changes nothing")

	assert.ErrorIs(t, repo.Resolve(ctx, uuid.New()), commonerr.ErrNotFound)
}
