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
	"github.com/lib/pq"
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

type BidRow struct {
	ID        uuid.UUID `db:"id"`
	ListingID uuid.UUID `db:"listing_id"`
	MemberID  uuid.UUID `db:"member_id"`
	Type      string    `db:"type"`
	Amount    int       `db:"amount"`
	Status    string    `db:"status"`
	// nullable: bids written before the saga migration have no key, and callers
	// are not required to supply one
	IdempotencyKey *uuid.UUID `db:"idempotency_key"`
	CreatedAt      time.Time  `db:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at"`
}

func (r *ListingRepository) FindByID(ctx context.Context, id uuid.UUID) (*listing.Listing, error) {
	var listingRow ListingRow
	var bidRows []BidRow

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

		bidsQuery := `
		SELECT
			id,
			listing_id,
			member_id,
			type,
			amount,
			status,
			idempotency_key,
			created_at,
			updated_at
		FROM bids
		WHERE listing_id = $1
		`

		err = tx.SelectContext(ctx, &bidRows, bidsQuery, id)
		if err != nil {
			return commonhelpers.WrapDBErr("listing", "FindByID", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return reconstitute(listingRow, bidRows)
}

// reconstitute rebuilds the aggregate from persisted rows. Shared by FindByID
// and Modify so the two load paths cannot drift apart.
func reconstitute(listingRow ListingRow, bidRows []BidRow) (*listing.Listing, error) {
	reconstitutedBids := make([]*listing.BidReconstituteParams, 0, len(bidRows))

	for _, bid := range bidRows {
		// a NULL key means the bid was placed without one; uuid.Nil is how the
		// domain spells that, and it never matches another bid's key
		var idempotencyKey uuid.UUID
		if bid.IdempotencyKey != nil {
			idempotencyKey = *bid.IdempotencyKey
		}

		reconstitutedBids = append(reconstitutedBids, &listing.BidReconstituteParams{
			ID:             bid.ID,
			ListingID:      bid.ListingID,
			MemberID:       bid.MemberID,
			Type:           listing.BidType(bid.Type),
			Amount:         bid.Amount,
			Status:         listing.BidStatus(bid.Status),
			IdempotencyKey: idempotencyKey,
			CreatedAt:      bid.CreatedAt,
			UpdatedAt:      bid.UpdatedAt,
		})
	}

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
		Bids:       reconstitutedBids,
		CreatedAt:  listingRow.CreatedAt,
		UpdatedAt:  listingRow.UpdatedAt,
	})
	if err != nil {
		return nil, fmt.Errorf("repo reconstitute: %w", err)
	}

	return reconstitutedListing, nil
}

// Modify runs a load-modify-save cycle for one listing inside a single
// transaction, holding a row lock for its whole duration.
//
// This is what makes the lock meaningful. FindByID and Save each open their own
// transaction, so a lock taken during the read is released long before the write
// — leaving the window that OCC and withRetry exist to paper over. Here the
// SELECT ... FOR UPDATE, the domain mutation and the write all sit in one
// transaction, so concurrent bidders queue instead of racing and retrying.
//
// fn receives the reconstituted aggregate and mutates it in memory. It must not
// perform I/O: it runs with the row locked, and anything slow there blocks every
// other writer on that listing.
func (r *ListingRepository) Modify(ctx context.Context, id uuid.UUID, fn func(*listing.Listing) error) error {
	return commonhelpers.ExecTx(ctx, r.db, nil, func(tx *sqlx.Tx) error {
		var listingRow ListingRow
		var bidRows []BidRow

		// FOR UPDATE on the listing row alone is enough: every write to this
		// aggregate's bids goes through its listing, so serialising on the parent
		// serialises the children too.
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
		FOR UPDATE
		`

		if err := tx.GetContext(ctx, &listingRow, listingQuery, id); err != nil {
			return commonhelpers.WrapDBErr("listing", "Modify", err)
		}

		bidsQuery := `
		SELECT
			id,
			listing_id,
			member_id,
			type,
			amount,
			status,
			idempotency_key,
			created_at,
			updated_at
		FROM bids
		WHERE listing_id = $1
		`

		if err := tx.SelectContext(ctx, &bidRows, bidsQuery, id); err != nil {
			return commonhelpers.WrapDBErr("listing", "Modify", err)
		}

		listingDomain, err := reconstitute(listingRow, bidRows)
		if err != nil {
			return err
		}

		before := listingDomain.Snapshot()

		if err := fn(listingDomain); err != nil {
			return err
		}

		after := listingDomain.Snapshot()

		changes := r.diffListing(&before, &after)
		if changes == nil {
			return listing.ErrCorruptListingState
		}

		// fn may legitimately be a no-op — an idempotent replay changes nothing,
		// and writing anyway would bump the version for no reason
		if changes.IsEmpty() {
			return nil
		}

		return r.writeChanges(ctx, tx, &after, changes, false)
	})
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

	// diff listing
	changes := r.diffListing(&before, &after)

	// not possible in practice, but guard for exceptions
	if changes == nil {
		return listing.ErrCorruptListingState
	}

	if changes.IsEmpty() {
		return nil
	}

	slog.Debug("checking listing changes in save method", "changes", changes)

	return commonhelpers.ExecTx(ctx, r.db, nil, func(tx *sqlx.Tx) error {
		return r.writeChanges(ctx, tx, &after, changes, true)
	})
}

// writeChanges persists a computed diff inside an existing transaction.
//
// checkVersion selects the concurrency strategy. Save passes true: it runs
// outside any lock, so the UPDATE carries WHERE version = $expected and a zero
// row count means another writer won the race. Modify passes false because it
// already holds a row lock — the version still advances, but no writer can have
// slipped in between the read and this write.
//
// The statement order is load-bearing and must not be rearranged: bid status
// updates run BEFORE new bid inserts, because a placement demotes the previous
// leader and inserts the new one. Inserting first collides with
// idx_bids_single_winner while the old WINNING row is still current.
func (r *ListingRepository) writeChanges(ctx context.Context, tx *sqlx.Tx, after *listing.ListingSnapshot, changes *ListingChanges, checkVersion bool) error {
	{
		listingQuery := `
			UPDATE listings
			SET version = version + 1, status = $1, updated_at = $2, buyer_id = $3, sold_price = $4
			WHERE id = $5 AND version = $6
		`
		args := []any{after.Status, after.UpdatedAt, after.BuyerID, after.SoldPrice, after.ID, changes.expectedVersion}

		if !checkVersion {
			listingQuery = `
			UPDATE listings
			SET version = version + 1, status = $1, updated_at = $2, buyer_id = $3, sold_price = $4
			WHERE id = $5
		`
			args = args[:5]
		}

		// -- update listing --
		res, err := tx.ExecContext(ctx, listingQuery, args...)
		if err != nil {
			return commonhelpers.WrapDBErr("listing", "save", err)
		}

		n, err := res.RowsAffected()
		if err != nil {
			return fmt.Errorf("listing save, rows affected: %w", err)
		}

		// race detected — only meaningful when the version guard was applied;
		// under a row lock a zero count would mean the row vanished
		if n == 0 {
			return listing.ErrConcurrentModification
		}
	}

	if len(changes.bidsUpdated) != 0 {
		// create unnest required vertical slices
		ids := make([]string, 0, len(changes.bidsUpdated))
		statuses := make([]string, 0, len(changes.bidsUpdated))
		updatedAts := make([]time.Time, 0, len(changes.bidsUpdated))

		for _, bid := range changes.bidsUpdated {
			ids = append(ids, bid.id.String())
			statuses = append(statuses, string(*bid.status))
			updatedAts = append(updatedAts, bid.updatedAt)
		}

		changedBidsQuery := `
			UPDATE bids b
			SET status = v.status,
				updated_at = v.updated_at
			FROM unnest($1::uuid[], $2::text[], $3::timestamptz[])
			AS v(id, status, updated_at)
			WHERE v.id = b.id
			`

		if _, err := tx.ExecContext(ctx, changedBidsQuery, pq.Array(ids), pq.Array(statuses), pq.Array(updatedAts)); err != nil {
			return commonhelpers.WrapDBErr("listing", "save", err)
		}
	}

	// -- insert new bids --
	if len(changes.newBids) != 0 {
		newBidsQuery := `
			INSERT INTO bids (id, listing_id, member_id, type, amount, status, idempotency_key, created_at, updated_at)
			VALUES (:id, :listing_id, :member_id, :type, :amount, :status, :idempotency_key, :created_at, :updated_at)
			`

		if _, err := tx.NamedExecContext(ctx, newBidsQuery, changes.newBids); err != nil {
			return commonhelpers.WrapDBErr("listing", "save", err)
		}
	}

	return nil
}

type ListingChanges struct {
	// listing changes
	expectedVersion int
	status          *listing.ListingStatus
	buyerID         *uuid.UUID
	soldPrice       *int
	bidsUpdated     []*bidChanges
	newBids         []*BidRow
}

func (c *ListingChanges) IsEmpty() bool {
	return c.status == nil &&
		c.buyerID == nil &&
		c.soldPrice == nil &&
		len(c.bidsUpdated) == 0 &&
		len(c.newBids) == 0
}

type bidChanges struct {
	id        uuid.UUID // id to track which bids changed
	status    *listing.BidStatus
	updatedAt time.Time
}

func (r *ListingRepository) diffListing(before, after *listing.ListingSnapshot) *ListingChanges {
	if before == nil || after == nil {
		return nil
	}

	changes := &ListingChanges{}

	if before.Status != after.Status {
		changes.status = &after.Status
	}

	if before.SoldPrice == nil && after.SoldPrice != nil {
		changes.soldPrice = after.SoldPrice
	}

	if before.BuyerID == nil && after.BuyerID != nil {
		changes.buyerID = after.BuyerID
	}

	newBids := make([]*BidRow, 0)
	updatedBids := make([]*bidChanges, 0)

	seen := make(map[uuid.UUID]listing.BidSnapshot)

	for _, bid := range before.Bids {
		seen[bid.ID] = bid
	}

	for _, afterBid := range after.Bids {
		if beforeBid, ok := seen[afterBid.ID]; !ok {
			newBids = append(newBids, &BidRow{
				ID:        afterBid.ID,
				ListingID: afterBid.ListingID,
				MemberID:  afterBid.MemberID,
				Type:      string(afterBid.Type),
				Amount:    afterBid.Amount,
				Status:    string(afterBid.Status),
				CreatedAt: afterBid.CreatedAt,
				UpdatedAt: afterBid.UpdatedAt,
			})
		} else {
			if afterBid.Status == beforeBid.Status {
				continue
			}

			updatedBids = append(updatedBids, &bidChanges{
				id:        afterBid.ID,
				status:    &afterBid.Status,
				updatedAt: afterBid.UpdatedAt,
			})
		}
	}

	changes.newBids = newBids
	changes.bidsUpdated = updatedBids
	changes.expectedVersion = before.Version

	return changes
}
