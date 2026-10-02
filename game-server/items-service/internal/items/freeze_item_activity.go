package items

import (
	"context"
	"errors"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/worker"
)

type ItemsActivity struct {
	service ItemsFreezer
}

type ItemsFreezer interface {
	FreezeItem(ctx context.Context, itemID, sellerID uuid.UUID) error
}

func NewItemsActivity(itemFreezer ItemsFreezer) *ItemsActivity {
	return &ItemsActivity{
		service: itemFreezer,
	}
}

func (a *ItemsActivity) FreezeItemActivity(ctx context.Context, inp commonactivity.FreezeItemInput) (commonactivity.FreezeItemOutput, error) {

	err := a.service.FreezeItem(ctx, inp.ItemID, inp.SellerID)

	if err != nil {
		return commonactivity.FreezeItemOutput{}, classifyFreezeErr(err)
	}

	return commonactivity.FreezeItemOutput{}, nil
}

func (a *ItemsActivity) Register(w worker.Worker) {
	w.RegisterActivityWithOptions(a.FreezeItemActivity, activity.RegisterOptions{
		Name: commonactivity.FreezeItemActivityName,
	})
}

const freezeItemImpossible = "FreezeItemImpossible"

var freezeItemNonRetryableErrors = []error{ErrItemNotFreezable}

func classifyFreezeErr(err error) error {
	// matches errors that should stop the flow early
	if isAnyOf(err, freezeItemNonRetryableErrors) {
		return temporal.NewNonRetryableApplicationError(
			err.Error(),          // message
			freezeItemImpossible, // type to match the workflow
			err,                  // cause
		)
	}

	// retry safely
	return err
}

func isAnyOf(err error, set []error) bool {
	for _, target := range set {
		if errors.Is(err, target) {
			return true
		}
	}

	return false
}
