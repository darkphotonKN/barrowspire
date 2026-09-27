package activity

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
)

// ReleaseAllHolds is wallet's share of the pre-pivot rollback (FS-NXP1W §Req 12).
//
// Deliberately unclassified, unlike CommitHold: a rollback action is retried without
// a cap and has nothing to fall back to, so there is no such thing as a non-retryable
// failure here. Every failure is returned plain and tried again — a bidder whose gold
// stays held is the one outcome this step must never settle for.
func (a *Activities) ReleaseAllHolds(ctx context.Context, in walletactivity.ReleaseAllHoldsInput) error {
	err := a.releaseAllHolds.Handle(ctx, &usecase.ReleaseAllHoldsCommand{
		BidIDs: in.BidIDs,
		Now:    time.Now(),
	})
	if err != nil {
		return fmt.Errorf("release all holds activity listing id %v: %w", in.ListingID, err)
	}

	return nil
}
