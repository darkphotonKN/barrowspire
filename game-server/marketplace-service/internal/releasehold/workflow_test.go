package releasehold

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

// The workflow schedules wallet's activity by its contract name, so the test stands a
// fake in under that same name. The real activity is tested in wallet-service.
func newWorkflowEnv(t *testing.T, release func(ctx context.Context, in walletactivity.ReleaseHoldInput) error) *testsuite.TestWorkflowEnvironment {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterActivityWithOptions(release, activity.RegisterOptions{Name: walletactivity.ReleaseHoldActivityName})
	return env
}

func TestWorkflow_ReleasesTheHoldOnTheWalletQueue(t *testing.T) {
	in := Input{ListingID: uuid.New(), BidID: uuid.New()}

	var gotIn walletactivity.ReleaseHoldInput
	var gotQueue string
	env := newWorkflowEnv(t, func(ctx context.Context, got walletactivity.ReleaseHoldInput) error {
		gotIn = got
		gotQueue = activity.GetInfo(ctx).TaskQueue
		return nil
	})

	env.ExecuteWorkflow(Workflow, in)

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Equal(t, walletactivity.ReleaseHoldInput{ListingID: in.ListingID, BidID: in.BidID}, gotIn)
	assert.Equal(t, bstemporal.QueueWallet.String(), gotQueue, "wallet owns the hold, so its worker releases it")
}

// A transient failure is retried until the release lands: giving up would leave the
// bidder's gold reserved behind a bid that does not exist.
func TestWorkflow_TransientFailure_IsRetriedUntilTheReleaseLands(t *testing.T) {
	attempts := 0
	env := newWorkflowEnv(t, func(ctx context.Context, in walletactivity.ReleaseHoldInput) error {
		attempts++
		if attempts < 3 {
			return temporal.NewApplicationError("wallet unreachable", "Transient")
		}
		return nil
	})

	env.ExecuteWorkflow(Workflow, Input{ListingID: uuid.New(), BidID: uuid.New()})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Equal(t, 3, attempts)
}

// A release wallet says can never happen fails the run, so it surfaces as a failed
// workflow instead of retrying forever.
func TestWorkflow_ImpossibleRelease_FailsTheWorkflow(t *testing.T) {
	attempts := 0
	env := newWorkflowEnv(t, func(ctx context.Context, in walletactivity.ReleaseHoldInput) error {
		attempts++
		return temporal.NewNonRetryableApplicationError("hold committed", "ReleaseHoldImpossible", nil)
	})

	env.ExecuteWorkflow(Workflow, Input{ListingID: uuid.New(), BidID: uuid.New()})

	require.True(t, env.IsWorkflowCompleted())
	assert.Error(t, env.GetWorkflowError())
	assert.Equal(t, 1, attempts)
}
