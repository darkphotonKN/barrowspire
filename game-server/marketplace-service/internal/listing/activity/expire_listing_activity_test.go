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

type stubExpireListing struct {
	err    error
	calls  int
	gotCmd usecase.ExpireListingCommand
}

func (s *stubExpireListing) Handle(ctx context.Context, cmd usecase.ExpireListingCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

func newExpireEnv(uc ExpireListing) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, nil, nil, uc).Register(env)
	return env
}

func TestExpireListingActivity_RunsTheUseCaseForTheListing(t *testing.T) {
	uc := &stubExpireListing{}
	in := marketplaceactivity.ExpireListingInput{ListingID: uuid.New()}

	_, err := newExpireEnv(uc).ExecuteActivity(marketplaceactivity.ExpireListingActivityName, in)

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, in.ListingID, uc.gotCmd.ListingID)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

// NB2 is a forward step: a listing that is neither PENDING_SETTLEMENT nor already
// EXPIRED is an invariant breach no retry can fix, so it must say so rather than
// spend its cap (FS-NXP1W §Req 9, 34b). Everything else is transient.
func TestExpireListingActivity_Classification(t *testing.T) {
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubExpireListing{err: fmt.Errorf("expire listing uc: %w", tt.err)}

			_, err := newExpireEnv(uc).ExecuteActivity(marketplaceactivity.ExpireListingActivityName,
				marketplaceactivity.ExpireListingInput{ListingID: uuid.New()})
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tt.wantImpossible, appErr.NonRetryable())
			if tt.wantImpossible {
				assert.Equal(t, expireListingImpossible, appErr.Type())
			}
		})
	}
}
