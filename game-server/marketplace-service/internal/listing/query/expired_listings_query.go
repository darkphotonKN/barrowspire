package query

import (
	"context"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// ExpiredListingsQuery is the expiry poller's read (FS-NXP1W §Req 2): ACTIVE
// listings whose end has come. No other status is ever selected, SETTLEMENT_FAILED
// included, so a settlement that failed is never started again by expiry.
type ExpiredListingsQuery struct {
	db *sqlx.DB
}

func NewExpiredListingsQuery(db *sqlx.DB) *ExpiredListingsQuery {
	return &ExpiredListingsQuery{db: db}
}

type expiredListingRow struct {
	ID     uuid.UUID `db:"id"`
	EndsAt time.Time `db:"ends_at"`
}

// ExpiredActiveListings pages ACTIVE listings with ends_at at or before now, soonest
// ending first. The cursor is (ends_at, id), so listings ending at the same instant
// still page without a skip or a repeat. A nil after starts from the first.
func (q *ExpiredListingsQuery) ExpiredActiveListings(ctx context.Context, now time.Time, after *dto.ExpiredListing, limit int) ([]dto.ExpiredListing, error) {
	query := `
	SELECT id, ends_at
	FROM listings
	WHERE status = 'ACTIVE'
	  AND ends_at <= $1
	ORDER BY ends_at, id
	LIMIT $2
	`
	args := []any{now, limit}
	if after != nil {
		query = `
		SELECT id, ends_at
		FROM listings
		WHERE status = 'ACTIVE'
		  AND ends_at <= $1
		  AND (ends_at, id) > ($3, $4)
		ORDER BY ends_at, id
		LIMIT $2
		`
		args = append(args, after.EndsAt, after.ID)
	}

	var rows []expiredListingRow
	if err := q.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, commonhelpers.WrapDBErr("listings", "ExpiredActiveListings", err)
	}

	out := make([]dto.ExpiredListing, len(rows))
	for i, r := range rows {
		out[i] = dto.ExpiredListing{ID: r.ID, EndsAt: r.EndsAt}
	}
	return out, nil
}
