package settlement

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
)

// Retry shape for every settlement step (FS-NXP1W §Req 11). These are starting
// values and explicitly tuning, not contract — but §Req 19's settlement grace on
// hold expiry is chosen to comfortably exceed stepCap, so moving the cap without
// moving the grace lets the hold sweeper race settlement.
const (
	attemptTimeout  = 30 * time.Second
	backoffInitial  = time.Second
	backoffMaximum  = time.Minute
	backoffExponent = 2.0

	// stepCap bounds a step by wall clock rather than by attempt count: what matters
	// is how long a sale can hang, not how many times it was tried (§Req 10).
	stepCap = 30 * time.Minute
)

// StepOptions is the policy for an ordinary step: retry transient failures until the
// cap, then let the workflow escalate and park rather than fail (§Req 10).
//
// MaximumAttempts is 0 — unlimited — on purpose. stepCap is the cap, and expressing
// it once means a slow dependency and a fast-failing one both get the same 30
// minutes instead of the fast one exhausting its attempts in seconds.
func StepOptions(queue bstemporal.TaskQueue) workflow.ActivityOptions {
	return workflow.ActivityOptions{
		TaskQueue:              queue.String(),
		StartToCloseTimeout:    attemptTimeout,
		ScheduleToCloseTimeout: stepCap,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    backoffInitial,
			BackoffCoefficient: backoffExponent,
			MaximumInterval:    backoffMaximum,
			MaximumAttempts:    0,
		},
	}
}

// UncappedOptions is the policy for the two kinds of step that have nothing to
// escalate to (§Req 36): the rollback actions, and RaiseSettlementException, which is
// itself how every other step reports exhaustion.
//
// No ScheduleToCloseTimeout, so there is no deadline at which it gives up. A rollback
// that stopped halfway leaves a bidder's gold reserved forever, which is strictly
// worse than retrying for as long as it takes.
func UncappedOptions(queue bstemporal.TaskQueue) workflow.ActivityOptions {
	return workflow.ActivityOptions{
		TaskQueue:           queue.String(),
		StartToCloseTimeout: attemptTimeout,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    backoffInitial,
			BackoffCoefficient: backoffExponent,
			MaximumInterval:    backoffMaximum,
			MaximumAttempts:    0,
		},
	}
}
