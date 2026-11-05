package releasehold

import (
	"context"
	"errors"
	"testing"
	"time"

	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"
)

// fakeClient stands in for the Temporal client. Only ExecuteWorkflow is used by the
// Starter; the embedded interface panics if anything else is ever called.
type fakeClient struct {
	client.Client

	err      error
	calls    int
	gotOpts  client.StartWorkflowOptions
	gotName  any
	gotInput Input

	// run is handed back by ExecuteWorkflow on a successful start and by
	// GetWorkflow, which records which run it was asked for
	run           *fakeRun
	gotWorkflowID string
	gotRunID      string
	getWorkflows  int
}

func (f *fakeClient) ExecuteWorkflow(_ context.Context, opts client.StartWorkflowOptions, workflow any, args ...any) (client.WorkflowRun, error) {
	f.calls++
	f.gotOpts = opts
	f.gotName = workflow
	if len(args) == 1 {
		f.gotInput, _ = args[0].(Input)
	}
	if f.err != nil {
		return nil, f.err
	}
	return f.run, nil
}

func (f *fakeClient) GetWorkflow(_ context.Context, workflowID, runID string) client.WorkflowRun {
	f.getWorkflows++
	f.gotWorkflowID = workflowID
	f.gotRunID = runID
	return f.run
}

// fakeRun stands in for a started run. Get answers err at once, or with block
// waits for the caller's deadline the way a release stuck on wallet would.
type fakeRun struct {
	client.WorkflowRun

	err   error
	block bool
	gets  int

	hadDeadline bool
	gotTimeLeft time.Duration
}

func (r *fakeRun) Get(ctx context.Context, _ any) error {
	r.gets++
	if deadline, ok := ctx.Deadline(); ok {
		r.hadDeadline = true
		r.gotTimeLeft = time.Until(deadline)
	}
	if r.block {
		<-ctx.Done()
		return ctx.Err()
	}
	return r.err
}

// Every caller releasing the same bid's hold must land on the same run, so the ID
// is the bid's, never the listing's.
func TestWorkflowID_IsKeyedByBid(t *testing.T) {
	bidID := uuid.MustParse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")

	assert.Equal(t, "release-hold-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", WorkflowID(bidID))
}

func TestStarter_StartsTheReleaseForTheBid(t *testing.T) {
	listingID, bidID := uuid.New(), uuid.New()
	fake := &fakeClient{}

	err := NewStarter(fake).StartReleaseHold(context.Background(), listingID, bidID)

	require.NoError(t, err)
	require.Equal(t, 1, fake.calls)
	assert.Equal(t, WorkflowID(bidID), fake.gotOpts.ID)
	assert.Equal(t, string(bstemporal.QueueMarketplace), fake.gotOpts.TaskQueue, "marketplace hosts the workflow")
	assert.Equal(t, enumspb.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE, fake.gotOpts.WorkflowIDReusePolicy)
	assert.Equal(t, WorkflowName, fake.gotName)
	assert.Equal(t, Input{ListingID: listingID, BidID: bidID}, fake.gotInput)
}

func TestStarter_StartError(t *testing.T) {
	unavailable := serviceerror.NewUnavailable("temporal down")

	tests := []struct {
		name    string
		err     error
		wantErr error
	}{
		{
			// a closed run under REJECT_DUPLICATE: this hold is already being or has
			// been released, so the caller has nothing left to do
			name:    "already started is success",
			err:     serviceerror.NewWorkflowExecutionAlreadyStarted("already started", "", ""),
			wantErr: nil,
		},
		{
			name:    "any other failure is returned",
			err:     unavailable,
			wantErr: unavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakeClient{err: tt.err}

			err := NewStarter(fake).StartReleaseHold(context.Background(), uuid.New(), uuid.New())

			if tt.wantErr == nil {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.True(t, errors.Is(err, tt.wantErr), "the cause stays reachable for the caller's log")
		})
	}
}

// A release that finishes inside the wait answers success as soon as it does,
// and the wait is bounded by maxWait, never open-ended (ADR-0049).
func TestStarter_ReleaseHoldAndWait_ReturnsOnceTheReleaseFinishes(t *testing.T) {
	listingID, bidID := uuid.New(), uuid.New()
	run := &fakeRun{}
	fake := &fakeClient{run: run}

	err := NewStarter(fake).ReleaseHoldAndWait(context.Background(), listingID, bidID, time.Second)

	require.NoError(t, err)
	assert.Equal(t, 1, fake.calls, "started like StartReleaseHold")
	assert.Equal(t, WorkflowID(bidID), fake.gotOpts.ID)
	assert.Equal(t, Input{ListingID: listingID, BidID: bidID}, fake.gotInput)
	assert.Equal(t, 1, run.gets, "and its result waited on")
	assert.True(t, run.hadDeadline, "the wait has a deadline")
	assert.LessOrEqual(t, run.gotTimeLeft, time.Second)
}

// Past maxWait the caller stops watching and is told the release is still pending.
// Nothing cancels the run: it keeps retrying until the gold is back.
func TestStarter_ReleaseHoldAndWait_StillRunningAtMaxWait_IsPending(t *testing.T) {
	fake := &fakeClient{run: &fakeRun{block: true}}

	started := time.Now()
	err := NewStarter(fake).ReleaseHoldAndWait(context.Background(), uuid.New(), uuid.New(), 20*time.Millisecond)

	assert.ErrorIs(t, err, usecase.ErrHoldReleasePending)
	assert.Less(t, time.Since(started), time.Second, "the wait gives up at maxWait")
}

// The bid's release was started before (REJECT_DUPLICATE): the caller waits on that
// run, found by the bid's workflow ID, rather than on nothing.
func TestStarter_ReleaseHoldAndWait_AlreadyStarted_WaitsOnTheExistingRun(t *testing.T) {
	bidID := uuid.New()
	run := &fakeRun{}
	fake := &fakeClient{
		err: serviceerror.NewWorkflowExecutionAlreadyStarted("already started", "", ""),
		run: run,
	}

	err := NewStarter(fake).ReleaseHoldAndWait(context.Background(), uuid.New(), bidID, time.Second)

	require.NoError(t, err)
	assert.Equal(t, 1, fake.getWorkflows)
	assert.Equal(t, WorkflowID(bidID), fake.gotWorkflowID)
	assert.Empty(t, fake.gotRunID, "the latest run under that ID")
	assert.Equal(t, 1, run.gets)
}

// A start that fails has nothing to wait on: the cause comes back as from
// StartReleaseHold, and it is not "pending", because no release is running.
func TestStarter_ReleaseHoldAndWait_StartFails_WaitsOnNothing(t *testing.T) {
	unavailable := serviceerror.NewUnavailable("temporal down")
	run := &fakeRun{}
	fake := &fakeClient{err: unavailable, run: run}

	err := NewStarter(fake).ReleaseHoldAndWait(context.Background(), uuid.New(), uuid.New(), time.Second)

	assert.ErrorIs(t, err, unavailable)
	assert.NotErrorIs(t, err, usecase.ErrHoldReleasePending)
	assert.Zero(t, run.gets)
	assert.Zero(t, fake.getWorkflows)
}

// A run that ended in failure (wallet refused the release outright) is reported as
// such, not as pending: it is not coming back.
func TestStarter_ReleaseHoldAndWait_ReleaseFailed_IsNotPending(t *testing.T) {
	failed := errors.New("hold not found")
	fake := &fakeClient{run: &fakeRun{err: failed}}

	err := NewStarter(fake).ReleaseHoldAndWait(context.Background(), uuid.New(), uuid.New(), time.Second)

	assert.ErrorIs(t, err, failed)
	assert.NotErrorIs(t, err, usecase.ErrHoldReleasePending)
}
