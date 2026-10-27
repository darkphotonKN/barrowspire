package repository

import (
	"context"
	"errors"

	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/jmoiron/sqlx"
)

// OUTBOUND Adapter — the concrete implementation of the ledger.Repository PORT.
type LedgerRepository struct {
	db *sqlx.DB
}

func NewLedgerRepository(db *sqlx.DB) *LedgerRepository {
	return &LedgerRepository{
		db: db,
	}
}

// Append persists one transaction and its legs in a single DB transaction.
// applied=false means transaction_id was already recorded: a duplicate, not an error.
func (r *LedgerRepository) Append(ctx context.Context, tx *ledger.Transaction) (applied bool, err error) {
	// TODO(Kranti): ON CONFLICT (transaction_id) DO NOTHING on the parent, then the legs
	return false, errors.New("ledger repository: Append not implemented")
}
