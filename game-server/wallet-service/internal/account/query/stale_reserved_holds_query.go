package query

import (
	"context"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type StaleReservedHoldsQuery struct {
	db *sqlx.DB
}

func NewStaleReservedHoldsQuery(db *sqlx.DB) *StaleReservedHoldsQuery {
	return &StaleReservedHoldsQuery{
		db: db,
	}
}

// maxBatch caps one sweep so a backlog cannot pull the whole table into memory.
// The reconciler runs on a ticker, so anything left over is picked up next round.
const maxBatch = 100

// Execute lists the bids whose gold is still reserved although their hold was placed
// before createdBefore.
//
// Reported, not judged. A stale reservation is only *suspicious* — wallet has no bid
// or listing concept, so it cannot tell one whose bid was never recorded from one
// whose auction simply has not ended. The caller that minted these bid ids is the
// only party that can decide, which is why this returns them rather than acting.
//
// createdBefore is what keeps that decision safe: a hold placed moments ago may
// belong to a request still mid-write, and releasing it would leave a recorded bid
// with no gold behind it.
func (q *StaleReservedHoldsQuery) Execute(ctx context.Context, createdBefore time.Time, limit int) ([]uuid.UUID, error) {
	if limit <= 0 || limit > maxBatch {
		limit = maxBatch
	}

	// created_at, not expired_at: expiry is sized for settlement — the listing's end
	// plus a grace — so a hold orphaned on the first day of a week-long auction would
	// not look expired for a week. What makes a hold suspicious here is that it has
	// outlived the write that was supposed to follow it, which is a matter of seconds.
	query := `
	SELECT bid_id
	FROM wallet_holds
	WHERE status = 'RESERVED'
	  AND created_at < $1
	ORDER BY created_at
	LIMIT $2
	`

	var bidIDs []uuid.UUID
	if err := q.db.SelectContext(ctx, &bidIDs, query, createdBefore, limit); err != nil {
		return nil, commonhelpers.WrapDBErr("wallet_holds", "StaleReservedHolds", err)
	}

	return bidIDs, nil
}
