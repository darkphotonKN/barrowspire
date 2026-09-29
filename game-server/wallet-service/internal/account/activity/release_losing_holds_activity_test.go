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

type stubReleaseLosingHolds struct {
	released int
	err      error
	calls    int
	gotCmd   *usecase.ReleaseLosingHoldsCommand
}

func (s *stubReleaseLosingHolds) Handle(ctx context.Context, cmd *usecase.ReleaseLosingHoldsCommand) (int, error) {
	s.calls++
	s.gotCmd = cmd
	return s.released, s.err
}

func newTailEnv(uc ReleaseLosingHolds) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, nil, uc).Register(env)
	return env
}

func TestReleaseLosingHoldsActivity_ReportsTheReleasedCount(t *testing.T) {
	uc := &stubReleaseLosingHolds{released: 2}
	in := walletactivity.ReleaseLosingHoldsInput{
		ListingID:    uuid.New(),
		WinnerBidID:  uuid.New(),
		LosingBidIDs: []uuid.UUID{uuid.New(), uuid.New()},
	}

	val, err := newTailEnv(uc).ExecuteActivity(walletactivity.ReleaseLosingHoldsActivityName, in)
	require.NoError(t, err)

	var out walletactivity.ReleaseLosingHoldsOutput
	require.NoError(t, val.Get(&out))

	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.WinnerBidID, uc.gotCmd.WinnerBidID)
	assert.Equal(t, in.LosingBidIDs, uc.gotCmd.LosingBidIDs)
	assert.Equal(t, walletactivity.ReleaseLosingHoldsOutput{ReleasedCount: 2}, out)
}

// The tail rolls forward, so what a non-retryable error means here is not "roll back"
// but "this is an invariant breach, escalate and park" (§Req 13). The set is
// correspondingly small: a hold that cannot move to RELEASED means the workflow's
// winner/loser split is wrong, which no retry fixes.
func TestReleaseLosingHoldsActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		{"a loser's hold cannot be released", account.ErrInvalidHoldTransition, true},
		{"the account has no such hold", account.ErrHoldNotFound, true},
		{"wallet is down", errors.New("dial tcp: connection refused"), false},
		{"lost the row version", account.ErrConcurrentModification, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubReleaseLosingHolds{err: fmt.Errorf("release losing holds uc: %w", tt.err)}

			_, err := newTailEnv(uc).ExecuteActivity(walletactivity.ReleaseLosingHoldsActivityName,
				walletactivity.ReleaseLosingHoldsInput{ListingID: uuid.New(), WinnerBidID: uuid.New()})
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tt.wantImpossible, appErr.NonRetryable())
		})
	}
}
