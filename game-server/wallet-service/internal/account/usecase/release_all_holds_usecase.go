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
// Before the pivot nothing has been spent, so there is no hold it must leave alone —
// which is the whole difference between this and ReleaseLosingHoldsUC.
type ReleaseAllHoldsUC struct {
	releaser holdReleaser
}

func NewReleaseAllHoldsUC(repo account.Repository) *ReleaseAllHoldsUC {
	return &ReleaseAllHoldsUC{
		releaser: holdReleaser{repo: repo},
	}
}

type ReleaseAllHoldsCommand struct {
	BidIDs []uuid.UUID
	Now    time.Time
}

func (uc *ReleaseAllHoldsUC) Handle(ctx context.Context, cmd *ReleaseAllHoldsCommand) error {
	// the count is step 2's to report; a rollback only has to finish
	if _, err := uc.releaser.releaseEach(ctx, cmd.BidIDs, cmd.Now); err != nil {
		return fmt.Errorf("release all holds uc handle: %w", err)
	}

	return nil
}
