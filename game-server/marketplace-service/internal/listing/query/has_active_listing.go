package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type HasActiveListingQuery struct {
	db *sqlx.DB
}

func NewHasActiveListingQuery(db *sqlx.DB) *HasActiveListingQuery {
	return &HasActiveListingQuery{
		db: db,
	}
}

func (q *HasActiveListingQuery) HasActiveListing(ctx context.Context, itemID uuid.UUID) (bool, error) {
	query := `
	SELECT EXISTS(
		SELECT 1 FROM listings
		WHERE item_id = $1 AND status IN ('ACTIVE', 'DRAFT')
	)
`
	var exists bool
	if err := q.db.GetContext(ctx, &exists, query, itemID); err != nil {
		return false, commonhelpers.WrapDBErr("listing", "HasActiveListing", err)
	}
	return exists, nil
}
