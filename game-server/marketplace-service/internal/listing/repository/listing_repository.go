package repository

import (
	"context"
	"database/sql"
	"fmt"
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
	ID         uuid.UUID             `db:"id"`
	SellerID   uuid.UUID             `db:"seller_id"`
	BuyerID    *uuid.UUID            `db:"buyer_id"`
	ItemID     uuid.UUID             `db:"item_id"`
	StartPrice int                   `db:"start_price"`
	SoldPrice  *int                  `db:"sold_price"`
	Status     listing.ListingStatus `db:"status"`
	EndsAt     time.Time             `db:"ends_at"`
	CreatedAt  time.Time             `db:"created_at"`
	UpdatedAt  time.Time             `db:"updated_at"`
	Version    int                   `db:"version"`
}

func (r *ListingRepository) FindByID(ctx context.Context, id uuid.UUID) (*listing.Listing, error) {
	var listingRow ListingRow

	err := commonhelpers.ExecTx(ctx, r.db, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	}, func(tx *sqlx.Tx) error {

		// get single listing
		listingQuery := `
		SELECT 
			id,
			seller_id,
			buyer_id,
			item_id,
			start_price,
			sold_price,
			status,
			ends_at,
			version,
			created_at,
			updated_at
		FROM listings
		WHERE id = $1
		`

		err := tx.GetContext(ctx, &listingRow, listingQuery, id)

		if err != nil {
			return commonhelpers.WrapDBErr("listing", "FindByID", err)
		}

		if err != nil {
			return commonhelpers.WrapDBErr("listing", "FindByID", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// data successfully retrieved, construct and reconstitute

	reconstitutedListing, err := listing.Reconstitute(listing.ReconstituteParams{
		ID:         listingRow.ID,
		SellerID:   listingRow.SellerID,
		BuyerID:    listingRow.BuyerID,
		ItemID:     listingRow.ItemID,
		StartPrice: listingRow.StartPrice,
		SoldPrice:  listingRow.SoldPrice,
		Status:     listingRow.Status,
		EndsAt:     listingRow.EndsAt,
		Version:    listingRow.Version,
		CreatedAt:  listingRow.CreatedAt,
		UpdatedAt:  listingRow.UpdatedAt,
	})

	if err != nil {
		return nil, fmt.Errorf("repo findById, reconstitute : %w", err)
	}

	return reconstitutedListing, nil
}

func (r *ListingRepository) Insert(ctx context.Context, listing *listing.Listing) error {
	snapshot := listing.Snapshot()

	query := `
	INSERT INTO listings (id, seller_id, buyer_id, item_id, start_price, sold_price, status, version, ends_at, created_at, updated_at)
	VALUES(:id, :seller_id, :buyer_id, :item_id, :start_price, :sold_price, :status, :version, :ends_at, :created_at, :updated_at)
	`

	_, err := r.db.NamedExecContext(ctx, query, map[string]interface{}{
		"id":          snapshot.ID,
		"seller_id":   snapshot.SellerID,
		"buyer_id":    snapshot.BuyerID,
		"item_id":     snapshot.ItemID,
		"start_price": snapshot.StartPrice,
		"sold_price":  snapshot.SoldPrice,
		"status":      snapshot.Status,
		"version":     snapshot.Version,
		"ends_at":     snapshot.EndsAt,
		"created_at":  snapshot.CreatedAt,
		"updated_at":  snapshot.UpdatedAt,
	})

	if err != nil {
		// propogate context and sentinel errors if they match with helper
		return commonhelpers.WrapDBErr("listing", "insert", err)
	}

	return nil
}

// Save updates the resource with any changes to the domain. Essentially an "update"
// save must return the senintel ErrConcurrentModification to signify a
// race error when attempting optimisitic updates
// listing/errors.go's isRetriable and usecase/retry.go's withRetry relies on this
// to work
func (r *ListingRepository) Save(ctx context.Context, l *listing.Listing, before listing.ListingSnapshot) error {
	after := l.Snapshot()

	listingQuery := `
			UPDATE listings
			SET version = version + 1, status = $1, updated_at = $2, buyer_id = $3, sold_price = $4
			WHERE id = $5 AND version = $6
		`

	return commonhelpers.ExecTx(ctx, r.db, nil, func(tx *sqlx.Tx) error {
		// -- update listing --
		res, err := tx.ExecContext(ctx, listingQuery, after.Status, after.UpdatedAt, after.BuyerID, after.SoldPrice, after.ID, before.Version)

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
	status          *listing.ListingStatus
	updatedAt       time.Time
}
