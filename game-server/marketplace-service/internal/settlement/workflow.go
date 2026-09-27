package settlement

import (
	"github.com/google/uuid"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

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

	var frozen marketplaceactivity.FreezeListingOutput
	err := workflow.ExecuteActivity(ctx,
		marketplaceactivity.FreezeListingActivityName,
		marketplaceactivity.FreezeListingInput{ListingID: in.ListingID},
	).Get(ctx, &frozen)
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	// Temporary: returned so the result shows in the UI. Later steps replace this.
	return frozen, nil
}

func Register(w worker.Worker) {
	w.RegisterWorkflowWithOptions(Workflow, workflow.RegisterOptions{Name: WorkflowName})
}
