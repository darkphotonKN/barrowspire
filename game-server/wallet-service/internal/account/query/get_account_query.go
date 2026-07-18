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

func (q *GetAccountQuery) Execute(ctx context.Context, memberID uuid.UUID) (*dto.AccountDetails, error) {
	query := `
	SELECT 
		id,
		member_id,
		gold,
		created_at
	FROM accounts
	WHERE member_id = $1
	`

	var res dto.AccountDetails

	err := q.db.GetContext(ctx, &res, query, memberID)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("accounts", "get account query", err)
	}

	return &res, nil
}
