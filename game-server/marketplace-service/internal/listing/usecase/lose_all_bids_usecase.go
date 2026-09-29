package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// LoseAllBidsUC is marketplace's share of the pre-pivot rollback (FS-NXP1W §Req 12):
// every bid still in contention on the listing becomes LOST, including one step 1a
// already moved to WON.
//
// It runs under Update's row lock, so the bids are read and rewritten with no
// writer able to move one in between. No withRetry: a rollback action is retried
// without a cap by the workflow (§Req 12, 36), and nesting a second loop would hide
// how many attempts it really took.
type LoseAllBidsUC struct {
	repo listing.Repository
}

func NewLoseAllBidsUC(repo listing.Repository) *LoseAllBidsUC {
	return &LoseAllBidsUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type LoseAllBidsCommand struct {
	ListingID uuid.UUID
	Now       time.Time
}

func (uc *LoseAllBidsUC) Handle(ctx context.Context, cmd LoseAllBidsCommand) error {
	err := uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
		return l.LoseAllBids(cmd.Now)
	})
	if err != nil {
		return fmt.Errorf("lose all bids usecase handle listing id %v : %w", cmd.ListingID, err)
	}

	return nil
}
