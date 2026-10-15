package settlement

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
)

// impossible reports whether a step's error is a semantic impossibility, the only
// failure that rolls back (FS-NXP1W §Req 12, ADR-0018). runUntilDone also returns
// when the workflow is cancelled; that is not a reason to undo anything.
func impossible(err error) bool {
	var appErr *temporal.ApplicationError
	return errors.As(err, &appErr) && appErr.NonRetryable()
}

// rollBack undoes a settlement that can never succeed before the pivot (FS-NXP1W
// §Req 12) and returns the error the run fails with, so a rolled-back settlement
// stands out in the Temporal UI.
//
// frozen is nil when 0a itself was impossible: nothing was frozen and no item is
// known, so only the listing is asked to fail — and MarkSettlementFailed leaves a
// listing another flow already ended as it is.
//
// The actions run uncapped (§Req 36) on a context the workflow's cancellation
// cannot reach, so a rollback that has started never stops halfway. They are
// idempotent, so a replay after a crash runs them again harmlessly.
func rollBack(ctx workflow.Context, listingID uuid.UUID, step string, cause error, frozen *marketplaceactivity.FreezeListingOutput) error {
	ctx, _ = workflow.NewDisconnectedContext(ctx)
	marketCtx := workflow.WithActivityOptions(ctx, UncappedOptions(bstemporal.QueueMarketplace))
	itemsCtx := workflow.WithActivityOptions(ctx, UncappedOptions(bstemporal.QueueItems))

	failed := fmt.Errorf("settlement rolled back at %s: %w", step, cause)

	// recorded first, so the exception exists however long the rest takes
	err := workflow.ExecuteActivity(marketCtx,
		marketplaceactivity.RaiseSettlementExceptionActivityName,
		marketplaceactivity.RaiseSettlementExceptionInput{
			ListingID:  listingID,
			WorkflowID: workflow.GetInfo(ctx).WorkflowExecution.ID,
			Step:       step,
			Reason:     cause.Error(),
		}).Get(ctx, nil)
	if err != nil {
		return fmt.Errorf("%w; recording the rollback: %w", failed, err)
	}

	err = workflow.ExecuteActivity(marketCtx,
		marketplaceactivity.MarkSettlementFailedActivityName,
		marketplaceactivity.MarkSettlementFailedInput{ListingID: listingID},
	).Get(ctx, nil)
	if err != nil {
		return fmt.Errorf("%w; failing the listing: %w", failed, err)
	}

	if frozen == nil {
		return failed
	}

	err = workflow.ExecuteActivity(itemsCtx,
		itemsactivity.UnfreezeItemActivityName,
		itemsactivity.UnfreezeItemInput{ItemID: frozen.ItemID, SellerID: frozen.SellerID, ListingID: frozen.ListingID},
	).Get(ctx, nil)
	if err != nil {
		return fmt.Errorf("%w; unfreezing the item: %w", failed, err)
	}

	return failed
}
