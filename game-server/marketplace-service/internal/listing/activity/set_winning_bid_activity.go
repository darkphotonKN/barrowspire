package activity

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// SetWinningBid is step 1a. A thin wrapper (FS-NXP1W §Req 7): the rules live in
// the use case. Classifying failures into retryable and non-retryable errors is
// slice 6's job; until then every failure is returned as a plain error.
func (a *Activities) SetWinningBid(ctx context.Context, in marketplaceactivity.SetWinningBidInput) error {
	err := a.setWinningBid.Handle(ctx, usecase.SetWinningBidCommand{
		ListingID: in.ListingID,
		BidID:     in.WinnerBidID,
		Now:       time.Now(),
	})
	if err != nil {
		return fmt.Errorf("set winning bid activity listing id %v: %w", in.ListingID, err)
	}

	return nil
}
