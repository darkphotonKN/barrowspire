package settlement

import (
	"github.com/google/uuid"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

const WorkflowName = "SettleAuction"

type Input struct {
	ListingID uuid.UUID           `json:"listing_id"`
	Trigger   usecase.TriggerKind `json:"trigger"`
}

// FS NXP1W Settlement Saga
func Workflow(ctx workflow.Context, in Input) (marketplaceactivity.FreezeListingOutput, error) {
	marketPlaceCtx := workflow.WithActivityOptions(ctx, StepOptions(bstemporal.QueueMarketplace))

	// declare our own variables, temporal makes them durable because of event history
	var frozen marketplaceactivity.FreezeListingOutput

	// Step 0a
	err := workflow.ExecuteActivity(marketPlaceCtx,
		marketplaceactivity.FreezeListingActivityName,
		marketplaceactivity.FreezeListingInput{ListingID: in.ListingID},
	).Get(marketPlaceCtx, &frozen)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	if frozen.Outcome == marketplaceactivity.OutcomeNoBids {
		returnItemsCtx := workflow.WithActivityOptions(ctx, StepOptions(bstemporal.QueueItems))

		// Step NB1
		err := workflow.ExecuteActivity(returnItemsCtx,
			itemsactivity.ReturnItemActivityName,
			itemsactivity.ReturnItemInput{ItemID: frozen.ItemID, ListingID: frozen.ListingID},
		).Get(returnItemsCtx, nil)
		if err != nil {
			return marketplaceactivity.FreezeListingOutput{}, err
		}

		expireListingCtx := workflow.WithActivityOptions(ctx, StepOptions(bstemporal.QueueMarketplace))

		// Step NB2, only once NB1 has returned the item (§Req 34b)
		// TODO(I-NXP1W-7): an impossible NB2 escalates and parks rather than failing the run
		err = workflow.ExecuteActivity(expireListingCtx,
			marketplaceactivity.ExpireListingActivityName,
			marketplaceactivity.ExpireListingInput{ListingID: frozen.ListingID},
		).Get(expireListingCtx, nil)
		if err != nil {
			return marketplaceactivity.FreezeListingOutput{}, err
		}

		// TODO: update to a workflow specific response wrapper later
		return frozen, nil
	}

	// Step 0b
	freezeItemCtx := workflow.WithActivityOptions(ctx, StepOptions(bstemporal.QueueItems))

	err = workflow.ExecuteActivity(freezeItemCtx,
		itemsactivity.FreezeItemActivityName,
		itemsactivity.FreezeItemInput{ItemID: frozen.ItemID, SellerID: frozen.SellerID},
	).Get(freezeItemCtx, nil)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	// Temporary: returned so the result shows in the UI. Later steps replace this.
	return frozen, nil
}

func Register(w worker.Worker) {
	w.RegisterWorkflowWithOptions(Workflow, workflow.RegisterOptions{Name: WorkflowName})
}
