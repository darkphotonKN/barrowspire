package items

import (
	"context"
	"log/slog"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/worker"
)

type ReturnItemActivity struct {
	service ReturnItemWriter
}

type ReturnItemWriter interface {
	ReturnItem(ctx context.Context, id, listingID uuid.UUID) error
}

func NewReturnItemsActivity(returnItemRepo ReturnItemWriter) *ReturnItemActivity {
	return &ReturnItemActivity{
		service: returnItemRepo,
	}
}

func (a *ReturnItemActivity) ReturnItemActivity(ctx context.Context, inp commonactivity.ReturnItemInput) (commonactivity.ReturnItemOutput, error) {
	err := a.service.ReturnItem(ctx, inp.ItemID, inp.ListingID)

	if err != nil {
		// log based on severity
		if isAnyOf(err, returnItemNonRetryableErrors) {
			slog.Error("not retryable", "err", err, "item_id", inp.ItemID,
				"listing_id", inp.ListingID)
			return commonactivity.ReturnItemOutput{}, classifyReturnItemErr(err)
		}

		slog.Warn("failed to run return item, retrying", "err", err, "item_id", inp.ItemID,
			"listing_id", inp.ListingID,
		)

		return commonactivity.ReturnItemOutput{}, err
	}

	return commonactivity.ReturnItemOutput{}, nil
}

func (a *ReturnItemActivity) Register(w worker.Worker) {
	w.RegisterActivityWithOptions(a.ReturnItemActivity, activity.RegisterOptions{
		Name: commonactivity.ReturnItemActivityName,
	})
}

const returnItemImpossible = "ReturnItemImpossible"

var returnItemNonRetryableErrors = []error{ErrItemCorrupted, ErrNoItemFound}

func classifyReturnItemErr(err error) error {
	// matches errors that should stop the flow early
	if isAnyOf(err, returnItemNonRetryableErrors) {
		return temporal.NewNonRetryableApplicationError(
			err.Error(),          // message
			returnItemImpossible, // type to match the workflow
			err,                  // cause
		)
	}

	// can retry safely
	return err
}
