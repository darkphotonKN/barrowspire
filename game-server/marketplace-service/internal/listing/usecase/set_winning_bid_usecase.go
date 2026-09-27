package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// SetWinningBidUC is settlement step 1a (FS-NXP1W §Req 27): the winner 0a
// selected moves WINNING -> WON.
//
// It runs under Modify's row lock, so the bid's status is checked and changed
// with no writer able to move it in between — the condition is the bid FSM,
// applied inside the lock. No withRetry: the activity wrapping this is retried by
// Temporal under its own capped policy, and nesting a second loop would hide how
// many attempts a step really took.
type SetWinningBidUC struct {
	repo listing.Repository
}

func NewSetWinningBidUC(repo listing.Repository) *SetWinningBidUC {
	return &SetWinningBidUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type SetWinningBidCommand struct {
	ListingID uuid.UUID
	BidID     uuid.UUID
	Now       time.Time
}

func (uc *SetWinningBidUC) Handle(ctx context.Context, cmd SetWinningBidCommand) error {
	err := uc.repo.Modify(ctx, cmd.ListingID, func(l *listing.Listing) error {
		return l.SetWinningBid(cmd.BidID, cmd.Now)
	})
	if err != nil {
		return fmt.Errorf("set winning bid usecase handle listing id %v bid id %v : %w", cmd.ListingID, cmd.BidID, err)
	}

	return nil
}
