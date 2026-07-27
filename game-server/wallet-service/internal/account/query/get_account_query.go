package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type GetAccountQuery struct {
	db *sqlx.DB
}

func NewGetAccountQuery(db *sqlx.DB) *GetAccountQuery {
	return &GetAccountQuery{
		db: db,
	}
}

// Query needs to grab all relevant wallet_hold rows under account to calculate
// available gold and gold held.
func (q *GetAccountQuery) Execute(ctx context.Context, memberID uuid.UUID) (*dto.AccountDetails, error) {

	// LEFT JOIN so an account with no RESERVED holds still returns a row
	// (held_gold 0, available_gold == gold) instead of no rows at all.
	// The status filter lives in the ON clause for the same reason, in a WHERE
	// it would discard the unmatched-account row the LEFT JOIN just preserved.
	query := `
	SELECT
		a.id as account_id,
		a.member_id as member_id,
		a.gold as gold,
		COALESCE(SUM(wh.amount), 0) as held_gold,
		a.gold - COALESCE(SUM(wh.amount), 0) as available_gold
	FROM accounts as a
	LEFT JOIN wallet_holds as wh
	ON wh.account_id = a.id AND wh.status = 'RESERVED'
	WHERE a.member_id = $1 
	GROUP BY a.id, a.member_id, a.gold
	`

	var res dto.AccountDetails

	err := q.db.GetContext(ctx, &res, query, memberID)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("accounts", "get account query", err)
	}

	return &res, nil
}
