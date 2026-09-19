package activity

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
)

type SetWinBidFailedInput struct {
	ListingID uuid.UUID
	BuyerID   uuid.UUID
	SoldPrice int
	Now       time.Time
}

func (a *Activities) SetWinFailedBid(ctx context.Context, input SetWinBidFailedInput) error {
	err := a.setWinBidFailed.Handle(ctx, usecase.SetWinBidFailedCommand{
		ID:        input.ListingID,
		BuyerID:   input.BuyerID,
		SoldPrice: input.SoldPrice,
		Now:       input.Now,
	})
	if err != nil {
		return fmt.Errorf("set win bid activity listing id %v: %w", input.ListingID, err)
	}

	return nil
}
