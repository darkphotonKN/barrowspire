package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// ExpireListingUC is settlement step NB2 (FS-NXP1W §Req 34b): a frozen listing
// nobody won moves PENDING_SETTLEMENT -> EXPIRED.
//
// It runs under Update's row lock, so the status is checked and changed with no
// writer able to move it in between. No withRetry: the activity wrapping this is
// retried by Temporal under its own capped policy.
type ExpireListingUC struct {
	repo listing.Repository
}

func NewExpireListingUC(repo listing.Repository) *ExpireListingUC {
	return &ExpireListingUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type ExpireListingCommand struct {
	ListingID uuid.UUID
	Now       time.Time
}

func (uc *ExpireListingUC) Handle(ctx context.Context, cmd ExpireListingCommand) error {
	err := uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
		return l.Expire(cmd.Now)
	})
	if err != nil {
		return fmt.Errorf("expire listing usecase handle listing id %v : %w", cmd.ListingID, err)
	}

	return nil
}
