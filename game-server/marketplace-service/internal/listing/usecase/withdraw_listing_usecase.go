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

type WithdrawListingUC struct {
	repo listing.Repository
}

func NewWithdrawListingUC(repo listing.Repository) *WithdrawListingUC {
	return &WithdrawListingUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type WithdrawListingCommand struct {
	ID  uuid.UUID
	Now time.Time
}

func (uc *WithdrawListingUC) Handle(ctx context.Context, cmd WithdrawListingCommand) error {
	return withRetry(func() error {
		listingDomain, err := uc.repo.FindByID(ctx, cmd.ID)

		if err != nil {
			return fmt.Errorf("withddraw listing usecase handle findByID listing id %v : %w", cmd.ID, err)
		}

		before := listingDomain.Snapshot()

		err = listingDomain.Withdraw(cmd.Now)

		if err != nil {
			return fmt.Errorf("withdraw listing usecase update status: %w", err)
		}

		err = uc.repo.Save(ctx, listingDomain, before)

		if err != nil {
			// propgate error with usecase context
			return fmt.Errorf("writing repo usecase inserting new listing : %w", err)
		}

		return nil
	})
}
