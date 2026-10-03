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

// ExpireListing is step NB2, the no-bids arm's last step. A thin wrapper (FS-NXP1W
// §Req 7): the rules live in the use case. What it adds is the classification
// (§Req 9). An already EXPIRED listing is success in the domain, so it never
// reaches here as an error.
func (a *Activities) ExpireListing(ctx context.Context, in marketplaceactivity.ExpireListingInput) error {
	err := a.expireListing.Handle(ctx, usecase.ExpireListingCommand{
		ListingID: in.ListingID,
		Now:       time.Now(),
	})
	if err != nil {
		return classifyExpireListingErr(in.ListingID, err)
	}

	return nil
}

// expireListingImpossible is the type the workflow matches on to escalate and park
// rather than spend another attempt (§Req 34b).
const expireListingImpossible = "ExpireListingImpossible"

// expireListingNonRetryable is NB2's non-retryable set (§Req 9, ADR-0011). Anything
// absent is transient, the safe default.
var expireListingNonRetryable = []error{
	// the listing is neither PENDING_SETTLEMENT nor EXPIRED: something other than
	// this settlement moved it, and NB2 never overwrites
	listing.ErrInvalidListingState,
	// no listing to write to
	commonerr.ErrNotFound,
}

func classifyExpireListingErr(listingID uuid.UUID, err error) error {
	wrapped := fmt.Errorf("expire listing activity listing id %v: %w", listingID, err)

	if isAnyOf(err, expireListingNonRetryable) {
		return temporal.NewNonRetryableApplicationError(
			wrapped.Error(),         // message
			expireListingImpossible, // type, the workflow matches on this
			err,                     // cause
		)
	}

	return wrapped // plain error, Temporal retries
}
