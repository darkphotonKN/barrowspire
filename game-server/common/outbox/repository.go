package outbox

import (
	"context"
	"database/sql"
	"log/slog"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
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

func (r *repo) UpdateOutboxToPublished(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE 
			outbox
		SET published_at = NOW()
		WHERE id = $1
	`
	results, err := r.db.ExecContext(ctx, query, id)

	if err != nil {
		slog.Error("Error occured when attempting to update published on outbox item",
			"err", err)
		return wrapDBErr("update outbox to published", err)
	}

	rows, _ := results.RowsAffected()
	if rows == 0 {
		return commonconstants.ErrOutboxItemNotFound
	}

	return nil
}

func (r *repo) GetUnpublishedOutboxItems(ctx context.Context, limit *int) ([]*OutboxEvent, error) {

	defaultLimit := 20
	if limit == nil {
		limit = &defaultLimit
	}

	var outboxItem []*OutboxEvent

	query := `
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
	`

	err := r.db.SelectContext(ctx, &outboxItem, query, *limit)

	if err != nil {
		slog.Error("Error occured when attempting to retrive from outbox table",
			"err", err)
		return nil, wrapDBErr("get unpublished outbox items", err)
	}

	return outboxItem, nil
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
