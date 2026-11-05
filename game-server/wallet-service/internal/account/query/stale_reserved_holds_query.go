package query

import (
	"context"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/dto"
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

// Execute lists one page of the bids whose gold is still reserved although their
// hold was placed before createdBefore, ordered by (created_at, bid_id) and
// starting strictly after the position after, or from the oldest when after is
// nil (FS-9BJCP Req 6). Next is set only when another row follows: the read
// fetches one row past the page to know (Req 7).
//
// Reported, not judged. A stale reservation is only *suspicious* — wallet has no bid
// or listing concept, so it cannot tell one whose bid was never recorded from one
// whose auction simply has not ended. The caller that minted these bid ids is the
// only party that can decide, which is why this returns them rather than acting.
//
// createdBefore is what keeps that decision safe: a hold placed moments ago may
// belong to a request still mid-write, and releasing it would leave a recorded bid
// with no gold behind it.
func (q *StaleReservedHoldsQuery) Execute(ctx context.Context, createdBefore time.Time, after *cursor.Cursor, limit int) (*dto.StaleReservedHoldsPage, error) {
	if limit <= 0 || limit > maxBatch {
		limit = maxBatch
	}

	var afterAt *time.Time
	afterID := uuid.Nil
	if after != nil {
		afterAt, afterID = &after.CreatedAt, after.ID
	}

	// created_at, not expired_at: expiry is sized for settlement — the listing's end
	// plus a grace — so a hold orphaned on the first day of a week-long auction would
	// not look expired for a week. What makes a hold suspicious here is that it has
	// outlived the write that was supposed to follow it, which is a matter of seconds.
	//
	// bid_id is unique, so (created_at, bid_id) is a total order and the keyset
	// neither skips nor repeats holds that share an instant. idx_wallet_holds_stale
	// serves the created_at range.
	query := `
	SELECT bid_id, created_at
	FROM wallet_holds
	WHERE status = 'RESERVED'
	  AND created_at < $1
	  AND ($2::timestamptz IS NULL OR (created_at, bid_id) > ($2::timestamptz, $3::uuid))
	ORDER BY created_at, bid_id
	LIMIT $4
	`

	var rows []struct {
		BidID     uuid.UUID `db:"bid_id"`
		CreatedAt time.Time `db:"created_at"`
	}
	if err := q.db.SelectContext(ctx, &rows, query, createdBefore, afterAt, afterID, limit+1); err != nil {
		return nil, commonhelpers.WrapDBErr("wallet_holds", "StaleReservedHolds", err)
	}

	page := &dto.StaleReservedHoldsPage{BidIDs: make([]uuid.UUID, 0, min(len(rows), limit))}
	if len(rows) > limit {
		rows = rows[:limit]
		last := rows[limit-1]
		page.Next = &cursor.Cursor{CreatedAt: last.CreatedAt, ID: last.BidID}
	}
	for _, r := range rows {
		page.BidIDs = append(page.BidIDs, r.BidID)
	}

	return page, nil
}
