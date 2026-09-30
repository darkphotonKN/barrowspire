package activity

import (
	"context"

	"go.temporal.io/sdk/temporal"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// FreezeListing is settlement step 0a: the listing stops accepting bids and the
// winner is selected in the same transaction. Unlike the steps after it, this one
// classifies its own failures, because the workflow branches on the outcome
// no bids is a legitimate ending, not an error.
func (a *Activities) FreezeListing(ctx context.Context, inp commonactivity.FreezeListingInput) (commonactivity.FreezeListingOutput, error) {
	// call freeze listing uc to attempt to freeze listing
	res, err := a.freezeListing.Handle(ctx, usecase.FreezelistingCommand{
		ListingID: inp.ListingID,
	})

	if err != nil {
		return commonactivity.FreezeListingOutput{}, classifyFreezeErr(err)
	}

	out := commonactivity.FreezeListingOutput{
		ListingID: res.ListingID,
		ItemID:    res.ItemID,
		SellerID:  res.SellerID,
	}

	// legit no winner case when there are no bids, return early with no winner and no bids outcome
	if res.Winner == nil {
		out.Outcome = commonactivity.OutcomeNoBids

		return out, nil
	}

	// winner case, safe to access winner field
	out.Outcome = commonactivity.OutcomeHasWinner
	out.WinnerBidID = res.Winner.WinnerBidID
	out.WinnerMemberID = res.Winner.WinnerMemberID
	out.Amount = int64(res.Winner.Amount)

	return out, nil
}

const freezeListingImpossible = "FreezeListingImpossible"

// freezeListingNonRetryable is 0a's non-retryable set (§Req 9, ADR-0011).
var freezeListingNonRetryable = []error{
	// the listing is not ACTIVE: withdrawn, already settled, or racing another
	// outcome. Freezing it is not something a retry brings back
	listing.ErrInvalidListingState,
	listing.ErrCorruptListingState,
	// no listing to freeze
	commonerr.ErrNotFound,
}

func classifyFreezeErr(err error) error {
	if isAnyOf(err, freezeListingNonRetryable) {
		return temporal.NewNonRetryableApplicationError(
			err.Error(),             // message
			freezeListingImpossible, // type, the workflow matches on this in slice 5
			err,                     // cause
		)
	}

	return err // plain error, Temporal retries
}
