package items

import (
	"context"
	"fmt"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"
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
		return commonactivity.ReturnItemOutput{}, fmt.Errorf("ReturnItemActivity retrun item : %w", err)
	}

	return commonactivity.ReturnItemOutput{}, nil
}

func (a *ReturnItemActivity) Register(w worker.Worker) {
	w.RegisterActivityWithOptions(a.ReturnItemActivity, activity.RegisterOptions{
		Name: commonactivity.ReturnItemActivityName,
	})
}

// const freezeItemImpossible = "FreezeItemImpossible"
//
// var freezeItemNonRetryableErrors = []error{ErrItemNotFreezable}
//
// func classifyFreezeErr(err error) error {
// 	// matches errors that should stop the flow early
// 	if isAnyOf(err, freezeItemNonRetryableErrors) {
// 		return temporal.NewNonRetryableApplicationError(
// 			err.Error(),          // message
// 			freezeItemImpossible, // type to match the workflow
// 			err,                  // cause
// 		)
// 	}
//
// 	// retry safely
// 	return err
// }
//
// func isAnyOf(err error, set []error) bool {
// 	for _, target := range set {
// 		if errors.Is(err, target) {
// 			return true
// 		}
// 	}
//
// 	return false
// }
