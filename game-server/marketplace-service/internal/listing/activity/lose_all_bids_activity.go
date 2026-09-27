package activity

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// LoseAllBids is marketplace's share of the pre-pivot rollback (FS-NXP1W §Req 12).
//
// Deliberately unclassified, unlike the forward steps: a rollback action is retried
// without a cap and has nothing to fall back to, so there is no such thing as a
// non-retryable failure here. Every failure is returned plain and tried again.
func (a *Activities) LoseAllBids(ctx context.Context, in marketplaceactivity.LoseAllBidsInput) error {
	err := a.loseAllBids.Handle(ctx, usecase.LoseAllBidsCommand{
		ListingID: in.ListingID,
		Now:       time.Now(),
	})
	if err != nil {
		return fmt.Errorf("lose all bids activity listing id %v: %w", in.ListingID, err)
	}

	return nil
}
