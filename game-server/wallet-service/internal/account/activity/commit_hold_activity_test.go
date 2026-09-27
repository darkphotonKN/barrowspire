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
	"go.temporal.io/sdk/testsuite"
)

type stubCommitHold struct {
	res    *usecase.CommitHoldResult
	err    error
	calls  int
	gotCmd *usecase.CommitHoldCommand
}

func (s *stubCommitHold) Handle(ctx context.Context, cmd *usecase.CommitHoldCommand) (*usecase.CommitHoldResult, error) {
	s.calls++
	s.gotCmd = cmd
	return s.res, s.err
}

// newEnv registers the activities exactly as the worker does, so the tests
// schedule 1b by its contract name rather than by a Go function reference.
func newEnv(uc CommitHold) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(uc).Register(env)
	return env
}

func TestCommitHoldActivity_CommitsTheWinnersHold(t *testing.T) {
	accountID := uuid.New()
	uc := &stubCommitHold{res: &usecase.CommitHoldResult{AccountID: accountID, Amount: 300}}
	in := walletactivity.CommitHoldInput{WinnerBidID: uuid.New(), ExpectedAmount: 300}

	val, err := newEnv(uc).ExecuteActivity(walletactivity.CommitHoldActivityName, in)
	require.NoError(t, err)

	var out walletactivity.CommitHoldOutput
	require.NoError(t, val.Get(&out))

	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.WinnerBidID, uc.gotCmd.BidID)
	assert.Equal(t, 300, uc.gotCmd.ExpectedAmount)
	assert.False(t, uc.gotCmd.Now.IsZero())
	assert.Equal(t, walletactivity.CommitHoldOutput{BuyerWalletAccountID: accountID, CommittedAmount: 300}, out)
}

func TestCommitHoldActivity_UseCaseFailure_FailsTheActivity(t *testing.T) {
	uc := &stubCommitHold{err: errors.New("boom")}

	_, err := newEnv(uc).ExecuteActivity(walletactivity.CommitHoldActivityName,
		walletactivity.CommitHoldInput{WinnerBidID: uuid.New(), ExpectedAmount: 300})

	assert.Error(t, err)
}
