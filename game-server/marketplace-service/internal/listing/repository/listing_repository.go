package repository

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type ListingRepository struct {
	db *sqlx.DB
}

func NewListingRepository(db *sqlx.DB) *ListingRepository {
	return &ListingRepository{
		db: db,
	}
}

type ListingRow struct {
	ID        uuid.UUID `db:"id"`
	MemberID  uuid.UUID `db:"member_id"`
	Gold      int       `db:"gold"`
	Version   int       `db:"version"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

// FindByID(ctx context.Context, id uuid.UUID) (*Account, error)
func (r *ListingRepository) FindByID(ctx context.Context, id uuid.UUID) (*listing.Listing, error) {
	var acc ListingRow
	// var holds []HoldsRow

	err := commonhelpers.ExecTx(ctx, r.db, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	}, func(tx *sqlx.Tx) error {

		// get single account
		accountQuery := `
	SELECT 
		id,
		member_id,
		gold,
		version,
		created_at,
		updated_at
	FROM accounts
	WHERE id = $1
	`

		err := tx.GetContext(ctx, &acc, accountQuery, id)

		if err != nil {
			return commonhelpers.WrapDBErr("account", "FindByID", err)
		}

		if err != nil {
			return commonhelpers.WrapDBErr("account", "FindByID", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// data successfully retrieved, construct and reconstitute

	reconstitutedAcc, err := listing.Reconstitute(listing.ReconstituteParams{
		ID:       acc.ID,
		MemberID: acc.MemberID,
		Version:  acc.Version,
		// Holds:     reconstitutedHolds,
		CreatedAt: acc.CreatedAt,
		UpdatedAt: acc.UpdatedAt,
	})

	if err != nil {
		return nil, fmt.Errorf("repo findById, reconstitute : %w", err)
	}

	return reconstitutedAcc, nil
}

func (r *ListingRepository) Insert(ctx context.Context, account *listing.Listing) error {
	snapshot := account.Snapshot()

	query := `
	INSERT INTO accounts (id, member_id, gold, version, created_at, updated_at)
	VALUES(:id, :member_id, :gold, :version, :created_at, :updated_at)
	`

	_, err := r.db.NamedExecContext(ctx, query, map[string]interface{}{
		"id":         snapshot.ID,
		"member_id":  snapshot.MemberID,
		"name":       snapshot.Name,
		"version":    snapshot.Version,
		"created_at": snapshot.CreatedAt,
		"updated_at": snapshot.UpdatedAt,
	})

	if err != nil {
		// propogate context and sentinel errors if they match with helper
		return commonhelpers.WrapDBErr("account", "insert", err)
	}

	return nil
}

// Save updates the resource with any changes to the domain. Essentially an "update"
// save must return the senintel ErrConcurrentModification to signify a
// race error when attempting optimisitic updates
// account/errors.go's isRetriable and usecase/retry.go's withRetry relies on this
// to work
func (r *ListingRepository) Save(ctx context.Context, l *listing.Listing, before listing.ListingSnapshot) error {
	after := l.Snapshot()

	// diff account
	changes := r.diffAccount(&before, &after)

	// not possible in practice, but guard for exceptions
	if changes == nil {
		return listing.ErrCorruptListingState
	}

	slog.Debug("checking account changes in save method", "changes", changes)

	accountQuery := `
	UPDATE accounts
	SET gold = $1, version = version + 1, updated_at = $2
	WHERE id = $3 AND version = $4
	`

	return commonhelpers.ExecTx(ctx, r.db, nil, func(tx *sqlx.Tx) error {
		// -- update account --
		res, err := tx.ExecContext(ctx, accountQuery, after.UpdatedAt, after.ID, changes.expectedVersion)

		if err != nil {
			return commonhelpers.WrapDBErr("listing", "save", err)
		}

		n, err := res.RowsAffected()

		if err != nil {
			return fmt.Errorf("listing save, rows affected: %w", err)
		}

		// race detected
		if n == 0 {
			return listing.ErrConcurrentModification
		}

		return nil
	})

}

type ListingChanges struct {
	expectedVersion int
}

func (r *ListingRepository) diffAccount(before, after *listing.ListingSnapshot) *ListingChanges {
	if before == nil || after == nil {
		return nil
	}

	changes := &ListingChanges{}

	// --- listing differences ---

	changes.expectedVersion = before.Version

	return changes
}
