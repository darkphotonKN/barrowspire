package activity

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
)

// ReleaseHold gives back one bid's reservation, for marketplace's release workflow: a
// bid proven never recorded, or one withdrawn from the auction.
//
// A thin wrapper over the same use case the ReleaseHold RPC calls, so the rules for
// releasing a hold stay written once. A missing hold or one already released is
// success there, which is what lets the workflow retry blind.
func (a *Activities) ReleaseHold(ctx context.Context, in walletactivity.ReleaseHoldInput) error {
	err := a.releaseHold.Handle(ctx, &usecase.ReleaseHoldCommand{
		BidID: in.BidID,
		Now:   time.Now(),
	})
	if err != nil {
		return classifyReleaseHoldErr(in.ListingID, in.BidID, err)
	}

	return nil
}

// releaseHoldImpossible is the type the workflow matches on: a release no retry can
// make happen, surfaced as a failed run rather than retried forever.
const releaseHoldImpossible = "ReleaseHoldImpossible"

// releaseHoldNonRetryable is deliberately small. The workflow retries without a cap,
// so a transient failure mislabelled here strands the gold for good; only a hold that
// cannot move to RELEASED belongs in it.
var releaseHoldNonRetryable = []error{
	// the hold is COMMITTED: the bid won and its gold is spent, so marketplace asking
	// for it back contradicts wallet's records, and no retry reconciles that
	account.ErrInvalidHoldTransition,
	// the account was found through the hold and then did not have it
	account.ErrHoldNotFound,
}

func classifyReleaseHoldErr(listingID, bidID uuid.UUID, err error) error {
	wrapped := fmt.Errorf("release hold activity listing id %v bid id %v: %w", listingID, bidID, err)

	if isAnyOf(err, releaseHoldNonRetryable) {
		return temporal.NewNonRetryableApplicationError(
			wrapped.Error(),       // message
			releaseHoldImpossible, // type, the workflow matches on this
			err,                   // cause
		)
	}

	return wrapped // plain error, Temporal retries
}
