package activity

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubMarkSold struct {
	err    error
	calls  int
	gotCmd usecase.MarkSoldListingCommand
}

func (s *stubMarkSold) Handle(ctx context.Context, cmd usecase.MarkSoldListingCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

func newMarkSoldEnv(uc MarkSold) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, nil, nil, nil, uc).Register(env)
	return env
}

func TestMarkSoldActivity_RunsTheUseCaseForTheListing(t *testing.T) {
	uc := &stubMarkSold{}
	in := marketplaceactivity.MarkSoldInput{ListingID: uuid.New()}

	_, err := newMarkSoldEnv(uc).ExecuteActivity(marketplaceactivity.MarkSoldActivityName, in)

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.ListingID, uc.gotCmd.ID)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

// Step 6 is past the pivot: a listing that is neither PENDING_SETTLEMENT nor
// already SOLD is an invariant breach no retry can fix, so it must say so rather
// than spend its cap (FS-NXP1W §Req 9, 13, 33). Everything else is transient.
func TestMarkSoldActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		// something other than settlement moved the listing; never overwrite it
		{"listing in another status", listing.ErrInvalidListingState, true},
		// the listing itself is gone; there is nothing to write to
		{"listing not found", commonerr.ErrNotFound, true},
		{"dependency blip", errors.New("dial tcp: connection refused"), false},
		{"lost the row lock", listing.ErrConcurrentModification, false},
		// another writer held the listing past Update's 3s lock_timeout
		{"row lock not acquired in time", commonconstants.ErrLockUnavailable, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubMarkSold{err: fmt.Errorf("mark sold uc: %w", tt.err)}

			_, err := newMarkSoldEnv(uc).ExecuteActivity(marketplaceactivity.MarkSoldActivityName,
				marketplaceactivity.MarkSoldInput{ListingID: uuid.New()})
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tt.wantImpossible, appErr.NonRetryable())
			if tt.wantImpossible {
				assert.Equal(t, markSoldImpossible, appErr.Type())
			}
		})
	}
}
