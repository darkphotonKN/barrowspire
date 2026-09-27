package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

// ReleaseAllHoldsUC is wallet's share of the pre-pivot rollback (FS-NXP1W §Req 12):
// every hold named by the workflow goes back to RELEASED, the winner's included.
//
// One aggregate per bid, not one sweep: holds on the same listing belong to
// different bidders, so each is a separate account loaded and saved under its own
// optimistic-concurrency check. A bid whose hold is already released is skipped by
// the domain, which is what lets the whole step be re-run.
type ReleaseAllHoldsUC struct {
	repo account.Repository
}

func NewReleaseAllHoldsUC(repo account.Repository) *ReleaseAllHoldsUC {
	return &ReleaseAllHoldsUC{
		repo: repo,
	}
}

type ReleaseAllHoldsCommand struct {
	BidIDs []uuid.UUID
	Now    time.Time
}

func (uc *ReleaseAllHoldsUC) Handle(ctx context.Context, cmd *ReleaseAllHoldsCommand) error {
	for _, bidID := range cmd.BidIDs {
		if err := uc.releaseOne(ctx, bidID, cmd.Now); err != nil {
			// named so a partial rollback says which bid it stopped on; the step is
			// retried from the beginning and the ones already done are no-ops
			return fmt.Errorf("release all holds uc handle bid_id %s: %w", bidID, err)
		}
	}

	return nil
}

func (uc *ReleaseAllHoldsUC) releaseOne(ctx context.Context, bidID uuid.UUID, now time.Time) error {
	// retry due to optimistic concurrency (OCC)
	return withRetry(ctx, func() error {
		acc, err := uc.repo.FindByBidID(ctx, bidID)

		if err != nil {
			return fmt.Errorf("FindByBidID: %w", err)
		}

		before := acc.Snapshot()

		if err := acc.ReleaseHold(bidID, now); err != nil {
			return fmt.Errorf("ReleaseHold: %w", err)
		}

		// a no-op when the hold was already released: the snapshot carries no change
		if err := uc.repo.Save(ctx, acc, before); err != nil {
			return fmt.Errorf("Save: %w", err)
		}

		return nil
	})
}
