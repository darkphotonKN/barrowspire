package usecase

import (
	"context"
	"fmt"

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
type CreateAccountCommand struct {
	MemberID uuid.UUID
	Name     string
}

func (uc *CreateListingUC) Handle(ctx context.Context, cmd CreateAccountCommand) (*listing.Listing, error) {
	// birth aggregate root
	acc, err := listing.NewListing(cmd.MemberID, cmd.Name)

	if err != nil {
		// propgate error with usecase context
		return nil, fmt.Errorf("create listing usecase birthing new listing : %w", err)
	}

	err = uc.repo.Insert(ctx, acc)

	if err != nil {
		// propgate error with usecase context
		return nil, fmt.Errorf("writing repo usecase inserting new listing : %w", err)
	}

	return acc, nil
}
