package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

type ListingStatusQuery struct {
	db *sqlx.DB
}

func NewListingStatusQuery(db *sqlx.DB) *ListingStatusQuery {
	return &ListingStatusQuery{
		db: db,
	}
}

// ListingStatuses answers, in one query, the status of each listing among
// listingIDs that exists, in whatever status it is; an id with no listing at all
// is absent from the answer. The confirmed-without-listing backstop releases an
// item only when its listing id is absent (FS-04ZB6 Req 12), so an ended listing
// must still be found.
func (q *ListingStatusQuery) ListingStatuses(ctx context.Context, listingIDs []uuid.UUID) (map[uuid.UUID]listing.ListingStatus, error) {
	statuses := make(map[uuid.UUID]listing.ListingStatus, len(listingIDs))
	if len(listingIDs) == 0 {
		return statuses, nil
	}

	ids := make([]string, len(listingIDs))
	for i, id := range listingIDs {
		ids[i] = id.String()
	}

	query := `SELECT id, status FROM listings WHERE id = ANY($1::uuid[])`

	var rows []struct {
		ID     uuid.UUID `db:"id"`
		Status string    `db:"status"`
	}
	if err := q.db.SelectContext(ctx, &rows, query, pq.Array(ids)); err != nil {
		return nil, commonhelpers.WrapDBErr("listing", "ListingStatuses", err)
	}
	for _, r := range rows {
		statuses[r.ID] = listing.ListingStatus(r.Status)
	}
	return statuses, nil
}
