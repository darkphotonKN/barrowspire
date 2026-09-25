package temporal

import (
	"context"
	"errors"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/worker"

	"go.temporal.io/sdk/temporal"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// INBOUND ADAPTER for temporal
type Activity struct {
	freezeListingWriter FreezeListingWriter
}

func NewActivity(freezeListingWriter FreezeListingWriter) *Activity {
	return &Activity{
		freezeListingWriter: freezeListingWriter,
	}
}

type FreezeListingWriter interface {
	Handle(ctx context.Context, cmd usecase.FreezelistingCommand) (*dto.FreezeListingDto, error)
}

func (a *Activity) FreezeListing(ctx context.Context, inp commonactivity.FreezeListingInput) (commonactivity.FreezeListingOutput, error) {
	// call freeze listing uc to attempt to freeze listing
	res, err := a.freezeListingWriter.Handle(ctx, usecase.FreezelistingCommand{
		ListingID: inp.ListingID,
	})

	if err != nil {
		return commonactivity.FreezeListingOutput{}, a.classifyFreezeErr(err)
	}

	out := commonactivity.FreezeListingOutput{
		ListingID: res.ListingID,
		ItemID:    res.ItemID,
		SellerID:  res.SellerID,
	}

	// legit no winner case when there are no bids, return early with no winner and no bids outcome
	if res.Winner == nil {
		out.Outcome = commonactivity.OutcomeNoBids

		// return value type, temporal convention
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

func (a *Activity) classifyFreezeErr(err error) error {
	switch {
	case errors.Is(err, listing.ErrInvalidListingState),
		errors.Is(err, listing.ErrCorruptListingState),
		errors.Is(err, commonerr.ErrNotFound):
		return temporal.NewNonRetryableApplicationError(
			err.Error(),             // message
			freezeListingImpossible, // type, the workflow matches on this in slice 5
			err,                     // cause
		)
	default:
		return err // plain error, Temporal retries
	}
}

// Register wires this adapter's activities onto a worker. The name comes from
// the shared contract, never from the Go method name: the workflow schedules by
// string, so a rename here would silently stop matching.
func (a *Activity) Register(w worker.Worker) {
	w.RegisterActivityWithOptions(a.FreezeListing, activity.RegisterOptions{
		Name: commonactivity.FreezeListingActivityName,
	})
}
