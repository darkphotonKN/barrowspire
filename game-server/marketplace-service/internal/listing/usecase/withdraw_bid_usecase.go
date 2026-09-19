package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// WithdrawBidUC cancels a bid the caller owns. Ownership is enforced by the
// domain, which compares the bid's member against MemberID — so MemberID must be
// the authenticated caller, never taken from the request body.
//
// Withdrawing the current leader does NOT promote the runner-up. See
// docs/outline/bids.md §2 — a promoted runner-up would have no hold backing it.
type WithdrawBidUC struct {
	repo listing.Repository
}

func NewWithdrawBidUC(repo listing.Repository) *WithdrawBidUC {
	return &WithdrawBidUC{
		repo: repo,
	}
}

type WithdrawBidCommand struct {
	ListingID uuid.UUID
	BidID     uuid.UUID
	MemberID  uuid.UUID
	Now       time.Time
}

func (uc *WithdrawBidUC) Handle(ctx context.Context, cmd WithdrawBidCommand) error {
	return withRetry(ctx, func() error {
		listingDomain, err := uc.repo.FindByID(ctx, cmd.ListingID)

		if err != nil {
			return fmt.Errorf("withdraw bid usecase handle findByID listing id %v : %w", cmd.ListingID, err)
		}

		before := listingDomain.Snapshot()

		if err := listingDomain.WithdrawBid(cmd.BidID, cmd.MemberID, cmd.Now); err != nil {
			return fmt.Errorf("withdraw bid usecase handle withdrawing bid id %v : %w", cmd.BidID, err)
		}

		if err := uc.repo.Save(ctx, listingDomain, before); err != nil {
			return fmt.Errorf("withdraw bid usecase handle saving listing id %v : %w", cmd.ListingID, err)
		}

		return nil
	})
}
