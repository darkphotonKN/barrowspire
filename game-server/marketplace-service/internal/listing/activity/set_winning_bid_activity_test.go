package activity

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubSetWinningBid struct {
	err    error
	calls  int
	gotCmd usecase.SetWinningBidCommand
}

func (s *stubSetWinningBid) Handle(ctx context.Context, cmd usecase.SetWinningBidCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

// newEnv registers the activities exactly as the worker does, so the tests
// schedule 1a by its contract name rather than by a Go function reference. The
// steps this test does not exercise are left nil: reaching one would be a
// registration bug, and a nil panic says so louder than a stub returning nil.
func newEnv(uc SetWinningBid) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, uc, nil, nil).Register(env)
	return env
}

func TestSetWinningBidActivity_RunsTheUseCaseForTheWinner(t *testing.T) {
	uc := &stubSetWinningBid{}
	in := marketplaceactivity.SetWinningBidInput{ListingID: uuid.New(), WinnerBidID: uuid.New()}

	_, err := newEnv(uc).ExecuteActivity(marketplaceactivity.SetWinningBidActivityName, in)

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.ListingID, uc.gotCmd.ListingID)
	assert.Equal(t, in.WinnerBidID, uc.gotCmd.BidID)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

func TestSetWinningBidActivity_UseCaseFailure_FailsTheActivity(t *testing.T) {
	uc := &stubSetWinningBid{err: errors.New("boom")}

	_, err := newEnv(uc).ExecuteActivity(marketplaceactivity.SetWinningBidActivityName,
		marketplaceactivity.SetWinningBidInput{ListingID: uuid.New(), WinnerBidID: uuid.New()})

	assert.Error(t, err)
}

// 1a is the last step before the pivot, so a failure it can never recover from has
// to say so: the workflow rolls back rather than spending its cap (FS-NXP1W §Req 9).
// The bid FSM is what refuses a bid that is not WINNING, so its sentinel is the one
// that means "this winner is no longer the winner".
func TestSetWinningBidActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		// the bid vanished between freeze and here, so no attempt can mark it won
		{"unknown bid", listing.ErrBidNotFound, true},
		// demoted or never confirmed: only WINNING -> WON is a legal move
		{"bid is no longer winning", listing.ErrInvalidBidTransition, true},
		// the listing itself is gone; there is nothing to write to
		{"listing not found", commonerr.ErrNotFound, true},
		{"dependency blip", errors.New("dial tcp: connection refused"), false},
		// the row lock lost a race. A fresh attempt gets a fresh version.
		{"lost the row lock", listing.ErrConcurrentModification, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubSetWinningBid{err: fmt.Errorf("set winning bid uc: %w", tt.err)}

			_, err := newEnv(uc).ExecuteActivity(marketplaceactivity.SetWinningBidActivityName,
				marketplaceactivity.SetWinningBidInput{ListingID: uuid.New(), WinnerBidID: uuid.New()})
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tt.wantImpossible, appErr.NonRetryable())
			if tt.wantImpossible {
				assert.Equal(t, setWinningBidImpossible, appErr.Type())
			}
		})
	}
}
