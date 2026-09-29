package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

// ReleaseHoldUC gives back one reservation: the compensating half of PlaceHold, for
// a caller that reserved gold and then could not record the bid it was for.
//
// One bid rather than a set, because this runs on a bidder's request path where
// exactly one hold is in question. Settlement's release steps take sets and live in
// ReleaseAllHoldsUC and ReleaseLosingHoldsUC; all three share holdReleaser, so the
// rules for releasing one hold are written once.
//
// wallet cannot judge whether the bid exists — it has no bid or listing concept, and
// bid_id on a hold is the caller's claim about what the gold was for, not proof that
// anything was recorded. So this is a command from the service that minted the id.
type ReleaseHoldUC struct {
	releaser holdReleaser
}

func NewReleaseHoldUC(repo account.Repository) *ReleaseHoldUC {
	return &ReleaseHoldUC{
		releaser: holdReleaser{repo: repo},
	}
}

type ReleaseHoldCommand struct {
	BidID uuid.UUID
	Now   time.Time
}

// Handle succeeds whether it released the hold, found it already released, or found
// no hold at all. The caller compensates blind — when PlaceBid's write fails it does
// not know whether PlaceHold landed first — so "there was nothing to give back" is an
// outcome, not a fault.
func (uc *ReleaseHoldUC) Handle(ctx context.Context, cmd *ReleaseHoldCommand) error {
	if _, err := uc.releaser.releaseOne(ctx, cmd.BidID, cmd.Now); err != nil {
		return fmt.Errorf("release hold uc handle bid_id %s: %w", cmd.BidID, err)
	}

	return nil
}
