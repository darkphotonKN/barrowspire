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

// HasBidHoldingGold reports whether any path is still accounting for the gold a hold
// is reserving for this bid.
//
// Not "does a row exist". The reconciler's question is whether the reservation still
// belongs to somebody, and two statuses answer no even though the bid was written:
//
//   - CANCELLED: the bidder withdrew and left the auction, so no settlement set
//     contains it. WithdrawBid releases the hold itself, but that release can fail,
//     and nothing else would ever send another.
//   - FAILED: wallet refused to hold the gold, so there is no reservation to claim —
//     harmless either way, and listed so the rule reads as one rule.
//
// Every other status is still somebody's: WINNING and PENDING are live, OUTBID and
// LOST are settlement's to release, WON is the pivot's to commit. Reporting one of
// those as unclaimed would have the reconciler release gold settlement is mid-flight
// on.
func (q *HasBidQuery) HasBidHoldingGold(ctx context.Context, bidID uuid.UUID) (bool, error) {
	query := `
	SELECT EXISTS(
		SELECT 1 FROM bids
		WHERE id = $1
		  AND status NOT IN ('CANCELLED', 'FAILED')
	)
	`

	var claimed bool
	if err := q.db.GetContext(ctx, &claimed, query, bidID); err != nil {
		return false, commonhelpers.WrapDBErr("bids", "HasBidHoldingGold", err)
	}

	return claimed, nil
}
