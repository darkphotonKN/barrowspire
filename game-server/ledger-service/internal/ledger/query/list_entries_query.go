package query

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// READ side of CQRS reads the tables directly and returns a DTO. It deliberately
// does NOT load the Ledger aggregate, because no invariant is being enforced on a read.
type ListEntriesQuery struct {
	db *sqlx.DB
}

func NewListEntriesQuery(db *sqlx.DB) *ListEntriesQuery {
	return &ListEntriesQuery{
		db: db,
	}
}

func (q *ListEntriesQuery) Execute(ctx context.Context, accountIDTarget *uuid.UUID, cursor *string, limit int) (*dto.ListEntriesDetails, error) {

	// TODO: WIP, leaving shell for now, satisfying interfaces and dto types first
	query := `
	SELECT
		l.id as ledger_id,
		l.member_id as member_id,
		l.created_at as created_at
	FROM ledgers as l
	WHERE l.member_id = $1
	`

	var res dto.ListEntriesDetails

	err := q.db.GetContext(ctx, &res, query)

	if err != nil {
		return nil, commonhelpers.WrapDBErr("ledgers", "list entries details query", err)
	}

	return &res, nil
}
