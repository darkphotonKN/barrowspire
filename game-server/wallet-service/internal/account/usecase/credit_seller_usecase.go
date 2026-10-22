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

// The ports this use case needs, declared HERE because the consumer owns its
// interfaces.

type sellerAccounts interface {
	FindByMemberIDTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*account.Account, error)
	SaveTx(ctx context.Context, tx *sqlx.Tx, acc *account.Account, before account.AccountSnapshot) error
}

type activityMarker interface {
	MarkActivityProcessed(ctx context.Context, tx *sqlx.Tx, key string) (bool, error)
}

// CreditSellerUC is settlement step 3 (FS-NXP1W §Req 30): the sale proceeds reach
// the seller. Part of the tail, so it rolls forward and never undoes anything.
//
// The only saga step with no prior state to make it idempotent: a credit is a bare
// increment. Exactly-once therefore rests entirely on the dedup row, which commits
// in the SAME transaction as the credit (§Req 23).
type CreditSellerUC struct {
	db       *sqlx.DB
	accounts sellerAccounts
	marker   activityMarker
}

func NewCreditSellerUC(db *sqlx.DB, accounts sellerAccounts, marker activityMarker) *CreditSellerUC {
	return &CreditSellerUC{db: db, accounts: accounts, marker: marker}
}

type CreditSellerCommand struct {
	SellerID uuid.UUID
	Amount   int
	// IdempotencyKey is minted by the workflow (workflow ID + activity name,
	// ADR-0009), so it is stable across every retry and replay of one settlement
	IdempotencyKey string
	Now            time.Time
}

// ErrMissingIdempotencyKey refuses a credit with no key. Accepting one would have
// every keyless settlement share a single dedup row: the first seller paid, every
// later one reported as already applied and never paid.
var ErrMissingIdempotencyKey = errors.New("credit seller requires an idempotency key")

// Handle returns the seller's account ID, and the same ID on a re-run, already
// applied or not (§Req 9).
func (uc *CreditSellerUC) Handle(ctx context.Context, cmd *CreditSellerCommand) (uuid.UUID, error) {
	if cmd.IdempotencyKey == "" {
		return uuid.Nil, fmt.Errorf("credit seller uc handle seller %s: %w", cmd.SellerID, ErrMissingIdempotencyKey)
	}

	var accountID uuid.UUID

	err := withRetry(ctx, func() error {
		return commonutils.ExecTx(ctx, uc.db, nil, func(tx *sqlx.Tx) error {
			claimed, err := uc.marker.MarkActivityProcessed(ctx, tx, cmd.IdempotencyKey)
			if err != nil {
				return fmt.Errorf("marking %s processed: %w", cmd.IdempotencyKey, err)
			}

			// read on the transaction's own connection: one credit, one connection
			acc, err := uc.accounts.FindByMemberIDTx(ctx, tx, cmd.SellerID)
			if err != nil {
				return fmt.Errorf("finding seller %s: %w", cmd.SellerID, err)
			}

			before := acc.Snapshot()
			accountID = before.ID

			// already applied: an earlier attempt committed the credit and its row
			// together, and only its completion was lost. Answer as it would have
			if !claimed {
				return nil
			}

			if err := acc.Deposit(cmd.Amount, cmd.Now); err != nil {
				return fmt.Errorf("crediting seller %s: %w", cmd.SellerID, err)
			}

			if err := uc.accounts.SaveTx(ctx, tx, acc, before); err != nil {
				return fmt.Errorf("saving seller %s: %w", cmd.SellerID, err)
			}

			return nil
		})
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("credit seller uc handle: %w", err)
	}

	return accountID, nil
}
