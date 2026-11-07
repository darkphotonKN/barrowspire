package outbox

import (
	"context"
	"database/sql"
	"log/slog"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

type repo struct {
	db *sqlx.DB
}

func NewRepo(db *sqlx.DB) *repo {
	return &repo{
		db: db,
	}
}

// wrapDBErr is the repo boundary translation point: it delegates to the shared
// WrapDBErr helper, which converts infrastructure errors into domain sentinels
// and wraps anything else with the repo name + operation for context.
func wrapDBErr(op string, err error) error {
	return commonhelpers.WrapDBErr("outbox repo", op, err)
}

const createOutboxQuery = `
	INSERT INTO outbox(routing_key, exchange, payload)
	VALUES(:routing_key, :exchange, :payload)
`

// a caller-derived id makes the write idempotent: writing the same row again,
// say a retry after a commit that errored but did commit, leaves one row and
// still succeeds (FS-GV8WN §B R7, ADR-0040 §2)
const createOutboxWithIDQuery = `
	INSERT INTO outbox(id, routing_key, exchange, payload)
	VALUES(:id, :routing_key, :exchange, :payload)
	ON CONFLICT (id) DO NOTHING
`

// createQuery is the insert for params: under its own id when it carries one,
// otherwise under one the database picks.
func createQuery(params OutboxParams) string {
	if params.ID == uuid.Nil {
		return createOutboxQuery
	}
	return createOutboxWithIDQuery
}

// warnIfNotWritten warns of a row given its own id that the insert skipped
// because a row under that id already exists. The write still reports success,
// as a retry should, but a collision with an unrelated row is not silent.
func warnIfNotWritten(params OutboxParams, result sql.Result) {
	if params.ID == uuid.Nil {
		return
	}
	written, err := result.RowsAffected()
	if err != nil || written > 0 {
		return
	}
	slog.Warn("outbox row already exists, not written again",
		"id", params.ID,
		"routing_key", params.RoutingKey,
	)
}

func (r *repo) CreateOutbox(ctx context.Context, params OutboxParams) error {
	result, err := r.db.NamedExecContext(ctx, createQuery(params), params)

	if err != nil {
		slog.Error("Error occured when attempting to create outbox",
			"err", err)
		return wrapDBErr("create outbox", err)
	}
	warnIfNotWritten(params, result)

	return nil
}

func (r *repo) CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params OutboxParams) error {
	result, err := tx.NamedExecContext(ctx, createQuery(params), params)

	if err != nil {
		slog.Error("Error occured when attempting to create outbox in tx",
			"err", err)
		return wrapDBErr("create outbox in tx", err)
	}
	warnIfNotWritten(params, result)

	return nil
}

// lockPendingBatchQuery locks up to $1 pending rows, oldest first. SKIP LOCKED
// skips rows another relay holds instead of waiting on them, and under READ
// COMMITTED a row another relay has meanwhile marked published is re-checked
// against the WHERE and dropped (ADR-0069 §Context).
const lockPendingBatchQuery = `
	SELECT
		id,
		routing_key,
		exchange,
		payload,
		created_at
	FROM outbox
	WHERE published_at IS NULL
	ORDER BY created_at ASC
	LIMIT $1
	FOR UPDATE SKIP LOCKED
`

const markPublishedQuery = `
	UPDATE outbox
	SET published_at = NOW()
	WHERE id = ANY($1::uuid[])
`

/**
* LockPendingBatch runs one relay batch in one transaction (ADR-0069): it locks
* up to limit pending rows (20 when nil), hands them to handle, marks the ids
* handle reports as sent as published, and commits. Every other exit rolls
* back, and the transaction is begun under ctx, so database/sql also rolls it
* back the moment ctx is done, even while handle is still blocked in a
* publish: the connection and the row locks are never held past ctx.
* Returns how many rows were marked.
**/
func (r *repo) LockPendingBatch(ctx context.Context, limit *int, handle BatchHandler) (int, error) {
	batchSize := 20
	if limit != nil {
		batchSize = *limit
	}

	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return 0, wrapDBErr("lock pending batch: begin", err)
	}
	// ends the transaction on every exit but a commit, after which it is a no-op
	defer func() { _ = tx.Rollback() }()

	var events []*OutboxEvent
	if err := tx.SelectContext(ctx, &events, lockPendingBatchQuery, batchSize); err != nil {
		slog.Error("Error occured when attempting to lock a batch of the outbox table",
			"err", err)
		return 0, wrapDBErr("lock pending batch", err)
	}
	if len(events) == 0 {
		return 0, nil
	}

	sent := handle(ctx, events)
	if len(sent) == 0 {
		return 0, nil
	}

	ids := make(pq.StringArray, 0, len(sent))
	for _, id := range sent {
		ids = append(ids, id.String())
	}
	if _, err := tx.ExecContext(ctx, markPublishedQuery, ids); err != nil {
		slog.Error("Error occured when attempting to mark an outbox batch published",
			"err", err)
		return 0, wrapDBErr("lock pending batch: mark published", err)
	}
	if err := tx.Commit(); err != nil {
		slog.Error("Error occured when attempting to commit an outbox batch",
			"err", err)
		return 0, wrapDBErr("lock pending batch: commit", err)
	}

	return len(sent), nil
}

func (r *repo) GetUnpublishedBacklog(ctx context.Context) (Backlog, error) {
	query := `
	SELECT
		COUNT(*) AS unpublished,
		COALESCE(EXTRACT(EPOCH FROM NOW() - MIN(created_at)), 0)::float8 AS oldest_age_seconds
	FROM outbox
	WHERE published_at IS NULL
	`

	var backlog Backlog
	if err := r.db.GetContext(ctx, &backlog, query); err != nil {
		slog.Error("Error occured when attempting to read the outbox backlog",
			"err", err)
		return Backlog{}, wrapDBErr("get unpublished backlog", err)
	}

	return backlog, nil
}
