package releasehold

import (
	"github.com/google/uuid"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
)

const WorkflowName = "ReleaseHold"

type Input struct {
	ListingID uuid.UUID `json:"listing_id"`
	BidID     uuid.UUID `json:"bid_id"`
}

// Workflow gives back one bid's hold, durably. A single step on wallet's queue
// (ADR-0011: wallet owns the hold, so its worker releases it), retried until it lands
// — the run outlives the request that started it, and a marketplace restart in
// between loses nothing.
func Workflow(ctx workflow.Context, in Input) error {
	walletCtx := workflow.WithActivityOptions(ctx, ReleaseOptions(bstemporal.QueueWallet))

	return workflow.ExecuteActivity(walletCtx,
		walletactivity.ReleaseHoldActivityName,
		walletactivity.ReleaseHoldInput{ListingID: in.ListingID, BidID: in.BidID},
	).Get(walletCtx, nil)
}

func Register(w worker.Worker) {
	w.RegisterWorkflowWithOptions(Workflow, workflow.RegisterOptions{Name: WorkflowName})
}
