package activity

import (
	"context"
	"errors"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubReleaseAllHolds struct {
	err    error
	calls  int
	gotCmd *usecase.ReleaseAllHoldsCommand
}

func (s *stubReleaseAllHolds) Handle(ctx context.Context, cmd *usecase.ReleaseAllHoldsCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

// The rollback has to be reachable by the name the workflow schedules it under. An
// action that is injected but never registered is invisible until a settlement needs
// to roll back and cannot.
func newRollbackEnv(uc ReleaseAllHolds) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, uc, nil).Register(env)
	return env
}

func TestReleaseAllHoldsActivity_PassesTheWorkflowsBidSet(t *testing.T) {
	uc := &stubReleaseAllHolds{}
	in := walletactivity.ReleaseAllHoldsInput{
		ListingID: uuid.New(),
		BidIDs:    []uuid.UUID{uuid.New(), uuid.New()},
	}

	_, err := newRollbackEnv(uc).ExecuteActivity(walletactivity.ReleaseAllHoldsActivityName, in)

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.BidIDs, uc.gotCmd.BidIDs, "wallet releases the set the workflow decided")
	assert.False(t, uc.gotCmd.Now.IsZero())
}

// A rollback action has nothing to escalate to, so it must never declare a failure
// non-retryable: it is retried without a cap until it succeeds (§Req 12, 36). Gold
// left reserved is the one outcome this step may not settle for.
func TestReleaseAllHoldsActivity_Failure_StaysRetryable(t *testing.T) {
	uc := &stubReleaseAllHolds{err: errors.New("dial tcp: connection refused")}

	_, err := newRollbackEnv(uc).ExecuteActivity(walletactivity.ReleaseAllHoldsActivityName,
		walletactivity.ReleaseAllHoldsInput{ListingID: uuid.New(), BidIDs: []uuid.UUID{uuid.New()}})
	require.Error(t, err)

	var appErr *temporal.ApplicationError
	require.ErrorAs(t, err, &appErr)
	assert.False(t, appErr.NonRetryable(), "a rollback action is retried without a cap")
}
