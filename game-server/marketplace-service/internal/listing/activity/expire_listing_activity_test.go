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

type stubExpireListing struct {
	err error
}

func (s *stubExpireListing) Handle(ctx context.Context, cmd usecase.ExpireListingCommand) error {
	return s.err
}

func newExpireListingEnv(uc ExpireListing) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(nil, nil, nil, uc, nil, nil).Register(env)
	return env
}

// NB2 never overwrites a listing another flow moved, and a listing that is gone
// has nothing to expire: both are impossible, so the workflow parks instead of
// spending its cap (FS-NXP1W §Req 9).
func TestExpireListingActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		{"listing in another status", listing.ErrInvalidListingState, true},
		{"listing not found", commonerr.ErrNotFound, true},
		// what ListingRepository.Update actually returns for a missing row, via
		// WrapDBErr: a different sentinel from apperr's
		{"listing not found, as the repository reports it", commonconstants.ErrNotFound, true},
		{"dependency blip", errors.New("dial tcp: connection refused"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubExpireListing{err: fmt.Errorf("expire listing uc: %w", tt.err)}

			_, err := newExpireListingEnv(uc).ExecuteActivity(marketplaceactivity.ExpireListingActivityName,
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
