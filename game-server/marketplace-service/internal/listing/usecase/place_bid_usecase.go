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
	// IdempotencyKey is uuid.Nil when the caller supplied none. A repeated
	// placement carrying the same key is accepted as a replay rather than
	// becoming a second bid.
	IdempotencyKey uuid.UUID
	Now            time.Time
}

func (uc *PlaceBidUC) Handle(ctx context.Context, cmd PlaceBidCommand) error {
	// Modify holds a row lock across load-modify-save, so two bidders racing for
	// the lead queue rather than collide. That replaces the previous OCC retry
	// loop: there is no longer a window between reading the listing and writing
	// it for another writer to slip into.
	err := uc.repo.Modify(ctx, cmd.ListingID, func(l *listing.Listing) error {
		return l.PlaceBid(cmd.MemberID, cmd.Amount, cmd.IdempotencyKey, cmd.Now)
	})
	if err != nil {
		return fmt.Errorf("place bid usecase handle listing id %v : %w", cmd.ListingID, err)
	}

	return nil
}
