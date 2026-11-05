package query

import (
	"context"
	"fmt"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/dto"
	"github.com/jmoiron/sqlx"
)

// ExpiredHoldsQuery is the hold sweep's candidate read (FS-A3CQH §Req 5).
type ExpiredHoldsQuery struct {
	db *sqlx.DB
}

func NewExpiredHoldsQuery(db *sqlx.DB) *ExpiredHoldsQuery {
	return &ExpiredHoldsQuery{
		db: db,
	}
}

// Execute returns one page of sweep candidates: holds still RESERVED although
// their expired_at has passed, in (expired_at, bid_id) order, starting after the
// keyset position after (nil for the first page) and at most limit of them.
//
// The keyset is what lets the sweep read every candidate without head-of-line
// blocking (FS-A3CQH §Req 5): a hold the sweep fails to release stays RESERVED and
// would come back first on an offset-free re-read, but a page that starts after
// it moves on. bid_id breaks ties between holds sharing an expiry, so a page
// boundary between them neither repeats nor skips one.
//
// limit is the caller's: the sweep owns the page size, so a limit below one is
// refused rather than replaced with a default.
//
// Expiry here is the database's clock, so the list is advisory: the sweep decides
// each hold again inside the Account aggregate with its own clock, and a hold the
// two disagree about is simply left for a later pass (§Req 6).
//
// Unlike StaleReservedHoldsQuery this filters on expired_at, not created_at. That
// one reports holds that outlived the write meant to follow them, for marketplace
// to judge; this one finds holds wallet can judge alone, because expiry is a fact
// on the hold. The predicate matches idx_wallet_holds_sweep (migration 000004),
// and the row comparison's leading expired_at is a range on that index.
func (q *ExpiredHoldsQuery) Execute(ctx context.Context, after *dto.ExpiredHold, limit int) ([]dto.ExpiredHold, error) {
	if limit < 1 {
		return nil, fmt.Errorf("expired holds query: page size %d, want at least 1", limit)
	}

	query := `
	SELECT bid_id, expired_at
	FROM wallet_holds
	WHERE status = 'RESERVED'
	  AND expired_at < NOW()`

	var args []any
	if after == nil {
		query += `
	ORDER BY expired_at, bid_id
	LIMIT $1`
		args = []any{limit}
	} else {
		query += `
	  AND (expired_at, bid_id) > ($1, $2)
	ORDER BY expired_at, bid_id
	LIMIT $3`
		args = []any{after.ExpiredAt, after.BidID, limit}
	}

	holds := make([]dto.ExpiredHold, 0, limit)
	if err := q.db.SelectContext(ctx, &holds, query, args...); err != nil {
		return nil, commonhelpers.WrapDBErr("wallet_holds", "ExpiredHolds", err)
	}

	return holds, nil
}
