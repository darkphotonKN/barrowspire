package repository

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
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

	// the conflict target is transaction_id alone: only a re-post of the same
	// transaction is a no-op. A second settlement of one reference_id hits the
	// partial unique index instead and must surface as an error.
	ledgerTxQuery := `
	INSERT INTO ledger_transactions(transaction_id, reason, reference_id, currency)
	VALUES ($1, $2, $3, $4)
	ON CONFLICT(transaction_id) DO NOTHING
	`

	// id and created_at are left to the DB defaults
	ledgerEntryQuery := `
	INSERT INTO ledger_entries(transaction_id, account_id, direction, amount)
	VALUES ($1, $2, $3, $4)
	`

	txSnapshot := tx.Snapshot()

	err = commonhelpers.ExecTx(ctx, r.db, nil, func(dbTx *sqlx.Tx) error {
		res, err := dbTx.ExecContext(ctx, ledgerTxQuery, txSnapshot.TransactionID, txSnapshot.Reason, txSnapshot.ReferenceID, txSnapshot.Currency)
		if err != nil {
			return err
		}

		// checks rows affected to know if there was conflict
		no, err := res.RowsAffected()
		if err != nil {
			return err
		}

		// already recorded: commit the empty transaction and report the no-op.
		// Not returned as an error, so a routine retry never logs a rollback.
		if no == 0 {
			return nil
		}

		for _, leg := range txSnapshot.Legs {
			if _, err := dbTx.ExecContext(ctx, ledgerEntryQuery, txSnapshot.TransactionID, leg.AccountID, leg.Direction, leg.Amount); err != nil {
				return err
			}
		}

		applied = true

		return nil
	})

	if err != nil {
		return false, commonhelpers.WrapDBErr("ledger", "Append", err)
	}

	return applied, nil
}
