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

// Query needs to grab all relevant wallet_holds under account to calculate
// available gold and gold held.
func (q *GetAccountQuery) Execute(ctx context.Context, memberID uuid.UUID) (*dto.AccountDetails, error) {

	query := `
	SELECT 
		a.id as account_id,
		a.member_id as member_id,
		a.gold as gold,
		SUM(wh.amount) as held_gold,
		gold - SUM(wh.amount) as available_gold
	FROM accounts as a
	JOIN wallet_holds as wh
	ON wh.account_id = a.id
	WHERE a.member_id = $1 AND wh.status = 'RESERVED'
	GROUP BY account_id, member_id, gold
	`

	var res dto.AccountDetails

	err := q.db.GetContext(ctx, &res, query, memberID)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("accounts", "get account query", err)
	}

	return &res, nil
}
