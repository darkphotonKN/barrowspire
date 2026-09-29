package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type HasBidQuery struct {
	db *sqlx.DB
}

func NewHasBidQuery(db *sqlx.DB) *HasBidQuery {
	return &HasBidQuery{
		db: db,
	}
}

// HasBid reports whether a bid was ever recorded under this id.
//
// Any status counts, including the terminal ones. The question is not "is this bid
// still in play" but "did marketplace ever write it" — a CANCELLED or LOST bid was
// written, so its hold belongs to settlement's release steps, not to the reconciler.
// Treating a terminal bid as absent would have the reconciler release gold that
// settlement is still accounting for.
func (q *HasBidQuery) HasBid(ctx context.Context, bidID uuid.UUID) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM bids WHERE id = $1)`

	var exists bool
	if err := q.db.GetContext(ctx, &exists, query, bidID); err != nil {
		return false, commonhelpers.WrapDBErr("bids", "HasBid", err)
	}

	return exists, nil
}
