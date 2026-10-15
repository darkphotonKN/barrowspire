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

type stubReleaseHold struct {
	err    error
	calls  int
	gotCmd *usecase.ReleaseHoldCommand
}

func (s *stubReleaseHold) Handle(ctx context.Context, cmd *usecase.ReleaseHoldCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

func newReleaseHoldEnv(uc ReleaseHold) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, nil, nil, nil, uc).Register(env)
	return env
}

func TestReleaseHoldActivity_ReleasesTheNamedBidsHold(t *testing.T) {
	uc := &stubReleaseHold{}
	in := walletactivity.ReleaseHoldInput{ListingID: uuid.New(), BidID: uuid.New()}

	_, err := newReleaseHoldEnv(uc).ExecuteActivity(walletactivity.ReleaseHoldActivityName, in)

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.BidID, uc.gotCmd.BidID)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

// The workflow retries this without a cap, so only a failure no retry can fix may be
// non-retryable: anything else left plain would be retried, and anything wrongly
// marked impossible would strand the gold the release exists to give back.
func TestReleaseHoldActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		{"the hold is committed, so it can never be released", account.ErrInvalidHoldTransition, true},
		{"the account has no such hold", account.ErrHoldNotFound, true},
		{"wallet's database is down", errors.New("dial tcp: connection refused"), false},
		{"lost the row version", account.ErrConcurrentModification, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubReleaseHold{err: fmt.Errorf("release hold uc: %w", tt.err)}

			_, err := newReleaseHoldEnv(uc).ExecuteActivity(walletactivity.ReleaseHoldActivityName,
				walletactivity.ReleaseHoldInput{ListingID: uuid.New(), BidID: uuid.New()})
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tt.wantImpossible, appErr.NonRetryable())
		})
	}
}
