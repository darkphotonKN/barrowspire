package releasehold

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
)

// Retry shape for the release. Starting values, explicitly tuning — but unlike
// settlement's steps there is no cap to tune: see ReleaseOptions.
const (
	attemptTimeout  = 30 * time.Second
	backoffInitial  = time.Second
	backoffMaximum  = time.Minute
	backoffExponent = 2.0
)

// ReleaseOptions is retried until the release lands. It has nothing to escalate to:
// stopping short leaves a bidder's gold reserved behind a bid that does not exist,
// which is strictly worse than retrying for as long as it takes.
//
// No ScheduleToCloseTimeout and MaximumAttempts 0, so there is no point at which it
// gives up. A release wallet says can never happen is the one way out, and that is
// the activity's call — it returns non-retryable, and the run fails visibly.
func ReleaseOptions(queue bstemporal.TaskQueue) workflow.ActivityOptions {
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
