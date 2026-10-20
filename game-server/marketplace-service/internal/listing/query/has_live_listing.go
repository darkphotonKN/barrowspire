package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type HasLiveListingQuery struct {
	db *sqlx.DB
}

func NewHasLiveListingQuery(db *sqlx.DB) *HasLiveListingQuery {
	return &HasLiveListingQuery{
		db: db,
	}
}

// HasLiveListing reports whether the item still belongs to a listing that needs it:
// one that is ACTIVE, or whose settlement is running (PENDING_SETTLEMENT). The
// reservation reconciler cancels an item's reservation only when this is false, so
// counting a settling listing as live keeps settlement's item from being freed
// between 0a freezing the listing and 0b freezing the item, or while 0b is parked
// (FS-NXP1W I-NXP1W-3).
func (q *HasLiveListingQuery) HasLiveListing(ctx context.Context, itemID uuid.UUID) (bool, error) {
	query := `
	SELECT EXISTS(
		SELECT 1 FROM listings
		WHERE item_id = $1 AND status IN ('ACTIVE', 'PENDING_SETTLEMENT')
	)
`
	var exists bool
	if err := q.db.GetContext(ctx, &exists, query, itemID); err != nil {
		return false, commonhelpers.WrapDBErr("listing", "HasLiveListing", err)
	}
	return exists, nil
}
