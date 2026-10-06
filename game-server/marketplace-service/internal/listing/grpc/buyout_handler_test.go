package grpc

import (
	"context"
	"fmt"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type stubBuyout struct {
	err    error
	calls  int
	gotCmd usecase.BuyoutCommand
}

func (s *stubBuyout) Handle(ctx context.Context, cmd usecase.BuyoutCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

func newBuyoutHandler(uc Buyout) *Handler {
	return NewHandler(nil, nil, nil, nil, nil, nil, nil, nil, uc)
}

// The buyer is whoever the token says, never anything in the request.
func TestBuyout_PassesTheListingAndTheAuthenticatedBuyer(t *testing.T) {
	uc := &stubBuyout{}
	buyerID, listingID := uuid.New(), uuid.New()

	_, err := newBuyoutHandler(uc).Buyout(authedCtx(t, buyerID), &pb.BuyoutRequest{ListingId: listingID.String()})

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, listingID, uc.gotCmd.ListingID)
	assert.Equal(t, buyerID, uc.gotCmd.MemberID)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

func TestBuyout_RejectsBeforeTheUsecase(t *testing.T) {
	tests := []struct {
		name     string
		ctx      func(t *testing.T) context.Context
		id       string
		wantCode codes.Code
	}{
		{"no identity", func(*testing.T) context.Context { return context.Background() }, uuid.NewString(), codes.Unauthenticated},
		{"malformed listing id", func(t *testing.T) context.Context { return authedCtx(t, uuid.New()) }, "not-a-uuid", codes.InvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubBuyout{}

			_, err := newBuyoutHandler(uc).Buyout(tt.ctx(t), &pb.BuyoutRequest{ListingId: tt.id})

			assert.Equal(t, tt.wantCode, status.Code(err))
			assert.Zero(t, uc.calls)
		})
	}
}

// Error mapping follows AcceptBid's: who-may-do-this is PermissionDenied,
// what-the-listing-allows-now is FailedPrecondition.
func TestBuyout_RefusalsKeepTheirMeaning(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		wantCode codes.Code
	}{
		{"seller buying own listing", listing.ErrSellerCannotBuyout, codes.PermissionDenied},
		{"no buyout price", listing.ErrNoBuyoutPrice, codes.FailedPrecondition},
		{"not accepting bids (frozen or bought out)", listing.ErrListingNotAcceptingBids, codes.FailedPrecondition},
		{"listing ended", listing.ErrListingExpired, codes.FailedPrecondition},
		{"insufficient gold", commonconstants.ErrInsufficientGold, codes.FailedPrecondition},
		{"unknown listing", commonconstants.ErrNotFound, codes.NotFound},
		{"listing busy", commonconstants.ErrLockUnavailable, codes.Aborted},
		{"transient", commonconstants.ErrTransient, codes.Unavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubBuyout{err: fmt.Errorf("buyout usecase: %w", tt.err)}

			_, err := newBuyoutHandler(uc).Buyout(authedCtx(t, uuid.New()), &pb.BuyoutRequest{ListingId: uuid.NewString()})

			assert.Equal(t, tt.wantCode, status.Code(err))
		})
	}
}
