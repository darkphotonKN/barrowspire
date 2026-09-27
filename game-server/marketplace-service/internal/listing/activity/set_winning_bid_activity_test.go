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
// schedule 1a by its contract name rather than by a Go function reference.
func newEnv(uc SetWinningBid) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(uc, nil).Register(env)
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
