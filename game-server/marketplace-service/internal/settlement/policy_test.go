package settlement

import (
	"testing"
	"time"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-NXP1W §Req 36: no activity retries without a cap, except the rollback actions
// and RaiseSettlementException. The two policies are what enforce that, so the
// distinction between them is pinned rather than left to whoever wires the next step.
func TestStepOptions_IsCapped(t *testing.T) {
	opts := StepOptions(bstemporal.QueueMarketplace)

	assert.Equal(t, stepCap, opts.ScheduleToCloseTimeout, "an ordinary step gives up and parks")
	assert.Equal(t, bstemporal.QueueMarketplace.String(), opts.TaskQueue)
	require.NotNil(t, opts.RetryPolicy)
	assert.Equal(t, time.Second, opts.RetryPolicy.InitialInterval)
	assert.Equal(t, time.Minute, opts.RetryPolicy.MaximumInterval)
}

func TestUncappedOptions_HasNoDeadline(t *testing.T) {
	opts := UncappedOptions(bstemporal.QueueWallet)

	assert.Zero(t, opts.ScheduleToCloseTimeout,
		"a rollback action must not give up: gold left reserved is worse than retrying forever")
	assert.Equal(t, bstemporal.QueueWallet.String(), opts.TaskQueue)
	require.NotNil(t, opts.RetryPolicy)
	assert.Zero(t, opts.RetryPolicy.MaximumAttempts)
}

// Both policies bound a single attempt, so a hung call cannot occupy a worker slot
// forever even where the step itself is uncapped.
func TestBothPolicies_BoundASingleAttempt(t *testing.T) {
	assert.Equal(t, attemptTimeout, StepOptions(bstemporal.QueueMarketplace).StartToCloseTimeout)
	assert.Equal(t, attemptTimeout, UncappedOptions(bstemporal.QueueMarketplace).StartToCloseTimeout)
}
