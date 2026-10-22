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

type stubMarkSettlementFailed struct {
	err    error
	calls  int
	gotCmd usecase.MarkSettlementFailedCommand
}

func (s *stubMarkSettlementFailed) Handle(ctx context.Context, cmd usecase.MarkSettlementFailedCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

// Registered by the name the workflow schedules it under, as the running worker
// registers it.
func newMarkSettlementFailedEnv(uc MarkSettlementFailed) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, nil, nil, nil, nil, uc).Register(env)
	return env
}

func TestMarkSettlementFailedActivity_RunsTheUseCaseForTheListing(t *testing.T) {
	uc := &stubMarkSettlementFailed{}
	in := marketplaceactivity.MarkSettlementFailedInput{ListingID: uuid.New()}

	_, err := newMarkSettlementFailedEnv(uc).ExecuteActivity(marketplaceactivity.MarkSettlementFailedActivityName, in)

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.ListingID, uc.gotCmd.ListingID)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

// A rollback action has nothing to escalate to, so it never declares a failure
// non-retryable: it is retried without a cap until it succeeds (§Req 12, 36).
func TestMarkSettlementFailedActivity_Failure_StaysRetryable(t *testing.T) {
	uc := &stubMarkSettlementFailed{err: errors.New("dial tcp: connection refused")}

	_, err := newMarkSettlementFailedEnv(uc).ExecuteActivity(marketplaceactivity.MarkSettlementFailedActivityName,
		marketplaceactivity.MarkSettlementFailedInput{ListingID: uuid.New()})
	require.Error(t, err)

	var appErr *temporal.ApplicationError
	require.ErrorAs(t, err, &appErr)
	assert.False(t, appErr.NonRetryable(), "a rollback action is retried without a cap")
}
