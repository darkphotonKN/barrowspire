package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

type CommitHoldUC struct {
	repo account.Repository
}

func NewCommitHoldUC(repo account.Repository) *CommitHoldUC {
	return &CommitHoldUC{
		repo: repo,
	}
}

type CommitHoldCommand struct {
	MemberID uuid.UUID
	BidID    uuid.UUID
}

func (uc *CommitHoldUC) Handle(ctx context.Context, cmd *CommitHoldCommand) error {
	return withRetry(func() error {
		// reconstitute into account aggregate
		acc, err := uc.repo.FindByMemberID(ctx, cmd.MemberID)

		if err != nil {
			return fmt.Errorf("commit gold uc handle FindByMemberID for bid_id %s: %w", cmd.BidID, err)
		}

		before := acc.Snapshot()

		// use bidID to find corresponding walletID
		err = acc.CommitHold(cmd.BidID, time.Now())

		if err != nil {
			return fmt.Errorf("commit gold uc handle CommitHold for bid_id %s: %w", cmd.BidID, err)
		}

		// persist
		err = uc.repo.Save(ctx, acc, before)

		if err != nil {
			return fmt.Errorf("commit gold uc handle Save for bid_id %s: %w", cmd.BidID, err)
		}

		return nil
	})
}
