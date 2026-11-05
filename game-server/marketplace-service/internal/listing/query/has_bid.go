package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

type HasBidQuery struct {
	db *sqlx.DB
}

func NewHasBidQuery(db *sqlx.DB) *HasBidQuery {
	return &HasBidQuery{
		db: db,
	}
}

// BidsHoldingGold answers, in one query, which of bidIDs a recorded bid is still
// accounting for the gold of; an id absent from the answer is unclaimed. The hold
// reconciler asks once per page of stale holds (FS-9BJCP Req 15).
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
func (q *HasBidQuery) BidsHoldingGold(ctx context.Context, bidIDs []uuid.UUID) (map[uuid.UUID]bool, error) {
	claimed := make(map[uuid.UUID]bool, len(bidIDs))
	if len(bidIDs) == 0 {
		return claimed, nil
	}

	ids := make([]string, len(bidIDs))
	for i, id := range bidIDs {
		ids[i] = id.String()
	}

	query := `
	SELECT id
	FROM bids
	WHERE id = ANY($1::uuid[])
	  AND status NOT IN ('CANCELLED', 'FAILED')
	`

	var rows []uuid.UUID
	if err := q.db.SelectContext(ctx, &rows, query, pq.Array(ids)); err != nil {
		return nil, commonhelpers.WrapDBErr("bids", "BidsHoldingGold", err)
	}
	for _, id := range rows {
		claimed[id] = true
	}
	return claimed, nil
}
