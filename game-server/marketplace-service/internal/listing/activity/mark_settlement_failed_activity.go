package activity

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// MarkSettlementFailed is marketplace's share of the pre-pivot rollback (FS-NXP1W
// §Req 12): the listing ends SETTLEMENT_FAILED.
//
// Deliberately unclassified, like LoseAllBids: a rollback action is retried
// without a cap and has nothing to fall back to, so every failure is returned
// plain and tried again.
func (a *Activities) MarkSettlementFailed(ctx context.Context, in marketplaceactivity.MarkSettlementFailedInput) error {
	err := a.markSettlementFailed.Handle(ctx, usecase.MarkSettlementFailedCommand{
		ListingID: in.ListingID,
		Now:       time.Now(),
	})
	if err != nil {
		return fmt.Errorf("mark settlement failed activity listing id %v: %w", in.ListingID, err)
	}

	return nil
}
