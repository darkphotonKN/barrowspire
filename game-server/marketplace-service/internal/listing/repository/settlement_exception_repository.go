package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// SettlementExceptionRepository writes settlement_exceptions (FS-NXP1W Req 24):
// the record an operator reads when a settlement parks or rolls back.
type SettlementExceptionRepository struct {
	db     *sqlx.DB
	outbox OutboxTxWriter
}

// OutboxTxWriter is the one outbox call Raise makes: it writes settlement.failed
// on the same transaction as the exception it reports.
type OutboxTxWriter interface {
	CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params commonoutbox.OutboxParams) error
}

func NewSettlementExceptionRepository(db *sqlx.DB, outbox OutboxTxWriter) *SettlementExceptionRepository {
	return &SettlementExceptionRepository{
		db:     db,
		outbox: outbox,
	}
}

// Raise records an OPEN exception for (workflow, step) and, in the same
// transaction, writes whatever event eventFn asks for to the outbox. There is
// never a record without its alert, or an alert without its record.
//
// At most one exception per (workflow, step) is OPEN at a time. If one already
// is, from a retried raise or an earlier lap of the park loop, nothing new is
// recorded and eventFn sees its ID with created = false.
//
// CONTRACT: eventFn runs inside the transaction and must not perform I/O. It only
// decides: it returns the event to publish, or nil to publish nothing.
func (r *SettlementExceptionRepository) Raise(
	ctx context.Context,
	listingID uuid.UUID, workflowID, step, reason string,
	eventFn func(id uuid.UUID, created bool) (*commonoutbox.OutboxParams, error),
) (uuid.UUID, error) {
	var id uuid.UUID

	// nil options: Read Committed. The partial unique index, not a lock, keeps a
	// second OPEN row out.
	err := commonhelpers.ExecTx(ctx, r.db, nil, func(tx *sqlx.Tx) error {
		openID, created, err := r.insertOpen(ctx, tx, listingID, workflowID, step, reason)
		if err != nil {
			return err
		}

		event, err := eventFn(openID, created)
		if err != nil {
			return fmt.Errorf("settlement exception raise, event: %w", err)
		}
		if event != nil {
			if err := r.outbox.CreateOutboxTx(ctx, tx, *event); err != nil {
				return fmt.Errorf("settlement exception raise, outbox: %w", err)
			}
		}

		id = openID
		return nil
	})
	if err != nil {
		return uuid.Nil, err
	}

	return id, nil
}

// insertOpen inserts an OPEN exception, or finds the one already open for
// (workflow, step).
//
// The lookup is its own statement on purpose: when a concurrent raise holds the
// conflicting row, the INSERT waits for it to commit, and only a fresh snapshot
// taken after that wait can see it.
func (r *SettlementExceptionRepository) insertOpen(ctx context.Context, tx *sqlx.Tx, listingID uuid.UUID, workflowID, step, reason string) (id uuid.UUID, created bool, err error) {
	insert := `
		INSERT INTO settlement_exceptions (listing_id, workflow_id, step, reason)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (workflow_id, step) WHERE status = 'OPEN' DO NOTHING
		RETURNING id
	`

	err = tx.GetContext(ctx, &id, insert, listingID, workflowID, step, reason)
	if err == nil {
		return id, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return uuid.Nil, false, commonhelpers.WrapDBErr("settlement exception", "insert open", err)
	}

	existing := `
		SELECT id
		FROM settlement_exceptions
		WHERE workflow_id = $1
		AND step = $2
		AND status = 'OPEN'
	`

	if err := tx.GetContext(ctx, &id, existing, workflowID, step); err != nil {
		return uuid.Nil, false, commonhelpers.WrapDBErr("settlement exception", "find open", err)
	}

	return id, false, nil
}

// Resolve marks an exception RESOLVED once its step has succeeded. Resolving an
// already resolved exception is success, so a retried resolve changes nothing. A
// missing exception is commonerr.ErrNotFound.
func (r *SettlementExceptionRepository) Resolve(ctx context.Context, id uuid.UUID) error {
	resolve := `
		UPDATE settlement_exceptions
		SET status = 'RESOLVED',
			resolved_at = CURRENT_TIMESTAMP
		WHERE id = $1
		AND status = 'OPEN'
	`

	res, err := r.db.ExecContext(ctx, resolve, id)
	if err != nil {
		return commonhelpers.WrapDBErr("settlement exception", "resolve", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("settlement exception resolve, rows affected: %w", err)
	}
	if n > 0 {
		return nil
	}

	exists := `SELECT EXISTS (SELECT 1 FROM settlement_exceptions WHERE id = $1)`

	var found bool
	if err := r.db.GetContext(ctx, &found, exists, id); err != nil {
		return commonhelpers.WrapDBErr("settlement exception", "resolve, exists check", err)
	}
	if !found {
		return fmt.Errorf("settlement exception %v: %w", id, commonerr.ErrNotFound)
	}

	// already resolved
	return nil
}
