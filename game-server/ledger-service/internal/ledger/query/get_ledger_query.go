package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// READ side of CQRS — reads the tables directly and returns a DTO. It deliberately
// does NOT load the Ledger aggregate, because no invariant is being enforced on a read.
type GetLedgerQuery struct {
	db *sqlx.DB
}

func NewGetLedgerQuery(db *sqlx.DB) *GetLedgerQuery {
	return &GetLedgerQuery{
		db: db,
	}
}

func (q *GetLedgerQuery) Execute(ctx context.Context, memberID uuid.UUID) (*dto.LedgerDetails, error) {
	query := `
	SELECT
		l.id as ledger_id,
		l.member_id as member_id,
		l.created_at as created_at
	FROM ledgers as l
	WHERE l.member_id = $1
	`

	var res dto.LedgerDetails

	err := q.db.GetContext(ctx, &res, query, memberID)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("ledgers", "get ledger query", err)
	}

	return &res, nil
}
