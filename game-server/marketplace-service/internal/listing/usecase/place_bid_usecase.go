package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// PlaceBidUC coordinates a bid against an existing listing: load the aggregate,
// let the domain apply its rules, persist. All of the bidding logic — the price
// threshold, demoting the previous leader, the single-winner invariant — lives in
// Listing.PlaceBid; this usecase only sequences the load-modify-save.
//
// NOTE: this writes to marketplace's database only. The buyer's gold is NOT held
// yet — that requires the wallet saga, which is a later stage.
type PlaceBidUC struct {
	repo listing.Repository
}

func NewPlaceBidUC(repo listing.Repository) *PlaceBidUC {
	return &PlaceBidUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type PlaceBidCommand struct {
	ListingID uuid.UUID
	MemberID  uuid.UUID
	Amount    int
	Now       time.Time
}

func (uc *PlaceBidUC) Handle(ctx context.Context, cmd PlaceBidCommand) error {
	// retry due to optimistic concurrency (OCC) — two bidders racing for the
	// lead on the same listing is the expected case, not an exceptional one
	return withRetry(ctx, func() error {
		listingDomain, err := uc.repo.FindByID(ctx, cmd.ListingID)

		if err != nil {
			return fmt.Errorf("place bid usecase handle findByID listing id %v : %w", cmd.ListingID, err)
		}

		// snapshot BEFORE the domain mutates, this is the OCC version baseline
		// and the diff source for which bids are new or demoted
		before := listingDomain.Snapshot()

		if err := listingDomain.PlaceBid(cmd.MemberID, cmd.Amount, cmd.Now); err != nil {
			return fmt.Errorf("place bid usecase handle placing bid on listing id %v : %w", cmd.ListingID, err)
		}

		if err := uc.repo.Save(ctx, listingDomain, before); err != nil {
			return fmt.Errorf("place bid usecase handle saving listing id %v : %w", cmd.ListingID, err)
		}

		return nil
	})
}
