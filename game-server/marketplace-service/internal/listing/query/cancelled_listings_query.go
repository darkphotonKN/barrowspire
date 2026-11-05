package query

import (
	"context"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// CancelledListingsQuery is the withdraw backstop's read (FS-V7A5S Req 8 as
// amended 2026-11-05): withdrawn listings whose workflow is not yet marked
// started. idx_listings_withdrawal_unstarted covers exactly these rows, so the
// read stays cheap however many withdrawals have accumulated.
type CancelledListingsQuery struct {
	db *sqlx.DB
}

func NewCancelledListingsQuery(db *sqlx.DB) *CancelledListingsQuery {
	return &CancelledListingsQuery{db: db}
}

type cancelledListingRow struct {
	ID        uuid.UUID `db:"id"`
	ItemID    uuid.UUID `db:"item_id"`
	UpdatedAt time.Time `db:"updated_at"`
}

type cancelledBidRow struct {
	ID        uuid.UUID `db:"id"`
	ListingID uuid.UUID `db:"listing_id"`
}

// UnstartedCancelledListings pages CANCELLED listings whose withdrawal_started_at
// is NULL, oldest first, each with its item and every bid on it, statuses
// unfiltered. No time window: a withdrawal stays a candidate until its start is
// marked. The cursor is (updated_at, id), so listings withdrawn at the same
// instant still page without a skip or a repeat. A nil after starts from the
// first.
//
// A CANCELLED listing is final (ADR-0051), so its updated_at is the withdrawal's;
// marking the start does not move it.
func (q *CancelledListingsQuery) UnstartedCancelledListings(ctx context.Context, after *dto.CancelledListing, limit int) ([]dto.CancelledListing, error) {
	query := `
	SELECT id, item_id, updated_at
	FROM listings
	WHERE status = 'CANCELLED'
	  AND withdrawal_started_at IS NULL
	ORDER BY updated_at, id
	LIMIT $1
	`
	args := []any{limit}
	if after != nil {
		query = `
		SELECT id, item_id, updated_at
		FROM listings
		WHERE status = 'CANCELLED'
		  AND withdrawal_started_at IS NULL
		  AND (updated_at, id) > ($2, $3)
		ORDER BY updated_at, id
		LIMIT $1
		`
		args = append(args, after.UpdatedAt, after.ID)
	}

	var rows []cancelledListingRow
	if err := q.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, commonhelpers.WrapDBErr("listings", "UnstartedCancelledListings", err)
	}
	if len(rows) == 0 {
		return nil, nil
	}

	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID.String()
	}

	var bids []cancelledBidRow
	if err := q.db.SelectContext(ctx, &bids, `
		SELECT id, listing_id
		FROM bids
		WHERE listing_id = ANY($1::uuid[])
	`, pq.Array(ids)); err != nil {
		return nil, commonhelpers.WrapDBErr("bids", "UnstartedCancelledListings", err)
	}

	byListing := make(map[uuid.UUID][]uuid.UUID, len(rows))
	for _, b := range bids {
		byListing[b.ListingID] = append(byListing[b.ListingID], b.ID)
	}

	out := make([]dto.CancelledListing, len(rows))
	for i, r := range rows {
		out[i] = dto.CancelledListing{
			ID:        r.ID,
			ItemID:    r.ItemID,
			BidIDs:    byListing[r.ID],
			UpdatedAt: r.UpdatedAt,
		}
	}
	return out, nil
}
