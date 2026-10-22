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

// MarkSold is step 6, the settlement's last: the listing moves
// PENDING_SETTLEMENT -> SOLD (FS-NXP1W §Req 33). A thin wrapper (§Req 7): the
// rules live in the use case. An already SOLD listing is success in the domain,
// so it never reaches here as an error.
func (a *Activities) MarkSold(ctx context.Context, in marketplaceactivity.MarkSoldInput) error {
	err := a.markSold.Handle(ctx, usecase.MarkSoldListingCommand{
		ID:  in.ListingID,
		Now: time.Now(),
	})
	if err != nil {
		return classifyMarkSoldErr(in.ListingID, err)
	}

	return nil
}

// markSoldImpossible is the type the workflow matches on. Step 6 is past the
// pivot, so an impossibility is an invariant breach that escalates and parks
// (§Req 13); it never fails the run or rolls anything back.
const markSoldImpossible = "MarkSoldImpossible"

// markSoldNonRetryable is step 6's non-retryable set (§Req 9, ADR-0011). Anything
// absent is transient, the safe default.
var markSoldNonRetryable = []error{
	// the listing is neither PENDING_SETTLEMENT nor SOLD: something other than
	// this settlement moved it, and step 6 never overwrites
	listing.ErrInvalidListingState,
	// no listing to write to
	commonerr.ErrNotFound,
}

func classifyMarkSoldErr(listingID uuid.UUID, err error) error {
	wrapped := fmt.Errorf("mark sold activity listing id %v: %w", listingID, err)

	if isAnyOf(err, markSoldNonRetryable) {
		return temporal.NewNonRetryableApplicationError(
			wrapped.Error(),    // message
			markSoldImpossible, // type, the workflow matches on this
			err,                // cause
		)
	}

	return wrapped // plain error, Temporal retries
}
