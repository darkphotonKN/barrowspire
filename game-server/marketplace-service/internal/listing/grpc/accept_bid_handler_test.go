package grpc

import (
	"context"
	"fmt"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
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
	return NewHandler(nil, nil, nil, nil, nil, nil, nil, nil, uc, nil)
}

// The seller is whoever the token says, never anything in the request. The
// accept floor is the request's (FS-F692V §Req 1).
func TestAcceptBid_PassesTheListingTheAuthenticatedSellerAndTheFloor(t *testing.T) {
	uc := &stubAcceptBid{}
	sellerID, listingID := uuid.New(), uuid.New()

	_, err := newAcceptBidHandler(uc).AcceptBid(authedCtx(t, sellerID), &pb.AcceptBidRequest{ListingId: listingID.String(), MinAmount: 300})

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, listingID, uc.gotCmd.ListingID)
	assert.Equal(t, sellerID, uc.gotCmd.MemberID)
	assert.Equal(t, 300, uc.gotCmd.MinAmount)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

// FS-F692V §Req 7: marketplace refuses a non-positive floor on its own entry,
// for any caller that is not the gateway, so sending zero never skips it.
func TestAcceptBid_RejectedBeforeTheUseCase(t *testing.T) {
	tests := []struct {
		name      string
		ctx       func(t *testing.T) context.Context
		listing   string
		minAmount int64
		wantCode  codes.Code
	}{
		{"no identity", func(t *testing.T) context.Context { return context.Background() }, uuid.NewString(), 300, codes.Unauthenticated},
		{"malformed listing id", func(t *testing.T) context.Context { return authedCtx(t, uuid.New()) }, "not-a-uuid", 300, codes.InvalidArgument},
		{"no floor", func(t *testing.T) context.Context { return authedCtx(t, uuid.New()) }, uuid.NewString(), 0, codes.InvalidArgument},
		{"negative floor", func(t *testing.T) context.Context { return authedCtx(t, uuid.New()) }, uuid.NewString(), -1, codes.InvalidArgument},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubAcceptBid{}

			_, err := newAcceptBidHandler(uc).AcceptBid(tt.ctx(t), &pb.AcceptBidRequest{ListingId: tt.listing, MinAmount: tt.minAmount})

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

			_, err := newAcceptBidHandler(uc).AcceptBid(authedCtx(t, uuid.New()), &pb.AcceptBidRequest{ListingId: uuid.NewString(), MinAmount: 1})

			assert.Equal(t, tt.wantCode, status.Code(err))
		})
	}
}

// FS-F692V §Req 5: a floor refusal crosses as the registered domain refusal, so
// the gateway passes LEADING_BID_LOWERED through instead of a bare
// FAILED_PRECONDITION.
func TestAcceptBid_FloorRefusal_IsLeadingBidLowered(t *testing.T) {
	uc := &stubAcceptBid{err: fmt.Errorf("accept bid uc: %w", listing.ErrLeadingBidLowered)}

	_, err := newAcceptBidHandler(uc).AcceptBid(authedCtx(t, uuid.New()), &pb.AcceptBidRequest{ListingId: uuid.NewString(), MinAmount: 1000})

	st, ok := status.FromError(err)
	require.True(t, ok)
	assert.Equal(t, codes.FailedPrecondition, st.Code())
	reason, ok := errcode.RefusalReason(st)
	require.True(t, ok, "the floor refusal carries a registered reason")
	assert.Equal(t, errcode.LeadingBidLowered, reason)
}
