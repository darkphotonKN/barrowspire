package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// Usecase
// Coordinator of the domain, incoming requests, and outbound calls like
// repository and external services.
// Recommended to keep our structure with thin slices of functionality in each usecase

type SetWinBidFailedUC struct {
	repo listing.Repository
}

func NewSetWinBidFailedUC(repo listing.Repository) *SetWinBidFailedUC {
	return &SetWinBidFailedUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type SetWinBidFailedCommand struct {
	ID        uuid.UUID
	BuyerID   uuid.UUID
	SoldPrice int
	Now       time.Time
}

func (uc *SetWinBidFailedUC) Handle(ctx context.Context, cmd SetWinBidFailedCommand) error {
	return withRetry(func() error {
		listingDomain, err := uc.repo.FindByID(ctx, cmd.ID)

		if err != nil {
			return fmt.Errorf("SetWinBid listing usecase handle findByID listing id %v : %w", cmd.ID, err)
		}

		before := listingDomain.Snapshot()

		err = listingDomain.MarkSold(cmd.Now, cmd.BuyerID, cmd.SoldPrice)

		if err != nil {
			return fmt.Errorf("SetWinBid listing usecase update listing: %w", err)
		}

		err = uc.repo.Save(ctx, listingDomain, before)

		if err != nil {
			// propgate error with usecase context
			return fmt.Errorf("writing repo usecase inserting new listing : %w", err)
		}

		return nil
	})
}
