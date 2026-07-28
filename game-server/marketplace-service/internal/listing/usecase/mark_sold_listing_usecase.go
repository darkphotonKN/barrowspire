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

type MarkSoldListingUC struct {
	repo listing.Repository
}

func NewMarkSoldListingUC(repo listing.Repository) *MarkSoldListingUC {
	return &MarkSoldListingUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type MarkSoldListingCommand struct {
	ID        uuid.UUID
	BuyerID   uuid.UUID
	SoldPrice int
	Now       time.Time
}

func (uc *MarkSoldListingUC) Handle(ctx context.Context, cmd MarkSoldListingCommand) error {
	return withRetry(func() error {
		listingDomain, err := uc.repo.FindByID(ctx, cmd.ID)

		if err != nil {
			return fmt.Errorf("MarkSold listing usecase handle findByID listing id %v : %w", cmd.ID, err)
		}

		before := listingDomain.Snapshot()

		err = listingDomain.MarkSold(cmd.Now, cmd.BuyerID, cmd.SoldPrice)

		if err != nil {
			return fmt.Errorf("MarkSold listing usecase update listing: %w", err)
		}

		err = uc.repo.Save(ctx, listingDomain, before)

		if err != nil {
			// propgate error with usecase context
			return fmt.Errorf("writing repo usecase inserting new listing : %w", err)
		}

		return nil
	})
}
