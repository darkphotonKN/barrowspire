package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// MarkSettlementFailedUC is marketplace's share of the pre-pivot rollback
// (FS-NXP1W §Req 12): a frozen listing ends SETTLEMENT_FAILED.
//
// It runs under Update's row lock. The rollback is retried without a cap, so it
// must eventually return nil for every listing it can be handed: the aggregate
// leaves other statuses alone, and a missing listing has nothing to fail.
type MarkSettlementFailedUC struct {
	repo listing.Repository
}

func NewMarkSettlementFailedUC(repo listing.Repository) *MarkSettlementFailedUC {
	return &MarkSettlementFailedUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type MarkSettlementFailedCommand struct {
	ListingID uuid.UUID
	Now       time.Time
}

func (uc *MarkSettlementFailedUC) Handle(ctx context.Context, cmd MarkSettlementFailedCommand) error {
	err := uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
		return l.MarkSettlementFailed(cmd.Now)
	})

	// 0a is impossible for a listing that does not exist, and that rollback lands
	// here: nothing to fail
	if errors.Is(err, commonconstants.ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("mark settlement failed usecase handle listing id %v : %w", cmd.ListingID, err)
	}

	return nil
}
