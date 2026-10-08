package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// GetListingQuery reads one listing in any status, with its price facts
// (FS-8EGFA §Requirements 4). Like the other reads it goes straight to a DTO and
// never loads the aggregate.
type GetListingQuery struct {
	db *sqlx.DB
}

func NewGetListingQuery(db *sqlx.DB) *GetListingQuery {
	return &GetListingQuery{
		db: db,
	}
}

// Execute returns the listing with the given id. An unknown id is
// commonconstants.ErrNotFound.
func (q *GetListingQuery) Execute(ctx context.Context, listingID uuid.UUID) (*dto.ListingDetails, error) {
	query := `
	SELECT
		l.id,
		l.seller_id,
		l.buyer_id,
		l.item_id,
		l.start_price,
		l.buyout_price,
		l.sold_price,
		l.status,
		l.ends_at,
		l.created_at,
		l.updated_at,` + priceFactsColumns + `
	FROM listings AS l` + priceFactsJoin + `
	WHERE l.id = $1`

	var details dto.ListingDetails
	if err := q.db.GetContext(ctx, &details, query, listingID); err != nil {
		return nil, commonhelpers.WrapDBErr("listings", "get listing query", err)
	}

	return &details, nil
}
