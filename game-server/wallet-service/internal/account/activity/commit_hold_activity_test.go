package activity

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/temporal"
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
	NewActivities(uc, nil, nil).Register(env)
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

// Settlement's pivot must not be retried against a hold that can never commit
// (FS-NXP1W §Req 9): an expired hold is a semantic impossibility, so it comes back
// as a non-retryable application error and the workflow rolls back instead of
// burning its cap on a call whose answer will not change.
func TestCommitHoldActivity_ExpiredHold_IsNonRetryable(t *testing.T) {
	uc := &stubCommitHold{err: fmt.Errorf("commit hold uc: %w", account.ErrHoldExpired)}

	_, err := newEnv(uc).ExecuteActivity(walletactivity.CommitHoldActivityName,
		walletactivity.CommitHoldInput{WinnerBidID: uuid.New(), ExpectedAmount: 300})

	require.Error(t, err)

	var appErr *temporal.ApplicationError
	require.ErrorAs(t, err, &appErr, "must be an ApplicationError so Temporal can read its type")
	assert.True(t, appErr.NonRetryable(), "an expired hold can never commit")
	assert.Equal(t, commitHoldImpossible, appErr.Type())
}

// The classification is the whole point of the wrapper, so the set is pinned as a
// set: a sentinel quietly dropped from it turns a rollback into a retry storm
// against a hold that will never commit, and one wrongly added turns a blip into
// a failed sale.
func TestCommitHoldActivity_Classification(t *testing.T) {
	tests := []struct {
		name          string
		err           error
		wantImpossibe bool
	}{
		{"expired hold", account.ErrHoldExpired, true},
		{"amount mismatch", account.ErrHoldAmountMismatch, true},
		{"released hold refused by the FSM", account.ErrInvalidHoldTransition, true},
		{"gold below the hold", account.ErrInsufficientGold, true},
		{"no hold for the bid", account.ErrHoldNotFound, true},
		{"dependency blip", errors.New("dial tcp: connection refused"), false},
		// the retry loop absorbs the race and reports exhaustion wrapping it. It is
		// transient: the next attempt gets a fresh row version. Reading the wrapper
		// instead of the cause would classify a lost race as impossible.
		{
			"OCC exhaustion still carrying the race",
			fmt.Errorf("%w after 5 attempts: %w", usecase.ErrMaxRetries, account.ErrConcurrentModification),
			false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubCommitHold{err: fmt.Errorf("commit hold uc: %w", tt.err)}

			_, err := newEnv(uc).ExecuteActivity(walletactivity.CommitHoldActivityName,
				walletactivity.CommitHoldInput{WinnerBidID: uuid.New(), ExpectedAmount: 300})
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tt.wantImpossibe, appErr.NonRetryable())
		})
	}
}
