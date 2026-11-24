package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type debitAccounts interface {
	FindByMemberIDTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*account.Account, error)
	SaveTx(ctx context.Context, tx *sqlx.Tx, acc *account.Account, before account.AccountSnapshot) error
}

// DebitUC is the idempotent debit (FS-9JV5K §C R13-R15, ADR-0093): gold taken
// from the CALLER's own account under a caller-minted key. game-service pays an
// in-run purchase with it, keyed per purchase.
//
// The mirror of CreditUC: exactly-once rests on the dedup row, which commits in
// the SAME transaction as the debit. The removal is the account's own Withdraw,
// so it is bounded by available gold: held bid gold is not spendable. No ledger
// entry, as the credit (ADR-0093).
type DebitUC struct {
	db       *sqlx.DB
	accounts debitAccounts
	marker   activityMarker
}

func NewDebitUC(db *sqlx.DB, accounts debitAccounts, marker activityMarker) *DebitUC {
	return &DebitUC{db: db, accounts: accounts, marker: marker}
}

// DebitCommand names no account on purpose: MemberID is the forwarded token's
// member, so nobody can debit an account other than their own.
type DebitCommand struct {
	MemberID       uuid.UUID
	Amount         int
	IdempotencyKey string
	Now            time.Time
}

// ErrMissingDebitKey refuses a debit with no key. Accepting one would have every
// keyless debit share a single dedup row: the first charged, every later one
// reported as already applied and its goods handed over unpaid.
var ErrMissingDebitKey = errors.New("debit requires an idempotency key")

// debitKeyNamespace prefixes every caller key before it is marked, for the same
// reason as creditKeyNamespace: processed_activities is shared, and an unprefixed
// key could claim another writer's row. A Debit only ever collides with another
// Debit of the same caller key, which is the dedup it wants.
const debitKeyNamespace = "debit:"

// Handle reports whether this call applied the debit. false with no error means
// an earlier call with the same key already committed it: nothing moves.
func (uc *DebitUC) Handle(ctx context.Context, cmd *DebitCommand) (bool, error) {
	if cmd.IdempotencyKey == "" {
		return false, fmt.Errorf("debit uc handle member %s: %w", cmd.MemberID, ErrMissingDebitKey)
	}

	// refused before the mark, so a bad amount never burns the key
	if cmd.Amount <= 0 {
		return false, fmt.Errorf("debit uc handle member %s amount %d: %w", cmd.MemberID, cmd.Amount, account.ErrInvalidGold)
	}

	key := debitKeyNamespace + cmd.IdempotencyKey
	var applied bool

	err := withRetry(ctx, func() error {
		// reset per attempt: a raced attempt that rolled back applied nothing
		applied = false

		return commonutils.ExecTx(ctx, uc.db, nil, func(tx *sqlx.Tx) error {
			claimed, err := uc.marker.MarkActivityProcessed(ctx, tx, key)
			if err != nil {
				return fmt.Errorf("marking %s processed: %w", key, err)
			}

			// already applied: an earlier call committed the debit and its row
			// together, and only its answer was lost
			if !claimed {
				return nil
			}

			// read on the transaction's own connection: one debit, one connection
			acc, err := uc.accounts.FindByMemberIDTx(ctx, tx, cmd.MemberID)
			if err != nil {
				return fmt.Errorf("finding member %s: %w", cmd.MemberID, err)
			}

			before := acc.Snapshot()
			// the available-gold bound is only known here, after the mark, so a
			// refusal rolls the mark back with it: the key is not burned
			if err := acc.Withdraw(cmd.Amount, cmd.Now); err != nil {
				return fmt.Errorf("debiting member %s by %d: %w", cmd.MemberID, cmd.Amount, err)
			}

			if err := uc.accounts.SaveTx(ctx, tx, acc, before); err != nil {
				return fmt.Errorf("saving member %s: %w", cmd.MemberID, err)
			}

			applied = true
			return nil
		})
	})
	if err != nil {
		return false, fmt.Errorf("debit uc handle: %w", err)
	}

	return applied, nil
}
