package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

type ReleaseHoldUC struct {
	repo account.Repository
}

func NewReleaseHoldUC(repo account.Repository) *ReleaseHoldUC {
	return &ReleaseHoldUC{
		repo: repo,
	}
}

type ReleaseHoldCommand struct {
	ID       uuid.UUID
	MemberID uuid.UUID
	BidID    uuid.UUID
}

func (uc *ReleaseHoldUC) Handle(ctx context.Context, cmd *ReleaseHoldCommand) error {
	// retry due to optimistic concurrency (OCC)
	return withRetry(func() error {
		// find account and all its holds, repo reconstitute's
		acc, err := uc.repo.FindByID(ctx, cmd.ID)

		if err != nil {
			return fmt.Errorf("releasehold usecase handle FindById cmd account id %s : %w", cmd.ID, err)
		}

		// snapshot for version
		before := acc.Snapshot()

		// attempt to release hold
		err = acc.ReleaseHold(cmd.BidID, time.Now())

		if err != nil {
			return fmt.Errorf("releasehold usecase handle releasing hold cmd account id %s : %w", cmd.ID, err)
		}

		err = uc.repo.Save(ctx, acc, before)

		if err != nil {
			return fmt.Errorf("releasehold usecase handle saving cmd account id %s : %w", cmd.ID, err)
		}

		// success
		return nil
	})
}
