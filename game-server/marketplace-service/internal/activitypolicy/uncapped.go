// Package activitypolicy holds the activity options marketplace's workflows share.
// It sits outside any one workflow so that a workflow reuses a policy without
// importing another workflow's package.
package activitypolicy

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
)

// Retry shape for an uncapped step. Starting values, explicitly tuning — but unlike
// settlement's capped steps there is no cap to tune: see Uncapped.
const (
	attemptTimeout  = 30 * time.Second
	backoffInitial  = time.Second
	backoffMaximum  = time.Minute
	backoffExponent = 2.0
)

// Uncapped is retried until the step lands, for a step with nothing to escalate to:
// a hold release (releasehold), and a withdrawn listing's item return and releases
// (withdrawlisting). Stopping short leaves a bidder's gold reserved behind a bid that
// does not exist, or an item LISTED under a withdrawn listing, which is strictly
// worse than retrying for as long as it takes.
//
// No ScheduleToCloseTimeout and MaximumAttempts 0, so there is no point at which it
// gives up. A step its owner says can never happen is the one way out, and that is
// the activity's call — it returns non-retryable, and the run fails visibly.
func Uncapped(queue bstemporal.TaskQueue) workflow.ActivityOptions {
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
