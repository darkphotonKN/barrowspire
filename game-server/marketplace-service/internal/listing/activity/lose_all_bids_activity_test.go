package activity

import (
	"context"
	"errors"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubLoseAllBids struct {
	err    error
	calls  int
	gotCmd usecase.LoseAllBidsCommand
}

func (s *stubLoseAllBids) Handle(ctx context.Context, cmd usecase.LoseAllBidsCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

// The rollback has to be reachable by the name the workflow schedules it under. An
// action that is constructed and injected but never registered is invisible until a
// settlement needs to roll back and cannot.
func newRollbackEnv(uc LoseAllBids) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, nil, uc, nil).Register(env)
	return env
}

func TestLoseAllBidsActivity_RunsTheUseCaseForTheListing(t *testing.T) {
	uc := &stubLoseAllBids{}
	in := marketplaceactivity.LoseAllBidsInput{ListingID: uuid.New()}

	_, err := newRollbackEnv(uc).ExecuteActivity(marketplaceactivity.LoseAllBidsActivityName, in)

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.ListingID, uc.gotCmd.ListingID)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

// A rollback action has nothing to escalate to, so it must never declare a failure
// non-retryable: it is retried without a cap until it succeeds (§Req 12, 36).
func TestLoseAllBidsActivity_Failure_StaysRetryable(t *testing.T) {
	uc := &stubLoseAllBids{err: errors.New("dial tcp: connection refused")}

	_, err := newRollbackEnv(uc).ExecuteActivity(marketplaceactivity.LoseAllBidsActivityName,
		marketplaceactivity.LoseAllBidsInput{ListingID: uuid.New()})
	require.Error(t, err)

	var appErr *temporal.ApplicationError
	require.ErrorAs(t, err, &appErr)
	assert.False(t, appErr.NonRetryable(), "a rollback action is retried without a cap")
}
