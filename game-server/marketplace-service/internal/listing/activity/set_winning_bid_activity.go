package activity

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
)

// SetWinningBid is step 1a. A thin wrapper (FS-NXP1W §Req 7): the rules live in
// the use case. What it adds is the classification the workflow branches on
// (§Req 9) — 1a is the last step a rollback can still undo.
func (a *Activities) SetWinningBid(ctx context.Context, in marketplaceactivity.SetWinningBidInput) error {
	err := a.setWinningBid.Handle(ctx, usecase.SetWinningBidCommand{
		ListingID: in.ListingID,
		BidID:     in.WinnerBidID,
		Now:       time.Now(),
	})
	if err != nil {
		return classifySetWinningBidErr(in.ListingID, err)
	}

	return nil
}

// setWinningBidImpossible is the type the workflow matches on to decide a rollback
// rather than another attempt.
const setWinningBidImpossible = "SetWinningBidImpossible"

// setWinningBidNonRetryable is 1a's non-retryable set, declared in one place rather
// than spread through a switch (§Req 9, ADR-0011). Anything absent is transient,
// the safe default: a wasted retry costs a cap, a wrong rollback costs a sale.
var setWinningBidNonRetryable = []error{
	// the bid the freeze step chose is gone, so no attempt can mark it won
	listing.ErrBidNotFound,
	// the bid is no longer WINNING. Only WINNING -> WON is whitelisted, so the FSM
	// is what decides this, and a demoted bid never becomes the winner again
	listing.ErrInvalidBidTransition,
	// no listing to write to
	commonerr.ErrNotFound,
}

func classifySetWinningBidErr(listingID uuid.UUID, err error) error {
	wrapped := fmt.Errorf("set winning bid activity listing id %v: %w", listingID, err)

	if isAnyOf(err, setWinningBidNonRetryable) {
		return temporal.NewNonRetryableApplicationError(
			wrapped.Error(),         // message
			setWinningBidImpossible, // type, the workflow matches on this
			err,                     // cause
		)
	}

	return wrapped // plain error, Temporal retries
}
