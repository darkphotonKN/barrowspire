package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type GetListingQuery struct {
	db *sqlx.DB
}

func NewGetListingQuery(db *sqlx.DB) *GetListingQuery {
	return &GetListingQuery{
		db: db,
	}
}

func (q *GetListingQuery) Execute(ctx context.Context, memberID uuid.UUID) (*dto.ListingDetails, error) {
	query := `
	SELECT 
		id,
		member_id,
		name,
		created_at
	FROM listings
	WHERE member_id = $1
	`

	var res dto.ListingDetails

	err := q.db.GetContext(ctx, &res, query, memberID)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("listings", "get listing query", err)
	}

	return &res, nil
}
