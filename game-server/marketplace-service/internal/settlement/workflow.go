package settlement

import (
	"github.com/google/uuid"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
)

const WorkflowName = "SettleAuction"

type TriggerKind string

const (
	TriggerExpiry    TriggerKind = "EXPIRY"
	TriggerAcceptBid TriggerKind = "ACCEPT_BID"
	TriggerBuyout    TriggerKind = "BUYOUT"
)

type Input struct {
	ListingID uuid.UUID   `json:"listing_id"`
	Trigger   TriggerKind `json:"trigger"`
}

// For FS NXP1W the Settlement Saga
func Workflow(ctx workflow.Context, in Input) (marketplaceactivity.FreezeListingOutput, error) {
	ctx = workflow.WithActivityOptions(ctx, StepOptions(bstemporal.QueueMarketplace))

	// declare our own variables, temporal makes them durable because of event history
	var frozen marketplaceactivity.FreezeListingOutput

	// Step 0a
	err := workflow.ExecuteActivity(ctx,
		marketplaceactivity.FreezeListingActivityName,
		marketplaceactivity.FreezeListingInput{ListingID: in.ListingID},
	).Get(ctx, &frozen)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	if frozen.Outcome == marketplaceactivity.OutcomeNoBids {
		// TODO: replaced by expire listing + return items arm
		return frozen, nil
	}

	// Step 0b
	itemCtx := workflow.WithActivityOptions(ctx, StepOptions(bstemporal.QueueItems))

	err = workflow.ExecuteActivity(itemCtx,
		itemsactivity.FreezeItemActivityName,
		itemsactivity.FreezeItemInput{ItemID: frozen.ItemID, SellerID: frozen.SellerID},
	).Get(itemCtx, nil)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	// Temporary: returned so the result shows in the UI. Later steps replace this.
	return frozen, nil
}

func Register(w worker.Worker) {
	w.RegisterWorkflowWithOptions(Workflow, workflow.RegisterOptions{Name: WorkflowName})
}
