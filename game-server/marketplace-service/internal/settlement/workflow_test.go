package settlement

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

// noBidsArm records what the no-bids arm's fakes were asked to do, in order, so a
// test can prove NB2 only ever runs after NB1.
type noBidsArm struct {
	calls       []string
	returnIn    itemsactivity.ReturnItemInput
	expireIn    marketplaceactivity.ExpireListingInput
	expireQueue string
	expireErr   error
}

// The workflow schedules each step by its contract name, so the test stands fakes
// in under those same names. Only the name and signature matter here; the real
// activities are tested in their owning packages.
func newWorkflowEnv(t *testing.T, freeze func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error)) (*testsuite.TestWorkflowEnvironment, *noBidsArm) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterActivityWithOptions(freeze, activity.RegisterOptions{Name: marketplaceactivity.FreezeListingActivityName})

	arm := &noBidsArm{}
	env.RegisterActivityWithOptions(func(ctx context.Context, in itemsactivity.ReturnItemInput) error {
		arm.calls = append(arm.calls, itemsactivity.ReturnItemActivityName)
		arm.returnIn = in
		return nil
	}, activity.RegisterOptions{Name: itemsactivity.ReturnItemActivityName})
	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.ExpireListingInput) error {
		arm.calls = append(arm.calls, marketplaceactivity.ExpireListingActivityName)
		arm.expireIn = in
		arm.expireQueue = activity.GetInfo(ctx).TaskQueue
		return arm.expireErr
	}, activity.RegisterOptions{Name: marketplaceactivity.ExpireListingActivityName})

	return env, arm
}

func TestWorkflow_FreezesTheListingOnTheMarketplaceQueue(t *testing.T) {
	listingID := uuid.New()
	frozen := marketplaceactivity.FreezeListingOutput{
		Outcome:   marketplaceactivity.OutcomeNoBids,
		ListingID: listingID,
	}

	var gotIn marketplaceactivity.FreezeListingInput
	var gotQueue string
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		gotIn = in
		gotQueue = activity.GetInfo(ctx).TaskQueue
		return frozen, nil
	})

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerExpiry})

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
	env, _ := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return marketplaceactivity.FreezeListingOutput{}, temporal.NewNonRetryableApplicationError("listing not active", "FreezeListingImpossible", nil)
	})

	env.ExecuteWorkflow(Workflow, Input{ListingID: uuid.New(), Trigger: usecase.TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	assert.Error(t, env.GetWorkflowError())
}

// Zero bids (FS-NXP1W §Req 8, 34a, 34b): the item goes back to its seller, then
// the listing expires. Nothing else runs, so no wallet, ledger or bid step is even
// registered here; scheduling one would fail the run.
func TestWorkflow_NoBids_ReturnsTheItemThenExpiresTheListing(t *testing.T) {
	listingID, itemID := uuid.New(), uuid.New()
	env, arm := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return marketplaceactivity.FreezeListingOutput{
			Outcome:   marketplaceactivity.OutcomeNoBids,
			ListingID: listingID,
			ItemID:    itemID,
		}, nil
	})

	env.ExecuteWorkflow(Workflow, Input{ListingID: listingID, Trigger: usecase.TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Equal(t, []string{itemsactivity.ReturnItemActivityName, marketplaceactivity.ExpireListingActivityName}, arm.calls)
	assert.Equal(t, listingID, arm.expireIn.ListingID)
	assert.Equal(t, bstemporal.QueueMarketplace.String(), arm.expireQueue)
}

// A listing NB2 finds in any other status is an invariant breach (§Req 34b).
// TODO(I-NXP1W-7): escalate and park instead; until that helper exists the run fails.
func TestWorkflow_NoBids_ExpireImpossible_FailsTheWorkflow(t *testing.T) {
	env, arm := newWorkflowEnv(t, func(ctx context.Context, in marketplaceactivity.FreezeListingInput) (marketplaceactivity.FreezeListingOutput, error) {
		return marketplaceactivity.FreezeListingOutput{Outcome: marketplaceactivity.OutcomeNoBids, ListingID: in.ListingID}, nil
	})
	arm.expireErr = temporal.NewNonRetryableApplicationError("listing sold", "ExpireListingImpossible", nil)

	env.ExecuteWorkflow(Workflow, Input{ListingID: uuid.New(), Trigger: usecase.TriggerExpiry})

	require.True(t, env.IsWorkflowCompleted())
	assert.Error(t, env.GetWorkflowError())
}
