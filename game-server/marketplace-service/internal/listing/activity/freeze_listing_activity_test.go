package activity

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	commonerr "github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

type stubFreezeListing struct {
	res    *dto.FreezeListingDto
	err    error
	calls  int
	gotCmd usecase.FreezelistingCommand
}

func (s *stubFreezeListing) Handle(ctx context.Context, cmd usecase.FreezelistingCommand) (*dto.FreezeListingDto, error) {
	s.calls++
	s.gotCmd = cmd
	return s.res, s.err
}

// Registered as the worker registers it, so the tests schedule 0a by its contract
// name. The other steps stay nil: reaching one would be a registration bug.
func newFreezeEnv(uc FreezeListing) *testsuite.TestActivityEnvironment {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	NewActivities(uc, nil, nil).Register(env)
	return env
}

func runFreeze(t *testing.T, uc FreezeListing, listingID uuid.UUID) (marketplaceactivity.FreezeListingOutput, error) {
	t.Helper()
	val, err := newFreezeEnv(uc).ExecuteActivity(marketplaceactivity.FreezeListingActivityName,
		marketplaceactivity.FreezeListingInput{ListingID: listingID})
	if err != nil {
		return marketplaceactivity.FreezeListingOutput{}, err
	}

	var out marketplaceactivity.FreezeListingOutput
	require.NoError(t, val.Get(&out))
	return out, nil
}

func TestFreezeListingActivity_Outcome(t *testing.T) {
	listingID, itemID, sellerID := uuid.New(), uuid.New(), uuid.New()
	winner := &dto.FreezeWinner{WinnerBidID: uuid.New(), WinnerMemberID: uuid.New(), Amount: 250}

	tests := []struct {
		name   string
		winner *dto.FreezeWinner
		want   marketplaceactivity.FreezeListingOutput
	}{
		{
			name:   "a winner was selected",
			winner: winner,
			want: marketplaceactivity.FreezeListingOutput{
				Outcome:        marketplaceactivity.OutcomeHasWinner,
				ListingID:      listingID,
				ItemID:         itemID,
				SellerID:       sellerID,
				WinnerBidID:    winner.WinnerBidID,
				WinnerMemberID: winner.WinnerMemberID,
				Amount:         250,
			},
		},
		{
			// no bids is a legitimate ending, not an error: the winner fields stay unset
			name:   "no winner",
			winner: nil,
			want: marketplaceactivity.FreezeListingOutput{
				Outcome:   marketplaceactivity.OutcomeNoBids,
				ListingID: listingID,
				ItemID:    itemID,
				SellerID:  sellerID,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubFreezeListing{res: &dto.FreezeListingDto{
				ListingID: listingID,
				ItemID:    itemID,
				SellerID:  sellerID,
				Winner:    tt.winner,
			}}

			out, err := runFreeze(t, uc, listingID)

			require.NoError(t, err)
			require.Equal(t, 1, uc.calls)
			assert.Equal(t, listingID, uc.gotCmd.ListingID)
			assert.Equal(t, tt.want, out)
		})
	}
}

// The workflow branches on "FreezeListingImpossible" rather than retrying into its
// cap, so each sentinel in the non-retryable set has to come out tagged with it,
// even after a use case wraps it on the way up.
func TestFreezeListingActivity_Classification(t *testing.T) {
	tests := []struct {
		name           string
		err            error
		wantImpossible bool
	}{
		{"listing is not active", listing.ErrInvalidListingState, true},
		{"listing state is corrupt", listing.ErrCorruptListingState, true},
		{"listing not found", commonerr.ErrNotFound, true},
		{"dependency blip", errors.New("dial tcp: connection refused"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubFreezeListing{err: fmt.Errorf("freeze listing uc: %w", tt.err)}

			_, err := runFreeze(t, uc, uuid.New())
			require.Error(t, err)

			var appErr *temporal.ApplicationError
			require.ErrorAs(t, err, &appErr)
			assert.Equal(t, tt.wantImpossible, appErr.NonRetryable())
			if tt.wantImpossible {
				assert.Equal(t, freezeListingImpossible, appErr.Type())
			}
		})
	}
}
