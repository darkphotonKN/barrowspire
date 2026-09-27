package activity

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
)

// CommitHold is step 1b, the pivot. A thin wrapper (FS-NXP1W §Req 7): the rules
// live in the use case and the domain. What it adds is the classification the
// workflow branches on (§Req 9).
func (a *Activities) CommitHold(ctx context.Context, in walletactivity.CommitHoldInput) (walletactivity.CommitHoldOutput, error) {
	res, err := a.commitHold.Handle(ctx, &usecase.CommitHoldCommand{
		BidID:          in.WinnerBidID,
		ExpectedAmount: int(in.ExpectedAmount),
		Now:            time.Now(),
	})
	if err != nil {
		return walletactivity.CommitHoldOutput{}, classifyCommitHoldErr(in.WinnerBidID, err)
	}

	return walletactivity.CommitHoldOutput{
		BuyerWalletAccountID: res.AccountID,
		CommittedAmount:      int64(res.Amount),
	}, nil
}

// commitHoldImpossible is the type the workflow matches on to decide a rollback
// rather than another attempt.
const commitHoldImpossible = "CommitHoldImpossible"

// commitHoldNonRetryable is 1b's non-retryable set, declared in one place rather
// than spread through a switch (§Req 9, ADR-0011). Everything absent from it is
// treated as transient, which is the safe default: a retry that cannot help costs
// a cap, while a rollback that should not have happened costs a sale.
//
// Note what is NOT here. ErrConcurrentModification is transient and never reaches
// this point — the use case's retry loop absorbs it — and on exhaustion it arrives
// wrapped in ErrMaxRetries, so errors.Is is what reads through to the cause.
var commitHoldNonRetryable = []error{
	// the hold lapsed before settlement reached the pivot; the sweeper may already
	// have released the gold
	account.ErrHoldExpired,
	// the caller's figure disagrees with the hold's own, raised loudly rather than
	// silently spending the hold's amount
	account.ErrHoldAmountMismatch,
	// RELEASED -> COMMITTED, refused by the hold FSM. A released hold is gone
	// (ADR-0017: there is no ReverseCommit to undo it with either)
	account.ErrInvalidHoldTransition,
	// an invariant already broke: Reconstitute refuses an account whose holds
	// exceed its gold, so no retry restores it
	account.ErrInsufficientGold,
	// no hold for this bid, so there is nothing for any attempt to commit
	account.ErrHoldNotFound,
}

func classifyCommitHoldErr(bidID uuid.UUID, err error) error {
	wrapped := fmt.Errorf("commit hold activity bid id %v: %w", bidID, err)

	for _, impossible := range commitHoldNonRetryable {
		if errors.Is(err, impossible) {
			return temporal.NewNonRetryableApplicationError(
				wrapped.Error(),      // message
				commitHoldImpossible, // type, the workflow matches on this
				err,                  // cause
			)
		}
	}

	return wrapped // plain error, Temporal retries
}
