package query

import (
	"context"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
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

func (q *ListEntriesQuery) Execute(ctx context.Context, caller *commonauth.Identity, accountIDTarget *uuid.UUID, c *cursor.Cursor, limit int) (*dto.ListEntriesDetails, error) {

	// determine what type of query
	isAdmin := caller.Role == commonauth.RoleAdmin

	// reject unauthorized combinations
	if !isAdmin && accountIDTarget != nil {
		return nil, fmt.Errorf("list entries query accountIDTarget present when not admin : %w", apperr.ErrForbidden)
	}

	// the remaining decisions are just calling for everyone's entries if admin and no target,
	// single target if admin and target provided, else return the own account's entries
	query := `SELECT
		id,
		transaction_id,
		direction,
		amount,
		created_at
	FROM ledger_entries`

	args := make([]any, 0)

	if !isAdmin {
		query += `WHERE account_id=$1 AND (created_at, id) < ($2, $3) 
							ORDER BY created_at LIMIT $4
		`
		args = append(args, caller.AccountID.String(), c.CreatedAt.String(), c.ID.String(), limit+1)
	} else if accountIDTarget != nil {
		query += `WHERE account_id=$1 AND (created_at, id) < ($2, $3)
							ORDER BY created_at LIMIT $4
		`
		args = append(args, accountIDTarget.String(), c.CreatedAt.String(), c.ID.String(), limit+1)
	} else {
		query += `
		WHERE (created_at, id) < ($1, $2)
		ORDER BY created_at LIMIT $3
		`
		args = append(args, c.CreatedAt.String(), c.ID.String(), limit+1)
	}

	var res dto.ListEntriesDetails

	err := q.db.SelectContext(ctx, &res, query)

	// detect and build cursor

	// check if next cursor exists
	if len(res.Entries) == limit+1 {
		nextEntry := res.Entries[limit]

		// update with cursor
		res.NextCursor = cursor.Cursor{ID: nextEntry.ID, CreatedAt: nextEntry.CreatedAt}.Encode()

		// trim to show original limit
		res.Entries = res.Entries[:limit]
	}

	if err != nil {
		return nil, commonhelpers.WrapDBErr("ledgers", "list entries details query", err)
	}

	return &res, nil
}
