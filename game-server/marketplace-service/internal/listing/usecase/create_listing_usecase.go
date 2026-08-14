package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// Usecase
// Coordinator of the domain, incoming requests, and outbound calls like
// repository and external services.
// Recommended to keep our structure with thin slices of functionality in each usecase

type CreateListingUC struct {
	repo listing.Repository
}

func NewCreateListingUC(repo listing.Repository) *CreateListingUC {
	return &CreateListingUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type CreateListingCommand struct {
	SellerID   uuid.UUID
	ItemID     uuid.UUID
	StartPrice int
	Now        time.Time
	EndsAt     time.Time
}

func (uc *CreateListingUC) Handle(ctx context.Context, cmd *CreateListingCommand) error {

	// birth aggregate root
	listingDomain, err := listing.NewListing(cmd.SellerID, cmd.ItemID, cmd.StartPrice, cmd.Now, cmd.EndsAt)

	if err != nil {
		// propgate error with usecase context
		return fmt.Errorf("create listing usecase birthing new listing : %w", err)
	}

	err = listingDomain.Publish(cmd.Now)

	if err != nil {
		return fmt.Errorf("create listing usecase publishing listing: %w", err)
	}

	err = uc.repo.Insert(ctx, listingDomain)

	if err != nil {
		if errors.Is(err, commonconstants.ErrDuplicateResource) {
			slog.Info("listing already exists for item, skipping duplicate event",
				"item_id", cmd.ItemID)
			return fmt.Errorf("create listing usecase already exists for item: %w", err)
		}
		// propgate error with usecase context
		return fmt.Errorf("writing repo usecase inserting new listing : %w", err)
	}

	return nil
}
