package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// Page-size bounds, the same as ledger's list-entries. The gateway enforces
// them on the way in; they are repeated here so a caller that sends no limit
// (proto's zero) still gets a page.
const (
	defaultPageSize = 50
	maxPageSize     = 100
)

// ListMyListingsQuery is the READ side: it reads the table directly into a DTO
// and never loads the Listing aggregate, because no invariant is enforced on a
// read.
type ListMyListingsQuery struct {
	db *sqlx.DB
}

func NewListMyListingsQuery(db *sqlx.DB) *ListMyListingsQuery {
	return &ListMyListingsQuery{
		db: db,
	}
}

// Execute returns one page of the seller's listings in any status, newest
// first, keyset-paged on (created_at, id), each with its price facts. A nil
// cursor is the first page.
func (q *ListMyListingsQuery) Execute(ctx context.Context, sellerID uuid.UUID, c *cursor.Cursor, limit int) (*dto.ListingsPage, error) {
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
	WHERE l.seller_id = $1`

	// one row past the page tells us whether another page exists
	var args []any
	if c == nil {
		query += `
	ORDER BY l.created_at DESC, l.id DESC
	LIMIT $2`
		args = []any{sellerID, limit + 1}
	} else {
		query += ` AND (l.created_at, l.id) < ($2, $3)
	ORDER BY l.created_at DESC, l.id DESC
	LIMIT $4`
		args = []any{sellerID, c.CreatedAt, c.ID, limit + 1}
	}

	listings := make([]dto.ListingDetails, 0, limit+1)
	if err := q.db.SelectContext(ctx, &listings, query, args...); err != nil {
		return nil, commonhelpers.WrapDBErr("listings", "list my listings query", err)
	}

	page := &dto.ListingsPage{Listings: listings}
	if len(listings) > limit {
		last := listings[limit-1]
		page.NextCursor = cursor.Cursor{ID: last.ID, CreatedAt: last.CreatedAt}.Encode()
		page.Listings = listings[:limit]
	}

	return page, nil
}
