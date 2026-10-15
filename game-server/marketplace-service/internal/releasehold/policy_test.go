package releasehold

import (
	"testing"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A release has nothing to escalate to: stopping short leaves the gold reserved, which
// is strictly worse than retrying. So the policy pins "no deadline, no attempt cap".
func TestReleaseOptions_HasNoDeadline(t *testing.T) {
	opts := ReleaseOptions(bstemporal.QueueWallet)

	assert.Zero(t, opts.ScheduleToCloseTimeout, "a release must not give up while the gold is still held")
	assert.Equal(t, bstemporal.QueueWallet.String(), opts.TaskQueue)
	require.NotNil(t, opts.RetryPolicy)
	assert.Zero(t, opts.RetryPolicy.MaximumAttempts)
}

// Uncapped overall, but a single attempt is still bounded, so a hung call cannot hold
// a worker slot forever.
func TestReleaseOptions_BoundsASingleAttempt(t *testing.T) {
	assert.Equal(t, attemptTimeout, ReleaseOptions(bstemporal.QueueWallet).StartToCloseTimeout)
}
