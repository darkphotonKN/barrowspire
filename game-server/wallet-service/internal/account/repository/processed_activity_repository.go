package repository

import (
	"context"
	"fmt"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/jmoiron/sqlx"
)

// ProcessedActivityRepo records which settlement activities wallet has applied,
// by the caller-minted idempotency key (FS-NXP1W §Req 23, ADR-0009).
//
// It holds no *sqlx.DB on purpose: a mark is only meaningful inside the
// transaction of the write it guards, so the caller always supplies one.
type ProcessedActivityRepo struct{}

func NewProcessedActivityRepo() *ProcessedActivityRepo {
	return &ProcessedActivityRepo{}
}

const markActivityProcessedQuery = `
INSERT INTO processed_activities (idempotency_key)
VALUES ($1)
ON CONFLICT (idempotency_key) DO NOTHING
`

// MarkActivityProcessed reports whether this call claimed key. false means an
// earlier attempt already committed it: the activity is already applied.
//
// ON CONFLICT rather than read-then-insert, so two concurrent attempts are
// arbitrated by the primary key. The loser blocks on the winner's row and then
// sees it, or claims the key itself if the winner rolled back.
func (r *ProcessedActivityRepo) MarkActivityProcessed(ctx context.Context, tx *sqlx.Tx, key string) (bool, error) {
	res, err := tx.ExecContext(ctx, markActivityProcessedQuery, key)
	if err != nil {
		return false, commonhelpers.WrapDBErr("processed activity", "mark", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("processed activity mark, rows affected: %w", err)
	}

	return n == 1, nil
}
