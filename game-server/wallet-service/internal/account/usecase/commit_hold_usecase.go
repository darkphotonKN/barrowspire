package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

// CommitHoldUC is settlement's pivot (FS-NXP1W §Req 28): the winning bid's hold
// moves RESERVED -> COMMITTED and the buyer is debited, in one OCC save.
//
// The account is found by the hold's bid, never by a member: settlement is
// started by a clock, so there is no caller identity to read one from.
type CommitHoldUC struct {
	repo account.Repository
}

func NewCommitHoldUC(repo account.Repository) *CommitHoldUC {
	return &CommitHoldUC{
		repo: repo,
	}
}

type CommitHoldCommand struct {
	BidID uuid.UUID
	// ExpectedAmount is the caller's figure, a cross-check only: the debit is
	// always the hold's own amount
	ExpectedAmount int
	Now            time.Time
}

// CommitHoldResult is what settlement carries forward: the buyer's account for
// the ledger legs, and the amount actually committed.
type CommitHoldResult struct {
	AccountID uuid.UUID
	Amount    int
}

func (uc *CommitHoldUC) Handle(ctx context.Context, cmd *CommitHoldCommand) (*CommitHoldResult, error) {
	var res *CommitHoldResult

	// retry due to optimistic concurrency (OCC)
	err := withRetry(ctx, func() error {
		// reconstitute into account aggregate
		acc, err := uc.repo.FindByBidID(ctx, cmd.BidID)

		if err != nil {
			return fmt.Errorf("commit hold uc handle FindByBidID for bid_id %s: %w", cmd.BidID, err)
		}

		before := acc.Snapshot()

		amount, err := acc.CommitHold(cmd.BidID, cmd.ExpectedAmount, cmd.Now)

		if err != nil {
			return fmt.Errorf("commit hold uc handle CommitHold for bid_id %s: %w", cmd.BidID, err)
		}

		// persist — a no-op when the hold was already committed, since the
		// snapshot then carries no change
		err = uc.repo.Save(ctx, acc, before)

		if err != nil {
			return fmt.Errorf("commit hold uc handle Save for bid_id %s: %w", cmd.BidID, err)
		}

		res = &CommitHoldResult{AccountID: before.ID, Amount: amount}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return res, nil
}
