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
	ID  uuid.UUID
	Now time.Time
}

func (uc *MarkSoldListingUC) Handle(ctx context.Context, cmd MarkSoldListingCommand) error {

	err := uc.repo.Update(ctx, cmd.ID, func(l *listing.Listing) error {
		return l.MarkSold(cmd.Now)
	})
	if err != nil {
		return fmt.Errorf("writing repo usecase mark sold listing : %w", err)
	}
	return nil

}
