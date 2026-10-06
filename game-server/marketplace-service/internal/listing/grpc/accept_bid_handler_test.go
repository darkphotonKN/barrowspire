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

type stubAcceptBid struct {
	err    error
	calls  int
	gotCmd usecase.AcceptBidCommand
}

func (s *stubAcceptBid) Handle(ctx context.Context, cmd usecase.AcceptBidCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

func newAcceptBidHandler(uc AcceptBid) *Handler {
	return NewHandler(nil, nil, nil, nil, nil, nil, nil, uc, nil)
}

// The seller is whoever the token says, never anything in the request.
func TestAcceptBid_PassesTheListingAndTheAuthenticatedSeller(t *testing.T) {
	uc := &stubAcceptBid{}
	sellerID, listingID := uuid.New(), uuid.New()

	_, err := newAcceptBidHandler(uc).AcceptBid(authedCtx(t, sellerID), &pb.AcceptBidRequest{ListingId: listingID.String()})

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, listingID, uc.gotCmd.ListingID)
	assert.Equal(t, sellerID, uc.gotCmd.MemberID)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

func TestAcceptBid_RejectedBeforeTheUseCase(t *testing.T) {
	tests := []struct {
		name     string
		ctx      func(t *testing.T) context.Context
		listing  string
		wantCode codes.Code
	}{
		{"no identity", func(t *testing.T) context.Context { return context.Background() }, uuid.NewString(), codes.Unauthenticated},
		{"malformed listing id", func(t *testing.T) context.Context { return authedCtx(t, uuid.New()) }, "not-a-uuid", codes.InvalidArgument},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubAcceptBid{}

			_, err := newAcceptBidHandler(uc).AcceptBid(tt.ctx(t), &pb.AcceptBidRequest{ListingId: tt.listing})

			assert.Equal(t, tt.wantCode, status.Code(err))
			assert.Equal(t, 0, uc.calls)
		})
	}
}

func TestAcceptBid_MapsRefusals(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		wantCode codes.Code
	}{
		{"not the seller", listing.ErrNotSeller, codes.PermissionDenied},
		{"listing not found", commonconstants.ErrNotFound, codes.NotFound},
		{"listing not accepting bids", listing.ErrListingNotAcceptingBids, codes.FailedPrecondition},
		{"listing expired", listing.ErrListingExpired, codes.FailedPrecondition},
		{"no bid to accept", listing.ErrNoBidToAccept, codes.FailedPrecondition},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubAcceptBid{err: fmt.Errorf("accept bid uc: %w", tt.err)}

			_, err := newAcceptBidHandler(uc).AcceptBid(authedCtx(t, uuid.New()), &pb.AcceptBidRequest{ListingId: uuid.NewString()})

			assert.Equal(t, tt.wantCode, status.Code(err))
		})
	}
}
