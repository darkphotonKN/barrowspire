package withdrawlisting

import (
	"context"
	"sync"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

// fakeActivities stands in for items' ReturnItem and wallet's ReleaseAllHolds,
// registered under their contract names. The real activities are tested in their
// own services. Each records its input and queue, and can be scripted to fail.
type fakeActivities struct {
	mu sync.Mutex

	returnIn      itemsactivity.ReturnItemInput
	returnQueue   string
	returnCalls   int
	returnFailing int   // the first N attempts fail transiently
	returnErr     error // returned on every attempt when set

	releaseIn      walletactivity.ReleaseAllHoldsInput
	releaseQueue   string
	releaseCalls   int
	releaseFailing int
}

func (f *fakeActivities) returnItem(ctx context.Context, in itemsactivity.ReturnItemInput) (itemsactivity.ReturnItemOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.returnCalls++
	f.returnIn = in
	f.returnQueue = activity.GetInfo(ctx).TaskQueue
	if f.returnErr != nil {
		return itemsactivity.ReturnItemOutput{}, f.returnErr
	}
	if f.returnCalls <= f.returnFailing {
		return itemsactivity.ReturnItemOutput{}, temporal.NewApplicationError("items unreachable", "Transient")
	}
	return itemsactivity.ReturnItemOutput{}, nil
}

func (f *fakeActivities) releaseAllHolds(ctx context.Context, in walletactivity.ReleaseAllHoldsInput) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.releaseCalls++
	f.releaseIn = in
	f.releaseQueue = activity.GetInfo(ctx).TaskQueue
	if f.releaseCalls <= f.releaseFailing {
		return temporal.NewApplicationError("wallet unreachable", "Transient")
	}
	return nil
}

func newWorkflowEnv(t *testing.T, f *fakeActivities) *testsuite.TestWorkflowEnvironment {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterActivityWithOptions(f.returnItem, activity.RegisterOptions{Name: itemsactivity.ReturnItemActivityName})
	env.RegisterActivityWithOptions(f.releaseAllHolds, activity.RegisterOptions{Name: walletactivity.ReleaseAllHoldsActivityName})
	return env
}

// FS-V7A5S Req 7: the item goes back to its seller, fenced on the listing, on the
// items queue; every bid's hold is released on the wallet queue.
func TestWorkflow_ReturnsTheItemAndReleasesEveryHold(t *testing.T) {
	in := Input{ListingID: uuid.New(), ItemID: uuid.New(), BidIDs: []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}}
	f := &fakeActivities{}
	env := newWorkflowEnv(t, f)

	env.ExecuteWorkflow(Workflow, in)

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())

	assert.Equal(t, 1, f.returnCalls)
	assert.Equal(t, itemsactivity.ReturnItemInput{ItemID: in.ItemID, ListingID: in.ListingID}, f.returnIn)
	assert.Equal(t, bstemporal.QueueItems.String(), f.returnQueue, "items owns the item, so its worker returns it")

	assert.Equal(t, 1, f.releaseCalls)
	assert.Equal(t, walletactivity.ReleaseAllHoldsInput{ListingID: in.ListingID, BidIDs: in.BidIDs}, f.releaseIn)
	assert.Equal(t, bstemporal.QueueWallet.String(), f.releaseQueue, "wallet owns the holds, so its worker releases them")
}

// A listing without bids still has its item to give back; the release is
// scheduled anyway with an empty set, which wallet answers as nothing to do.
func TestWorkflow_NoBids_StillReturnsTheItem(t *testing.T) {
	in := Input{ListingID: uuid.New(), ItemID: uuid.New(), BidIDs: []uuid.UUID{}}
	f := &fakeActivities{}
	env := newWorkflowEnv(t, f)

	env.ExecuteWorkflow(Workflow, in)

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Equal(t, 1, f.returnCalls)
}

// Retries are uncapped: stopping short leaves the item LISTED under a withdrawn
// listing, or a bidder's gold reserved, which is strictly worse than retrying.
func TestWorkflow_TransientFailures_AreRetriedUntilBothLand(t *testing.T) {
	f := &fakeActivities{returnFailing: 4, releaseFailing: 3}
	env := newWorkflowEnv(t, f)

	env.ExecuteWorkflow(Workflow, Input{ListingID: uuid.New(), ItemID: uuid.New(), BidIDs: []uuid.UUID{uuid.New()}})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Equal(t, 5, f.returnCalls)
	assert.Equal(t, 4, f.releaseCalls)
}

// The two steps are independent. A return items says can never happen (the item
// is not LISTED under this listing) fails the run visibly, but the bidders still
// get their gold back.
func TestWorkflow_ImpossibleReturn_FailsTheRunButStillReleasesTheHolds(t *testing.T) {
	f := &fakeActivities{returnErr: temporal.NewNonRetryableApplicationError("item not listed", "ReturnItemImpossible", nil)}
	env := newWorkflowEnv(t, f)

	env.ExecuteWorkflow(Workflow, Input{ListingID: uuid.New(), ItemID: uuid.New(), BidIDs: []uuid.UUID{uuid.New()}})

	require.True(t, env.IsWorkflowCompleted())
	assert.Error(t, env.GetWorkflowError())
	assert.Equal(t, 1, f.returnCalls, "non-retryable: not attempted again")
	assert.Equal(t, 1, f.releaseCalls, "the holds are released regardless")
}
