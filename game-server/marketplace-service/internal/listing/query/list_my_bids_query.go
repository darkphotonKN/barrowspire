package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// ListMyBidsQuery reads a member's own bids with a summary of each bid's
// listing (FS-EYQ8K §Requirements 1–6, 8). Like ListMyListingsQuery it reads
// straight into a DTO and never loads the aggregate.
type ListMyBidsQuery struct {
	db *sqlx.DB
}

func NewListMyBidsQuery(db *sqlx.DB) *ListMyBidsQuery {
	return &ListMyBidsQuery{
		db: db,
	}
}

// Execute returns one page of the member's bids, newest placed first,
// keyset-paged on the bid's (created_at, id). A nil cursor is the first page.
//
// Only PENDING, WINNING, OUTBID, WON and LOST bids are listed: FAILED never held
// gold and CANCELLED was withdrawn. Each bid is its own row, so a member who
// raised their bid sees both. The listing's current price comes from
// priceFactsJoin, the rule every listing read uses, so it is whoever leads now.
func (q *ListMyBidsQuery) Execute(ctx context.Context, memberID uuid.UUID, c *cursor.Cursor, limit int) (*dto.MyBidsPage, error) {
	if limit < 1 {
		limit = defaultPageSize
	}
	if limit > maxPageSize {
		limit = maxPageSize
	}

	query := `
	SELECT
		mb.id,
		mb.listing_id,
		mb.amount,
		mb.status,
		mb.created_at,
		l.status       AS "listing.status",
		l.ends_at      AS "listing.ends_at",
		l.item_id      AS "listing.item_id",
		l.buyout_price AS "listing.buyout_price",
		pf.bid_count     AS "listing.bid_count",
		pf.current_price AS "listing.current_price"
	FROM bids AS mb
	JOIN listings AS l ON l.id = mb.listing_id` + priceFactsJoin + `
	WHERE mb.member_id = $1
	  AND mb.status IN ('PENDING', 'WINNING', 'OUTBID', 'WON', 'LOST')`

	// one row past the page tells us whether another page exists
	var args []any
	if c == nil {
		query += `
	ORDER BY mb.created_at DESC, mb.id DESC
	LIMIT $2`
		args = []any{memberID, limit + 1}
	} else {
		query += `
	  AND (mb.created_at, mb.id) < ($2, $3)
	ORDER BY mb.created_at DESC, mb.id DESC
	LIMIT $4`
		args = []any{memberID, c.CreatedAt, c.ID, limit + 1}
	}

	bids := make([]dto.MyBid, 0, limit+1)
	if err := q.db.SelectContext(ctx, &bids, query, args...); err != nil {
		return nil, commonhelpers.WrapDBErr("bids", "list my bids query", err)
	}

	page := &dto.MyBidsPage{Bids: bids}
	if len(bids) > limit {
		last := bids[limit-1]
		page.NextCursor = cursor.Cursor{ID: last.ID, CreatedAt: last.PlacedAt}.Encode()
		page.Bids = bids[:limit]
	}

	return page, nil
}
