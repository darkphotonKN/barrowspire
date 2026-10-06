package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// AcceptBidUsecase is the AcceptBid settlement trigger (FS-NXP1W §Req 3): the
// seller ends their auction early at its current WINNING bid.
//
// It only decides and starts. The read is unlocked on purpose: nothing here
// writes, and 0a re-checks the listing under the row lock, so a listing that
// changes between this check and the start is caught there. The workflow ID
// dedups a start that races the expiry poller (§Req 5).
type AcceptBidUsecase struct {
	repo              listing.Repository
	settlementStarter SettlementStarter
}

func NewAcceptBidUsecase(repo listing.Repository, settlementStarter SettlementStarter) *AcceptBidUsecase {
	return &AcceptBidUsecase{
		repo:              repo,
		settlementStarter: settlementStarter,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
//
// No bid ID: the seller accepts whichever bid is WINNING, and 0a selects it the
// same way for every trigger (§Req 3, 5).
type AcceptBidCommand struct {
	ListingID uuid.UUID
	MemberID  uuid.UUID
	Now       time.Time
}

func (uc *AcceptBidUsecase) Handle(ctx context.Context, cmd AcceptBidCommand) error {
	l, err := uc.repo.FindByID(ctx, cmd.ListingID)
	if err != nil {
		return fmt.Errorf("accept bid usecase findbyid listing id %v : %w", cmd.ListingID, err)
	}

	if err := l.CanAcceptBid(cmd.MemberID, cmd.Now); err != nil {
		return fmt.Errorf("accept bid usecase listing id %v : %w", cmd.ListingID, err)
	}

	// call start that starts the flow in temporal, initiating the settlement saga flow
	if err := uc.settlementStarter.StartSettlement(ctx, cmd.ListingID, TriggerAcceptBid); err != nil {
		return fmt.Errorf("accept bid usecase start settlement listing id %v : %w", cmd.ListingID, err)
	}

	return nil
}
