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

// ReleaseLosingHolds is step 2 (FS-NXP1W §Req 29), the first step of the tail: the
// pivot has spent the winner's gold, so every other bidder's reservation goes back.
//
// It rolls forward and never undoes anything (ADR-0017). A losing bidder still
// holding gold is a parked settlement, never a failed one.
func (a *Activities) ReleaseLosingHolds(ctx context.Context, in walletactivity.ReleaseLosingHoldsInput) (walletactivity.ReleaseLosingHoldsOutput, error) {
	released, err := a.releaseLosingHolds.Handle(ctx, &usecase.ReleaseLosingHoldsCommand{
		WinnerBidID:  in.WinnerBidID,
		LosingBidIDs: in.LosingBidIDs,
		Now:          time.Now(),
	})
	if err != nil {
		return walletactivity.ReleaseLosingHoldsOutput{}, classifyReleaseLosingHoldsErr(in.ListingID, err)
	}

	return walletactivity.ReleaseLosingHoldsOutput{ReleasedCount: released}, nil
}

// releaseLosingHoldsImpossible is the type the workflow matches on. Past the pivot it
// does NOT mean roll back — there is no rollback in the tail — it means an invariant
// breach that escalates and parks (§Req 13).
const releaseLosingHoldsImpossible = "ReleaseLosingHoldsImpossible"

// releaseLosingHoldsNonRetryable is step 2's non-retryable set (§Req 9, ADR-0011).
//
// Deliberately smaller than the pivot's. Mislabelling a transient failure here is
// expensive in a way it is not before the pivot: the buyer has already paid, so a
// step that gives up leaves losing bidders' gold reserved with no path back. A hold
// simply missing is not in the set either — the use case skips a bid that never had
// one, so it never reaches this point.
var releaseLosingHoldsNonRetryable = []error{
	// a losing bid's hold cannot move to RELEASED, which past the pivot means it is
	// COMMITTED: the workflow's winner/loser split disagrees with wallet's records,
	// and no retry reconciles that
	account.ErrInvalidHoldTransition,
	// the account was found through the hold and then did not have it
	account.ErrHoldNotFound,
}

func classifyReleaseLosingHoldsErr(listingID uuid.UUID, err error) error {
	wrapped := fmt.Errorf("release losing holds activity listing id %v: %w", listingID, err)

	if isAnyOf(err, releaseLosingHoldsNonRetryable) {
		return temporal.NewNonRetryableApplicationError(
			wrapped.Error(),              // message
			releaseLosingHoldsImpossible, // type, the workflow matches on this
			err,                          // cause
		)
	}

	return wrapped // plain error, Temporal retries
}
