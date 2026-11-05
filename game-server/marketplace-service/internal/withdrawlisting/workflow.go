// Package withdrawlisting carries out a seller's withdrawal after it is written:
// the item goes back to its seller and every bid's hold is released (FS-V7A5S
// Req 7, ADR-0051). Marketplace hosts the workflow; items and wallet run the
// steps on their own queues, through their existing activities.
package withdrawlisting

import (
	"errors"

	"github.com/google/uuid"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/activitypolicy"
)

const WorkflowName = "WithdrawListing"

// Input is read under the same row lock that withdrew the listing, so no bid can
// join the set after it. BidIDs is every bid on the listing, statuses unfiltered:
// wallet skips a bid it holds nothing for.
type Input struct {
	ListingID uuid.UUID   `json:"listing_id"`
	ItemID    uuid.UUID   `json:"item_id"`
	BidIDs    []uuid.UUID `json:"bid_ids"`
}

// Workflow returns the item and releases every hold, durably. The two steps are
// independent, so both are scheduled at once and each runs to its own end: an item
// that can never be returned does not keep the bidders' gold.
//
// Both retry without a cap (activitypolicy.Uncapped): stopping short leaves the
// item LISTED under a withdrawn listing, or gold reserved behind a LOST bid, and
// nothing else would pick either up. A step its owner says can never happen fails
// the run, visible in Temporal like a failed hold release.
func Workflow(ctx workflow.Context, in Input) error {
	itemsCtx := workflow.WithActivityOptions(ctx, activitypolicy.Uncapped(bstemporal.QueueItems))
	walletCtx := workflow.WithActivityOptions(ctx, activitypolicy.Uncapped(bstemporal.QueueWallet))

	// fenced on the listing id, so a retry can never pull the item out of a relist
	returned := workflow.ExecuteActivity(itemsCtx,
		itemsactivity.ReturnItemActivityName,
		itemsactivity.ReturnItemInput{ItemID: in.ItemID, ListingID: in.ListingID},
	)
	released := workflow.ExecuteActivity(walletCtx,
		walletactivity.ReleaseAllHoldsActivityName,
		walletactivity.ReleaseAllHoldsInput{ListingID: in.ListingID, BidIDs: in.BidIDs},
	)

	return errors.Join(returned.Get(ctx, nil), released.Get(ctx, nil))
}

func Register(w worker.Worker) {
	w.RegisterWorkflowWithOptions(Workflow, workflow.RegisterOptions{Name: WorkflowName})
}
