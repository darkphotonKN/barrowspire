package smoke

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/converter"
	"go.temporal.io/sdk/testsuite"
)

// queues mirrors what cmd/temporal-smoke sends: the orchestrator's own queue
// plus every participant's.
var queues = []string{"marketplace", "items", "wallet", "ledger"}

func newEnv(t *testing.T) *testsuite.TestWorkflowEnvironment {
	t.Helper()

	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(Workflow)

	return env
}

// The point of the smoke run is routing, not the payload. Each ping must be
// scheduled onto the queue the workflow named — that is the mechanism ADR-0011
// rests on, and the one thing a single-queue test would not catch.
func TestSmokeWorkflow_SchedulesOnePingPerRequestedQueue(t *testing.T) {
	env := newEnv(t)
	env.RegisterActivityWithOptions(Ping, activity.RegisterOptions{Name: PingActivityName})

	var scheduled []string
	env.SetOnActivityStartedListener(func(info *activity.Info, _ context.Context, _ converter.EncodedValues) {
		scheduled = append(scheduled, info.TaskQueue)
	})

	env.ExecuteWorkflow(Workflow, WorkflowInput{Message: "barrowspire", Queues: queues})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	assert.Equal(t, queues, scheduled, "one ping per queue, on the queue it named")

	var out WorkflowOutput
	require.NoError(t, env.GetWorkflowResult(&out))
	require.Len(t, out.Replies, len(queues))
	for _, reply := range out.Replies {
		assert.Equal(t, "pong: barrowspire", reply.Reply)
		assert.NotEmpty(t, reply.Hostname)
	}
}

// A queue whose worker is not polling is exactly what the smoke run exists to
// find, so the failure has to reach the operator rather than be swallowed into
// a partial result.
func TestSmokeWorkflow_QueueThatNeverAnswers_FailsTheRun(t *testing.T) {
	env := newEnv(t)
	env.RegisterActivityWithOptions(Ping, activity.RegisterOptions{Name: PingActivityName})
	env.OnActivity(PingActivityName, mock.Anything, mock.Anything).
		Return(PingOutput{}, errors.New("no worker on this queue"))

	env.ExecuteWorkflow(Workflow, WorkflowInput{Message: "barrowspire", Queues: queues})

	require.True(t, env.IsWorkflowCompleted())
	require.Error(t, env.GetWorkflowError())
	assert.Contains(t, env.GetWorkflowError().Error(), "no worker on this queue")
}

// An empty queue list is a misconfigured caller, not a healthy cluster. It must
// not report success with nothing checked.
func TestSmokeWorkflow_NoQueues_ReturnsNoReplies(t *testing.T) {
	env := newEnv(t)
	env.RegisterActivityWithOptions(Ping, activity.RegisterOptions{Name: PingActivityName})

	env.ExecuteWorkflow(Workflow, WorkflowInput{Message: "barrowspire"})

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())

	var out WorkflowOutput
	require.NoError(t, env.GetWorkflowResult(&out))
	assert.Empty(t, out.Replies)
}
