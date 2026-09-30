package settlement

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

// The workflow schedules FreezeListing by its contract name, so the test stands a
// fake in under that same name. Only the name and signature matter here; the real
// activity is tested in the listing package.
func newWorkflowEnv(t *testing.T, freeze func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error)) *testsuite.TestWorkflowEnvironment {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterActivityWithOptions(freeze, activity.RegisterOptions{Name: marketplaceactivity.FreezeListingActivityName})
	return env
}

func TestWorkflow_FreezesTheListingOnTheMarketplaceQueue(t *testing.T) {
	listingID := uuid.New()
	frozen := marketplaceactivity.FreezeListingOutput{
		Outcome:   marketplaceactivity.OutcomeNoBids,
		ListingID: listingID,
	}

	var gotIn marketplaceactivity.FreezeListingInput
	var gotQueue string
	env := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		gotIn = in
		gotQueue = activity.GetInfo(ctx).TaskQueue
		return frozen, nil
	})

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Equal(t, listingID, gotIn.ListingID)
	assert.Equal(t, bstemporal.QueueMarketplace.String(), gotQueue)

	// Temporary return value (see workflow.go); only checked loosely.
	var out marketplaceactivity.FreezeListingOutput
	require.NoError(t, env.GetWorkflowResult(&out))
	assert.Equal(t, listingID, out.ListingID)
}

// A freeze that can never succeed fails the run. Non-retryable, so the test does not
// sit through the step's retry cap.
func TestWorkflow_FreezeFailure_FailsTheWorkflow(t *testing.T) {
	env := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return marketplaceactivity.FreezeListingOutput{}, temporal.NewNonRetryableApplicationError("listing not active", "FreezeListingImpossible", nil)
	})

	env.ExecuteWorkflow(Workflow, Input{ListingID: uuid.New(), Trigger: TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	assert.Error(t, env.GetWorkflowError())
}
