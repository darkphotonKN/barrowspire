package usecase

import (
	"context"
	"errors"
	"fmt"
	"math"
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

// ErrCreditOverflow refuses a credit the balance cannot hold. It reads as
// ErrInvalidGold too: the amount is what is wrong, not the account.
var ErrCreditOverflow = fmt.Errorf("credit would overflow the balance: %w", account.ErrInvalidGold)

// creditKeyNamespace prefixes every caller key before it is marked.
// processed_activities is shared with settlement's CreditSeller, whose keys are
// <workflow id>:CreditSeller, and Credit accepts any caller key: unprefixed, a
// Credit could claim a settlement's key first and that seller would never be
// paid. No other writer's key starts with it, so a Credit only ever collides
// with another Credit of the same caller key, which is the dedup it wants.
const creditKeyNamespace = "credit:"

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

	key := creditKeyNamespace + cmd.IdempotencyKey
	var applied bool

	err := withRetry(ctx, func() error {
		// reset per attempt: a raced attempt that rolled back applied nothing
		applied = false

		return commonutils.ExecTx(ctx, uc.db, nil, func(tx *sqlx.Tx) error {
			claimed, err := uc.marker.MarkActivityProcessed(ctx, tx, key)
			if err != nil {
				return fmt.Errorf("marking %s processed: %w", key, err)
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
			// Deposit adds unchecked. The balance is only known here, after the
			// mark, so the refusal rolls the mark back with it: the key is not burned
			if before.Gold > math.MaxInt-cmd.Amount {
				return fmt.Errorf("crediting member %s gold %d by %d: %w", cmd.MemberID, before.Gold, cmd.Amount, ErrCreditOverflow)
			}
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
