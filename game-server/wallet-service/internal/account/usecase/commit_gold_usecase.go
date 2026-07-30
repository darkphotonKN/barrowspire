package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

type CommitGoldUC struct {
	repo account.Repository
}

func NewCommitGoldUC(repo account.Repository) *CommitGoldUC {
	return &CommitGoldUC{
		repo: repo,
	}
}

type CommitGoldCommand struct {
	MemberID uuid.UUID
	BidID    uuid.UUID
}

func (uc *CommitGoldUC) Handle(ctx context.Context, cmd *CommitGoldCommand) error {
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
