package settlement

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
)

// releaseAllHoldsChange gates ReleaseAllHolds in rollBack (I-NXP1W-6), inserted
// between LoseAllBids and UnfreezeItem after the rollback had shipped. The change
// ID is recorded in every history that takes the new path, so it never changes.
// Once no run recorded before it can still replay, the minimum can be raised to
// releaseAllHoldsVersion and the branch dropped, keeping the GetVersion call.
const (
	releaseAllHoldsChange  = "rollback-release-all-holds"
	releaseAllHoldsVersion = workflow.Version(1)
)

// impossible reports whether a step's error is a semantic impossibility, the only
// failure that rolls back (FS-NXP1W §Req 12, ADR-0018). runUntilDone also returns
// when the workflow is cancelled; that is not a reason to undo anything.
func impossible(err error) bool {
	var appErr *temporal.ApplicationError
	return errors.As(err, &appErr) && appErr.NonRetryable()
}

// beforePivotFailure is what a step before the pivot does with its runUntilDone
// error: an impossibility rolls the settlement back; anything else — the
// workflow being cancelled — is returned as it is, with nothing undone.
func beforePivotFailure(ctx workflow.Context, listingID uuid.UUID, step string, err error, frozen *marketplaceactivity.FreezeListingOutput) error {
	if impossible(err) {
		return rollBack(ctx, listingID, step, err, frozen)
	}
	return err
}

// rollBack undoes a settlement that can never succeed before the pivot (FS-NXP1W
// §Req 12) and returns the error the run fails with, so a rolled-back settlement
// stands out in the Temporal UI.
//
// frozen is nil when 0a itself was impossible: nothing was frozen and no item is
// known, so only the listing is asked to fail — and MarkSettlementFailed leaves a
// listing another flow already ended as it is. Its bids and item belong to that
// flow and are not touched.
//
// The actions run uncapped (§Req 36) on a context the workflow's cancellation
// cannot reach, so a rollback that has started never stops halfway. They are
// idempotent, so a replay after a crash runs them again harmlessly.
func rollBack(ctx workflow.Context, listingID uuid.UUID, step string, cause error, frozen *marketplaceactivity.FreezeListingOutput) error {
	ctx, _ = workflow.NewDisconnectedContext(ctx)
	marketCtx := workflow.WithActivityOptions(ctx, UncappedOptions(bstemporal.QueueMarketplace))
	itemsCtx := workflow.WithActivityOptions(ctx, UncappedOptions(bstemporal.QueueItems))
	walletCtx := workflow.WithActivityOptions(ctx, UncappedOptions(bstemporal.QueueWallet))

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

	// LOST before the holds go back: a LOST bid still claims its hold, so the
	// reconciler never races this rollback for the gold
	err = workflow.ExecuteActivity(marketCtx,
		marketplaceactivity.LoseAllBidsActivityName,
		marketplaceactivity.LoseAllBidsInput{ListingID: listingID},
	).Get(ctx, nil)
	if err != nil {
		return fmt.Errorf("%w; losing the bids: %w", failed, err)
	}

	// every hold 0a found, the winner's included: before the pivot nothing has been
	// spent. wallet skips a bid it holds nothing for, and one already released.
	//
	// Version-gated: a rollback recorded before this step existed replays straight
	// from LoseAllBids to UnfreezeItem, and leaves its holds to the sweeper.
	if workflow.GetVersion(ctx, releaseAllHoldsChange, workflow.DefaultVersion, releaseAllHoldsVersion) >= releaseAllHoldsVersion {
		err = workflow.ExecuteActivity(walletCtx,
			walletactivity.ReleaseAllHoldsActivityName,
			walletactivity.ReleaseAllHoldsInput{ListingID: listingID, BidIDs: frozen.BidIDs},
		).Get(ctx, nil)
		if err != nil {
			return fmt.Errorf("%w; releasing the holds: %w", failed, err)
		}
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
