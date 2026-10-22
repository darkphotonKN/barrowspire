package settlement

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	bstemporal "github.com/darkphotonKN/barrowspire-server/common/temporal"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
	"go.temporal.io/sdk/workflow"
)

// runUntilDone is tested against a stub step (I-NXP1W-7), so it does not depend on
// any real settlement step existing.
//
// Timing caveat: the SDK's test environment caps an activity whose RetryPolicy
// has MaximumAttempts 0 at 10 attempts, so a lap here ends after about four
// minutes rather than at stepCap. The tests measure from each raise, never from
// the start of a lap.
const fakeStepName = "FakeStep"

type fakeStepInput struct {
	N int `json:"n"`
}

type fakeStepOutput struct {
	Echo int `json:"echo"`
}

type parkHarnessInput struct {
	ListingID uuid.UUID  `json:"listing_id"`
	Phase     pivotPhase `json:"phase"`
}

type parkHarnessOutput struct {
	Step       fakeStepOutput `json:"step"`
	FinishedAt time.Time      `json:"finished_at"`
}

// parkHarness is the smallest workflow that runs one step through runUntilDone,
// and reports when it got through, so a test can tell a signal wake from a timer
// wake.
func parkHarness(ctx workflow.Context, in parkHarnessInput) (parkHarnessOutput, error) {
	var out fakeStepOutput
	err := runUntilDone(ctx, in.ListingID, fakeStepName, bstemporal.QueueItems, in.Phase, fakeStepInput{N: 7}, &out)
	if err != nil {
		return parkHarnessOutput{}, err
	}

	return parkHarnessOutput{Step: out, FinishedAt: workflow.Now(ctx)}, nil
}

// parkFakes stands in for the step and for the two exception activities. The
// test flips healthy (and impossible) from delayed callbacks while the workflow
// runs, so the fields are guarded.
type parkFakes struct {
	mu sync.Mutex

	healthy    bool
	impossible bool
	// healthyAfterRaises > 0 recovers the step once it has raised that many
	// times, so a test can count laps without depending on how long a lap takes
	healthyAfterRaises int

	stepAttempts int
	stepQueue    string
	raised       []marketplaceactivity.RaiseSettlementExceptionInput
	raisedAt     []time.Time
	resolved     []uuid.UUID

	exceptionID uuid.UUID
}

func (f *parkFakes) setHealthy() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.healthy = true
}

func (f *parkFakes) raisedSoFar() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.raised)
}

func newParkEnv(t *testing.T, fakes *parkFakes) *testsuite.TestWorkflowEnvironment {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(parkHarness)

	env.RegisterActivityWithOptions(func(ctx context.Context, in fakeStepInput) (fakeStepOutput, error) {
		fakes.mu.Lock()
		defer fakes.mu.Unlock()
		fakes.stepAttempts++
		fakes.stepQueue = activity.GetInfo(ctx).TaskQueue

		switch {
		case fakes.healthy:
			return fakeStepOutput{Echo: in.N}, nil
		case fakes.impossible:
			return fakeStepOutput{}, temporal.NewNonRetryableApplicationError("item not transferable", "TransferItemImpossible", nil)
		default:
			return fakeStepOutput{}, errors.New("items-service unavailable")
		}
	}, activity.RegisterOptions{Name: fakeStepName})

	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.RaiseSettlementExceptionInput) (marketplaceactivity.RaiseSettlementExceptionOutput, error) {
		fakes.mu.Lock()
		defer fakes.mu.Unlock()
		fakes.raised = append(fakes.raised, in)
		fakes.raisedAt = append(fakes.raisedAt, env.Now())
		if fakes.healthyAfterRaises > 0 && len(fakes.raised) == fakes.healthyAfterRaises {
			fakes.healthy = true
		}
		return marketplaceactivity.RaiseSettlementExceptionOutput{ExceptionID: fakes.exceptionID}, nil
	}, activity.RegisterOptions{Name: marketplaceactivity.RaiseSettlementExceptionActivityName})

	env.RegisterActivityWithOptions(func(ctx context.Context, in marketplaceactivity.ResolveSettlementExceptionInput) error {
		fakes.mu.Lock()
		defer fakes.mu.Unlock()
		fakes.resolved = append(fakes.resolved, in.ExceptionID)
		return nil
	}, activity.RegisterOptions{Name: marketplaceactivity.ResolveSettlementExceptionActivityName})

	return env
}

func harnessResult(t *testing.T, env *testsuite.TestWorkflowEnvironment) parkHarnessOutput {
	t.Helper()
	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())

	var out parkHarnessOutput
	require.NoError(t, env.GetWorkflowResult(&out))
	return out
}

func TestRunUntilDone_SuccessFirstTime_RaisesNothing(t *testing.T) {
	fakes := &parkFakes{healthy: true}
	env := newParkEnv(t, fakes)

	env.ExecuteWorkflow(parkHarness, parkHarnessInput{ListingID: uuid.New(), Phase: afterPivot})

	out := harnessResult(t, env)
	assert.Equal(t, 7, out.Step.Echo, "the step's output reaches the caller")
	assert.Equal(t, bstemporal.QueueItems.String(), fakes.stepQueue, "the step runs on the queue it was given")
	assert.Equal(t, 1, fakes.stepAttempts)
	assert.Empty(t, fakes.raised)
	assert.Empty(t, fakes.resolved)
}

// The step outlasts its 30m cap, so the settlement raises and parks; a RetryStep
// sent while parked retries it at once, without waiting out the re-park timer.
func TestRunUntilDone_CapExhausted_ParksAndResumesOnRetryStep(t *testing.T) {
	listingID := uuid.New()
	fakes := &parkFakes{exceptionID: uuid.New()}
	env := newParkEnv(t, fakes)
	start := env.Now()

	var raisedWhileParked int
	env.RegisterDelayedCallback(func() {
		raisedWhileParked = fakes.raisedSoFar()
		fakes.setHealthy()
		env.SignalWorkflow(RetryStepSignalName, nil)
	}, 40*time.Minute) // after the first raise, before its re-park timer fires

	env.ExecuteWorkflow(parkHarness, parkHarnessInput{ListingID: listingID, Phase: afterPivot})

	out := harnessResult(t, env)
	assert.Equal(t, 1, raisedWhileParked, "exhausting the cap raises before parking")
	require.Len(t, fakes.raisedAt, 1)
	assert.Less(t, out.FinishedAt.Sub(fakes.raisedAt[0]), reparkInterval, "RetryStep woke it, not the timer")
	assert.WithinDuration(t, start.Add(40*time.Minute), out.FinishedAt, time.Second, "it retried the moment RetryStep arrived")
	assert.Greater(t, fakes.stepAttempts, 2, "the step was retried inside its cap before it parked")

	require.Len(t, fakes.raised, 1)
	raised := fakes.raised[0]
	assert.Equal(t, listingID, raised.ListingID)
	assert.Equal(t, fakeStepName, raised.Step)
	assert.NotEmpty(t, raised.WorkflowID)
	assert.NotEmpty(t, raised.Reason)

	assert.Equal(t, []uuid.UUID{fakes.exceptionID}, fakes.resolved, "success resolves the exception it raised")
}

// Nobody sends RetryStep: the re-park timer alone brings it back.
func TestRunUntilDone_ResumesOnTheReparkTimer(t *testing.T) {
	fakes := &parkFakes{exceptionID: uuid.New(), healthyAfterRaises: 1} // recovered, but no signal
	env := newParkEnv(t, fakes)

	env.ExecuteWorkflow(parkHarness, parkHarnessInput{ListingID: uuid.New(), Phase: afterPivot})

	out := harnessResult(t, env)
	require.Len(t, fakes.raisedAt, 1)
	assert.Equal(t, reparkInterval, out.FinishedAt.Sub(fakes.raisedAt[0]), "it waited out the timer, then retried at once")
	assert.Equal(t, []uuid.UUID{fakes.exceptionID}, fakes.resolved)
}

// An outage longer than one lap keeps the settlement open through every lap; it
// never fails, and one success resolves the exception.
func TestRunUntilDone_StaysOpenAcrossLaps(t *testing.T) {
	fakes := &parkFakes{exceptionID: uuid.New(), healthyAfterRaises: 3}
	env := newParkEnv(t, fakes)

	env.ExecuteWorkflow(parkHarness, parkHarnessInput{ListingID: uuid.New(), Phase: afterPivot})

	harnessResult(t, env)
	require.Len(t, fakes.raisedAt, 3, "each lap that fails raises again")
	for i := 1; i < len(fakes.raisedAt); i++ {
		assert.Greater(t, fakes.raisedAt[i].Sub(fakes.raisedAt[i-1]), reparkInterval, "lap %d parked a full interval first", i+1)
	}
	assert.Equal(t, []uuid.UUID{fakes.exceptionID}, fakes.resolved, "resolved once, when it finally succeeds")
}

// After the pivot an impossibility is an invariant breach: it parks like an outage
// (§Req 13) and does not spend a 30m cap first, since it is non-retryable.
func TestRunUntilDone_ImpossibleAfterThePivot_Parks(t *testing.T) {
	fakes := &parkFakes{impossible: true, exceptionID: uuid.New()}
	env := newParkEnv(t, fakes)
	start := env.Now()

	env.RegisterDelayedCallback(func() {
		fakes.setHealthy()
		env.SignalWorkflow(RetryStepSignalName, nil)
	}, 10*time.Minute)

	env.ExecuteWorkflow(parkHarness, parkHarnessInput{ListingID: uuid.New(), Phase: afterPivot})

	out := harnessResult(t, env)
	assert.Less(t, out.FinishedAt.Sub(start), stepCap, "an impossibility parks at once")
	assert.Equal(t, 2, fakes.stepAttempts, "one impossible attempt, one after RetryStep")
	assert.Len(t, fakes.raised, 1)
	assert.Equal(t, []uuid.UUID{fakes.exceptionID}, fakes.resolved)
}

// Cancelling a parked settlement ends it: the run stops cleanly instead of
// spinning on a cancelled context until the deadlock detector kills it.
func TestRunUntilDone_CancelledWhileParked_Stops(t *testing.T) {
	fakes := &parkFakes{exceptionID: uuid.New()}
	env := newParkEnv(t, fakes)

	env.RegisterDelayedCallback(env.CancelWorkflow, 20*time.Minute) // after the first raise, while parked

	env.ExecuteWorkflow(parkHarness, parkHarnessInput{ListingID: uuid.New(), Phase: afterPivot})

	require.True(t, env.IsWorkflowCompleted())
	err := env.GetWorkflowError()
	require.Error(t, err)
	assert.True(t, temporal.IsCanceledError(err), "ends as cancelled, not as a deadlock: %v", err)
	assert.Len(t, fakes.raised, 1, "no further lap after the cancel")
	assert.Empty(t, fakes.resolved)
}

// Cancelled while the step itself is still retrying: it stops without raising.
func TestRunUntilDone_CancelledDuringTheStep_StopsWithoutRaising(t *testing.T) {
	fakes := &parkFakes{exceptionID: uuid.New()}
	env := newParkEnv(t, fakes)

	env.RegisterDelayedCallback(env.CancelWorkflow, 30*time.Second) // inside the step's retries

	env.ExecuteWorkflow(parkHarness, parkHarnessInput{ListingID: uuid.New(), Phase: afterPivot})

	require.True(t, env.IsWorkflowCompleted())
	assert.True(t, temporal.IsCanceledError(env.GetWorkflowError()))
	assert.Empty(t, fakes.raised, "a cancelled step is not an outage to escalate")
}

// Before the pivot an impossibility is returned for the caller to roll back
// (§Req 12): nothing is raised and nothing parks.
func TestRunUntilDone_ImpossibleBeforeThePivot_ReturnsTheError(t *testing.T) {
	fakes := &parkFakes{impossible: true}
	env := newParkEnv(t, fakes)

	env.ExecuteWorkflow(parkHarness, parkHarnessInput{ListingID: uuid.New(), Phase: beforePivot})

	require.True(t, env.IsWorkflowCompleted())
	err := env.GetWorkflowError()
	require.Error(t, err)

	var appErr *temporal.ApplicationError
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, "TransferItemImpossible", appErr.Type(), "the step's type reaches the caller unchanged")
	assert.Equal(t, 1, fakes.stepAttempts)
	assert.Empty(t, fakes.raised)
}
