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

type creditAccounts interface {
	FindByMemberIDTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*account.Account, error)
	SaveTx(ctx context.Context, tx *sqlx.Tx, acc *account.Account, before account.AccountSnapshot) error
}

// CreditUC is the idempotent credit (FS-1GZGD §Req 23, ADR-0044): gold added to
// the CALLER's own account under a caller-minted key. notification-service uses
// it for a letter's gold, keyed mail:<letter id>:<member id>.
//
// Like CreditSellerUC it is a bare increment, so exactly-once rests on the dedup
// row, which commits in the SAME transaction as the credit. No ledger entry: the
// gold has no counterparty (ADR-0006), and the key's prefix is what tells a
// future reconciler where it came from.
type CreditUC struct {
	db       *sqlx.DB
	accounts creditAccounts
	marker   activityMarker
}

func NewCreditUC(db *sqlx.DB, accounts creditAccounts, marker activityMarker) *CreditUC {
	return &CreditUC{db: db, accounts: accounts, marker: marker}
}

// CreditCommand names no account on purpose: MemberID is the forwarded token's
// member (D18), so nobody can credit an account other than their own.
type CreditCommand struct {
	MemberID       uuid.UUID
	Amount         int
	IdempotencyKey string
	Now            time.Time
}

// ErrMissingCreditKey refuses a credit with no key. Accepting one would have
// every keyless credit share a single dedup row: the first applied, every later
// one reported as already applied and never paid.
var ErrMissingCreditKey = errors.New("credit requires an idempotency key")

// Handle reports whether this call applied the credit. false with no error means
// an earlier call with the same key already committed it: nothing moves (Guard 4).
func (uc *CreditUC) Handle(ctx context.Context, cmd *CreditCommand) (bool, error) {
	if cmd.IdempotencyKey == "" {
		return false, fmt.Errorf("credit uc handle member %s: %w", cmd.MemberID, ErrMissingCreditKey)
	}

	// refused before the mark, so a bad amount never burns the key
	if cmd.Amount <= 0 {
		return false, fmt.Errorf("credit uc handle member %s amount %d: %w", cmd.MemberID, cmd.Amount, account.ErrInvalidGold)
	}

	var applied bool

	err := withRetry(ctx, func() error {
		// reset per attempt: a raced attempt that rolled back applied nothing
		applied = false

		return commonutils.ExecTx(ctx, uc.db, nil, func(tx *sqlx.Tx) error {
			claimed, err := uc.marker.MarkActivityProcessed(ctx, tx, cmd.IdempotencyKey)
			if err != nil {
				return fmt.Errorf("marking %s processed: %w", cmd.IdempotencyKey, err)
			}

			// already applied: an earlier call committed the credit and its row
			// together, and only its answer was lost
			if !claimed {
				return nil
			}

			// read on the transaction's own connection: one credit, one connection
			acc, err := uc.accounts.FindByMemberIDTx(ctx, tx, cmd.MemberID)
			if err != nil {
				return fmt.Errorf("finding member %s: %w", cmd.MemberID, err)
			}

			before := acc.Snapshot()
			if err := acc.Deposit(cmd.Amount, cmd.Now); err != nil {
				return fmt.Errorf("crediting member %s: %w", cmd.MemberID, err)
			}

			if err := uc.accounts.SaveTx(ctx, tx, acc, before); err != nil {
				return fmt.Errorf("saving member %s: %w", cmd.MemberID, err)
			}

			applied = true
			return nil
		})
	})
	if err != nil {
		return false, fmt.Errorf("credit uc handle: %w", err)
	}

	return applied, nil
}
