package settlement

import (
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/google/uuid"
	"go.temporal.io/sdk/workflow"
)

// reparkInterval is the re-park timer (FS-NXP1W Req 11): the longest a parked
// step waits for a RetryStep before trying again on its own. Tuning, not contract.
const reparkInterval = time.Hour

// pivotPhase says which side of the pivot (CommitHold, ADR-0010) a step runs on.
// It decides only what a semantic impossibility does; a transient failure parks
// on either side (ADR-0018).
type pivotPhase int

const (
	// beforePivot: nothing is committed yet, so an impossibility is returned for
	// the workflow to roll back to SETTLEMENT_FAILED (Req 12).
	beforePivot pivotPhase = iota
	// afterPivot: the buyer has paid and there is no way back, so an impossibility
	// is an invariant breach that parks like any outage (Req 13).
	afterPivot
)

// runUntilDone runs one settlement step until it succeeds (FS-NXP1W Req 10).
// Each time the step exhausts its cap it escalates and parks until a RetryStep
// signal or the re-park timer, then runs it again. It returns early only when the
// workflow is cancelled, or for an impossibility beforePivot.
func runUntilDone(ctx workflow.Context, listingID uuid.UUID, activityName string, queue bstemporal.TaskQueue, phase pivotPhase, input, output any) error {

	stepCtx := workflow.WithActivityOptions(ctx, StepOptions(queue))
	marketCtx := workflow.WithActivityOptions(ctx, UncappedOptions(bstemporal.QueueMarketplace))

	// outside the loop so a later lap still knows an exception is open
	var raised marketplaceactivity.RaiseSettlementExceptionOutput

	for {
		err := workflow.ExecuteActivity(stepCtx, activityName, input).Get(ctx, output)
		if err == nil {
			if raised.ExceptionID != uuid.Nil {
				resolveException(ctx, marketCtx, raised.ExceptionID)
			}
			return nil // success
		}

		// a cancelled workflow stops here: every call below would fail at once on
		// the cancelled ctx, and the loop would spin instead of parking
		if ctx.Err() != nil {
			return ctx.Err()
		}

		// before the pivot an impossible step is not parked: the caller rolls back
		if phase == beforePivot && impossible(err) {
			// the step is no longer waiting on anything, so an exception an earlier
			// lap raised is closed: the rollback opens its own under the same
			// (workflow, step) key, and an open park row would swallow it
			if raised.ExceptionID != uuid.Nil {
				resolveException(ctx, marketCtx, raised.ExceptionID)
			}
			return err
		}

		// escalate: record the settlement exception and queue settlement.failed
		_ = workflow.ExecuteActivity(marketCtx,
			marketplaceactivity.RaiseSettlementExceptionActivityName,
			marketplaceactivity.RaiseSettlementExceptionInput{
				ListingID:  listingID,
				WorkflowID: workflow.GetInfo(ctx).WorkflowExecution.ID,
				Step:       activityName,
				Reason:     err.Error(),
			}).Get(ctx, &raised)

		// retry
		selector := workflow.NewSelector(ctx) // select {}
		// selector.Add = case
		// AddReceive(a, b) a:waiting channel, b: do thing after received
		selector.AddReceive(workflow.GetSignalChannel(ctx, RetryStepSignalName),
			func(c workflow.ReceiveChannel, more bool) { c.Receive(ctx, nil) })

		// timer
		selector.AddFuture(workflow.NewTimer(ctx, reparkInterval),
			func(f workflow.Future) {})
		// waiting excute
		selector.Select(ctx)

		// cancelled while parked: the timer fires at once on a cancelled ctx, so
		// stop rather than retry
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}

// resolveException closes the exception once its step has succeeded. The step is
// already done, so a resolve that cannot land is logged rather than parking or
// failing the settlement over bookkeeping.
func resolveException(ctx, marketCtx workflow.Context, exceptionID uuid.UUID) {
	err := workflow.ExecuteActivity(marketCtx,
		marketplaceactivity.ResolveSettlementExceptionActivityName,
		marketplaceactivity.ResolveSettlementExceptionInput{ExceptionID: exceptionID},
	).Get(ctx, nil)
	if err != nil {
		workflow.GetLogger(ctx).Warn("settlement exception left open after its step succeeded",
			"exceptionID", exceptionID, "error", err)
	}
}
