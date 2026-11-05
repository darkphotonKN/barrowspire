package activitypolicy

import (
	"testing"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// An uncapped step has nothing to escalate to: stopping short leaves the gold
// reserved or the item listed, which is strictly worse than retrying. So the policy
// pins "no deadline, no attempt cap".
func TestUncapped_HasNoDeadline(t *testing.T) {
	opts := Uncapped(bstemporal.QueueWallet)

	assert.Zero(t, opts.ScheduleToCloseTimeout, "an uncapped step must not give up while it is still owed")
	assert.Equal(t, bstemporal.QueueWallet.String(), opts.TaskQueue)
	require.NotNil(t, opts.RetryPolicy)
	assert.Zero(t, opts.RetryPolicy.MaximumAttempts)
}

// Uncapped overall, but a single attempt is still bounded, so a hung call cannot hold
// a worker slot forever.
func TestUncapped_BoundsASingleAttempt(t *testing.T) {
	assert.Equal(t, attemptTimeout, Uncapped(bstemporal.QueueWallet).StartToCloseTimeout)
}
