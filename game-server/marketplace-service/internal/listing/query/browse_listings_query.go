package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/jmoiron/sqlx"
)

// BrowseListingsQuery reads every seller's live auctions, soonest-ending first
// (FS-8EGFA §Requirements 3). Like ListMyListingsQuery it reads the table
// straight into a DTO and never loads the aggregate.
type BrowseListingsQuery struct {
	db *sqlx.DB
}

func NewBrowseListingsQuery(db *sqlx.DB) *BrowseListingsQuery {
	return &BrowseListingsQuery{
		db: db,
	}
}

// Execute returns one page of live auctions — ACTIVE and not yet past ends_at —
// keyset-paged on (ends_at, id) ascending, each with its price facts. A nil
// cursor is the first page.
//
// "Live" is judged by the database clock, so a listing that ends between two
// pages simply drops out of the later one; the keyset never repeats a row.
func (q *BrowseListingsQuery) Execute(ctx context.Context, c *cursor.EndsAt, limit int) (*dto.ListingsPage, error) {
	if limit < 1 {
		limit = defaultPageSize
	}
	if limit > maxPageSize {
		limit = maxPageSize
	}

	query := `
	SELECT
		l.id,
		l.seller_id,
		l.buyer_id,
		l.item_id,
		l.start_price,
		l.sold_price,
		l.status,
		l.ends_at,
		l.created_at,
		l.updated_at,` + priceFactsColumns + `
	FROM listings AS l` + priceFactsJoin + `
	WHERE l.status = 'ACTIVE'
	  AND l.ends_at > now()`

	// one row past the page tells us whether another page exists
	var args []any
	if c == nil {
		query += `
	ORDER BY l.ends_at ASC, l.id ASC
	LIMIT $1`
		args = []any{limit + 1}
	} else {
		query += `
	  AND (l.ends_at, l.id) > ($1, $2)
	ORDER BY l.ends_at ASC, l.id ASC
	LIMIT $3`
		args = []any{c.EndsAt, c.ID, limit + 1}
	}

	listings := make([]dto.ListingDetails, 0, limit+1)
	if err := q.db.SelectContext(ctx, &listings, query, args...); err != nil {
		return nil, commonhelpers.WrapDBErr("listings", "browse listings query", err)
	}

	page := &dto.ListingsPage{Listings: listings}
	if len(listings) > limit {
		last := listings[limit-1]
		page.NextCursor = cursor.EndsAt{ID: last.ID, EndsAt: last.EndsAt}.Encode()
		page.Listings = listings[:limit]
	}

	return page, nil
}
