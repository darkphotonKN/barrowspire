package items

import (
	"context"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/worker"
)

type TransferItemsActivity struct {
	service ItemsTransfer
}

type ItemsTransfer interface {
	TransferItem(ctx context.Context, itemID, buyerID, listingID uuid.UUID) error
}

func NewTransferItemsActivity(itemTransfer ItemsTransfer) *TransferItemsActivity {
	return &TransferItemsActivity{
		service: itemTransfer,
	}
}

func (a *TransferItemsActivity) TransferItemActivity(ctx context.Context, inp commonactivity.TransferItemInput) (commonactivity.TransferItemOutput, error) {

	err := a.service.TransferItem(ctx, inp.ItemID, inp.BuyerMemberID, inp.ListingID)

	if err != nil {
		return commonactivity.TransferItemOutput{}, classifyTransferErr(err)
	}

	return commonactivity.TransferItemOutput{}, nil
}

func (a *TransferItemsActivity) Register(w worker.Worker) {
	w.RegisterActivityWithOptions(a.TransferItemActivity, activity.RegisterOptions{
		Name: commonactivity.TransferItemActivityName,
	})
}

const transferItemImpossible = "TransferItemImpossible"

var transferItemNonRetryableErrors = []error{ErrItemNotTransfer}

func classifyTransferErr(err error) error {
	// matches errors that should stop the flow early
	if isAnyOf(err, transferItemNonRetryableErrors) {
		return temporal.NewNonRetryableApplicationError(
			err.Error(),            // message
			transferItemImpossible, // type to match the workflow
			err,                    // cause
		)
	}

	// can retry safely
	return err
}
