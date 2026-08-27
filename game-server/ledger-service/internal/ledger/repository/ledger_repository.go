package repository

import (
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
