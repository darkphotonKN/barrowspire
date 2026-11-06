package grpc

import (
	"context"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// assertEmailUnverified checks err is the EMAIL_UNVERIFIED refusal as it
// crosses the wire, so the gateway can pass it through as 400.
func assertEmailUnverified(t *testing.T, err error) {
	t.Helper()
	st, ok := status.FromError(err)
	require.True(t, ok, "want a gRPC status, got %v", err)
	assert.Equal(t, codes.FailedPrecondition, st.Code())
	reason, ok := errcode.RefusalReason(st)
	assert.True(t, ok, "the refusal must carry a registered reason")
	assert.Equal(t, errcode.EmailUnverified, reason)
}

// FS-V6SFK §Requirements 29: listing, bidding and buyout refuse an unverified
// caller before any read or write, so nothing downstream is touched.
func TestListItem_UnverifiedCaller_IsRefusedBeforeTheReservation(t *testing.T) {
	reserver := &fakeItemReserver{}

	_, err := newListItemHandler(reserver).ListItem(unverifiedCtx(t, uuid.New()), &pb.ListItemRequest{
		ItemId:     uuid.New().String(),
		StartPrice: 150,
		EndsAt:     timestamppb.New(time.Now().Add(time.Hour)),
	})

	assertEmailUnverified(t, err)
	assert.Zero(t, reserver.calls, "items-service must not be asked to reserve for an unverified seller")
}

func TestPlaceBid_UnverifiedCaller_IsRefusedWithNoHoldAndNoBid(t *testing.T) {
	l := activeListing(t)
	repo := &fakeRepo{l: l}
	wallet := &fakeWallet{}

	_, err := newTestHandler(repo, wallet).PlaceBid(unverifiedCtx(t, uuid.New()), &pb.PlaceBidRequest{
		ListingId: l.Snapshot().ID.String(),
		Amount:    150,
	})

	assertEmailUnverified(t, err)
	assert.Zero(t, wallet.calls, "no gold may be held for an unverified bidder")
	assert.Empty(t, repo.l.Snapshot().Bids)
}

func TestBuyout_UnverifiedCaller_IsRefusedBeforeTheUsecase(t *testing.T) {
	uc := &stubBuyout{}

	_, err := newBuyoutHandler(uc).Buyout(unverifiedCtx(t, uuid.New()), &pb.BuyoutRequest{ListingId: uuid.NewString(), Amount: 500})

	assertEmailUnverified(t, err)
	assert.Zero(t, uc.calls)
}

// FS-V6SFK §Requirements 30: a gate never traps a commitment already made, so
// withdraw and accept stay open to the unverified, as do the reads.
func TestWithdrawBid_UnverifiedCaller_CanStillWithdraw(t *testing.T) {
	memberID, bidID := uuid.New(), uuid.New()
	l := activeListing(t, winningBid(bidID, memberID))
	repo := &fakeRepo{l: l}

	_, err := newTestHandler(repo, &fakeWallet{}).WithdrawBid(unverifiedCtx(t, memberID), &pb.WithdrawBidRequest{
		ListingId: l.Snapshot().ID.String(),
		BidId:     bidID.String(),
	})

	require.NoError(t, err)
	assert.Equal(t, listing.BidStatusCancelled, repo.l.Snapshot().Bids[0].Status)
}

func TestAcceptBid_UnverifiedCaller_CanStillAccept(t *testing.T) {
	uc := &stubAcceptBid{}

	_, err := newAcceptBidHandler(uc).AcceptBid(unverifiedCtx(t, uuid.New()), &pb.AcceptBidRequest{ListingId: uuid.NewString(), MinAmount: 1})

	require.NoError(t, err)
	assert.Equal(t, 1, uc.calls)
}

func TestOwnReads_UnverifiedCaller_StillRead(t *testing.T) {
	ctx := func() context.Context { return unverifiedCtx(t, uuid.New()) }

	listings := &fakeMyListingsReader{}
	_, err := newReadHandler(listings).ListMyListings(ctx(), &pb.ListMyListingsRequest{})
	require.NoError(t, err)
	assert.Equal(t, 1, listings.calls)

	bids := &fakeMyBidsReader{}
	_, err = newMyBidsHandler(bids).ListMyBids(ctx(), &pb.ListMyBidsRequest{})
	require.NoError(t, err)
	assert.Equal(t, 1, bids.calls)
}
