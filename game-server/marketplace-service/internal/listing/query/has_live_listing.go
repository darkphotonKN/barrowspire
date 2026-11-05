package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

type HasLiveListingQuery struct {
	db *sqlx.DB
}

func NewHasLiveListingQuery(db *sqlx.DB) *HasLiveListingQuery {
	return &HasLiveListingQuery{
		db: db,
	}
}

// HasLiveListing reports whether the listing a reservation was made for is still
// one that needs its item: in one of listing.LiveStatuses, ACTIVE or with its
// settlement running (PENDING_SETTLEMENT). The reservation reconciler cancels a reservation only when
// this is false, so counting a settling listing as live keeps settlement's item
// from being freed between 0a freezing the listing and 0b freezing the item, or
// while 0b is parked (FS-NXP1W I-NXP1W-3).
//
// It asks by listing id, never by item: another live listing on the same item
// (a relist's earlier listing) does not stand for this reservation (FS-04ZB6
// Req 11).
func (q *HasLiveListingQuery) HasLiveListing(ctx context.Context, listingID uuid.UUID) (bool, error) {
	// the live set comes from the domain, never restated here (listing.LiveStatuses)
	live := listing.LiveStatuses()
	statuses := make([]string, len(live))
	for i, s := range live {
		statuses[i] = string(s)
	}

	query := `
	SELECT EXISTS(
		SELECT 1 FROM listings
		WHERE id = $1 AND status = ANY($2)
	)
`
	var exists bool
	if err := q.db.GetContext(ctx, &exists, query, listingID, pq.Array(statuses)); err != nil {
		return false, commonhelpers.WrapDBErr("listing", "HasLiveListing", err)
	}
	return exists, nil
}
