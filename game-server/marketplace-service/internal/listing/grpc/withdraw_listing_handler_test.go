package grpc

import (
	"context"
	"errors"
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

type stubWithdrawListing struct {
	err    error
	calls  int
	gotCmd usecase.WithdrawListingCommand
}

func (s *stubWithdrawListing) Handle(ctx context.Context, cmd usecase.WithdrawListingCommand) error {
	s.calls++
	s.gotCmd = cmd
	return s.err
}

func newWithdrawListingHandler(uc WithdrawListing) *Handler {
	return NewHandler(nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, uc)
}

// FS-V7A5S Req 1: the seller is whoever the token says, never a request field.
func TestWithdrawListing_PassesTheListingAndTheAuthenticatedSeller(t *testing.T) {
	uc := &stubWithdrawListing{}
	sellerID, listingID := uuid.New(), uuid.New()

	res, err := newWithdrawListingHandler(uc).WithdrawListing(authedCtx(t, sellerID), &pb.WithdrawListingRequest{ListingId: listingID.String()})

	require.NoError(t, err)
	assert.NotNil(t, res)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, listingID, uc.gotCmd.ListingID)
	assert.Equal(t, sellerID, uc.gotCmd.MemberID)
	assert.False(t, uc.gotCmd.Now.IsZero())
}

// Req 11 (amended 2026-11-05): withdrawing is not email-gated. A withdrawal only
// exits a commitment, so an unverified seller can still take a listing down
// (FS-V6SFK §Requirements 30).
func TestWithdrawListing_UnverifiedCaller_CanStillWithdraw(t *testing.T) {
	uc := &stubWithdrawListing{}
	sellerID := uuid.New()

	_, err := newWithdrawListingHandler(uc).WithdrawListing(unverifiedCtx(t, sellerID), &pb.WithdrawListingRequest{ListingId: uuid.NewString()})

	require.NoError(t, err)
	require.Equal(t, 1, uc.calls)
	assert.Equal(t, sellerID, uc.gotCmd.MemberID)
}

// A request with no identity or a malformed id is answered before the use case.
func TestWithdrawListing_RejectedBeforeTheUseCase(t *testing.T) {
	tests := []struct {
		name       string
		ctx        func(t *testing.T) context.Context
		listing    string
		wantCode   codes.Code
		wantReason errcode.Code
	}{
		{"no identity", func(t *testing.T) context.Context { return context.Background() }, uuid.NewString(), codes.Unauthenticated, ""},
		{"malformed listing id", func(t *testing.T) context.Context { return authedCtx(t, uuid.New()) }, "not-a-uuid", codes.InvalidArgument, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := &stubWithdrawListing{}

			_, err := newWithdrawListingHandler(uc).WithdrawListing(tt.ctx(t), &pb.WithdrawListingRequest{ListingId: tt.listing})

			st := status.Convert(err)
			assert.Equal(t, tt.wantCode, st.Code())
			reason, ok := errcode.RefusalReason(st)
			assert.Equal(t, tt.wantReason != "", ok)
			assert.Equal(t, tt.wantReason, reason)
			assert.Zero(t, uc.calls)
		})
	}
}

// Req 11: each refusal reaches the wire as its code, the lock as a registered
// reason the gateway passes through, the rest without one.
func TestWithdrawListing_MapsRefusals(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantCode   codes.Code
		wantReason errcode.Code
	}{
		{"not the seller", listing.ErrNotSeller, codes.PermissionDenied, ""},
		{"final 30 minutes with live bids", listing.ErrListingWithdrawLocked, codes.FailedPrecondition, errcode.ListingWithdrawLocked},
		{"past its end", listing.ErrListingExpired, codes.FailedPrecondition, ""},
		{"bought out or not ACTIVE", listing.ErrListingNotAcceptingBids, codes.FailedPrecondition, ""},
		{"unknown listing", commonconstants.ErrNotFound, codes.NotFound, ""},
		{"row lock timed out", commonconstants.ErrLockUnavailable, codes.Aborted, ""},
		{"withdrawn but the workflow did not start", fmt.Errorf("start: %w: %w", commonconstants.ErrTransient, errors.New("temporal unreachable")), codes.Unavailable, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// wrapped, as the use case returns it
			uc := &stubWithdrawListing{err: fmt.Errorf("withdraw listing uc: %w", tt.err)}

			_, err := newWithdrawListingHandler(uc).WithdrawListing(authedCtx(t, uuid.New()), &pb.WithdrawListingRequest{ListingId: uuid.NewString()})

			st := status.Convert(err)
			assert.Equal(t, tt.wantCode, st.Code())
			reason, ok := errcode.RefusalReason(st)
			assert.Equal(t, tt.wantReason != "", ok)
			assert.Equal(t, tt.wantReason, reason)
			assert.NotContains(t, st.Message(), "withdraw listing uc", "no service context reaches the wire")
		})
	}
}
