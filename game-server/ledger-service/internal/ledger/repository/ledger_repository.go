package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// OUTBOUND Adapter — the concrete implementation of the ledger.Repository PORT.
type LedgerRepository struct {
	db *sqlx.DB
}

func NewLedgerRepository(db *sqlx.DB) *LedgerRepository {
	return &LedgerRepository{
		db: db,
	}
}

type LedgerRow struct {
	ID        uuid.UUID `db:"id"`
	MemberID  uuid.UUID `db:"member_id"`
	Version   int       `db:"version"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

func (r *LedgerRepository) FindByID(ctx context.Context, id uuid.UUID) (*ledger.Ledger, error) {
	return r.findBy(ctx, "FindByID", "id", id)
}

func (r *LedgerRepository) FindByMemberID(ctx context.Context, memberID uuid.UUID) (*ledger.Ledger, error) {
	return r.findBy(ctx, "FindByMemberID", "member_id", memberID)
}

// the read runs inside a REPEATABLE READ read-only transaction so the aggregate is
// reconstituted from a single consistent snapshot. It is one table today; it stays a
// transaction because the moment the aggregate grows a child table the second SELECT
// has to see the same snapshot as the first.
func (r *LedgerRepository) findBy(ctx context.Context, op string, column string, value uuid.UUID) (*ledger.Ledger, error) {
	var row LedgerRow

	err := commonhelpers.ExecTx(ctx, r.db, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	}, func(tx *sqlx.Tx) error {
		query := fmt.Sprintf(`
	SELECT
		id,
		member_id,
		version,
		created_at,
		updated_at
	FROM ledgers
	WHERE %s = $1
	`, column)

		if err := tx.GetContext(ctx, &row, query, value); err != nil {
			return commonhelpers.WrapDBErr("ledger", op, err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	reconstituted, err := ledger.Reconstitute(ledger.ReconstituteParams{
		ID:        row.ID,
		MemberID:  row.MemberID,
		Version:   row.Version,
		CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt,
	})

	if err != nil {
		return nil, fmt.Errorf("repo %s, reconstitute : %w", op, err)
	}

	return reconstituted, nil
}

func (r *LedgerRepository) Insert(ctx context.Context, l *ledger.Ledger) error {
	snapshot := l.Snapshot()

	query := `
	INSERT INTO ledgers (id, member_id, version, created_at, updated_at)
	VALUES(:id, :member_id, :version, :created_at, :updated_at)
	`

	_, err := r.db.NamedExecContext(ctx, query, map[string]any{
		"id":         snapshot.ID,
		"member_id":  snapshot.MemberID,
		"version":    snapshot.Version,
		"created_at": snapshot.CreatedAt,
		"updated_at": snapshot.UpdatedAt,
	})

	if err != nil {
		// propogate context and sentinel errors if they match with helper
		return commonhelpers.WrapDBErr("ledger", "insert", err)
	}

	return nil
}

// Save updates the resource with any changes to the domain. Essentially an "update".
// Save must return the sentinel ErrConcurrentModification to signify a
// race error when attempting optimistic updates
// ledger/errors.go's IsRetriable and usecase/retry.go's withRetry relies on this
// to work.
//
// SCAFFOLD: the aggregate has no mutable field yet, so this writes only the OCC
// version bump under the version guard. The before/after diff (which columns and
// which child rows actually changed) gets built here alongside the first real
// domain verb — the `before` snapshot is already threaded through for it.
func (r *LedgerRepository) Save(ctx context.Context, l *ledger.Ledger, before ledger.LedgerSnapshot) error {
	after := l.Snapshot()

	if before.ID != after.ID {
		return ledger.ErrCorruptLedgerState
	}

	query := `
	UPDATE ledgers
	SET version = version + 1, updated_at = $1
	WHERE id = $2 AND version = $3
	`

	return commonhelpers.ExecTx(ctx, r.db, nil, func(tx *sqlx.Tx) error {
		res, err := tx.ExecContext(ctx, query, after.UpdatedAt, after.ID, before.Version)

		if err != nil {
			return commonhelpers.WrapDBErr("ledger", "save", err)
		}

		n, err := res.RowsAffected()

		if err != nil {
			return fmt.Errorf("ledger save, rows affected: %w", err)
		}

		// race detected
		if n == 0 {
			return ledger.ErrConcurrentModification
		}

		return nil
	})
}
