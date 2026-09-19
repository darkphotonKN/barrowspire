package grpc

import (
	"context"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	grpclib "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// fakeRepo keeps one listing in memory. Modify, FindByID and Save all act on
// it, which is enough for the handler tests to observe what the use cases did.
type fakeRepo struct {
	l *listing.Listing
}

func (r *fakeRepo) FindByID(ctx context.Context, id uuid.UUID) (*listing.Listing, error) {
	return r.l, nil
}

func (r *fakeRepo) Insert(ctx context.Context, l *listing.Listing) error {
	r.l = l
	return nil
}

func (r *fakeRepo) Save(ctx context.Context, l *listing.Listing, before listing.ListingSnapshot) error {
	r.l = l
	return nil
}

func (r *fakeRepo) Modify(ctx context.Context, id uuid.UUID, fn func(*listing.Listing) error) error {
	return fn(r.l)
}

// fakeWallet records who the hold was placed for, so a test can prove the
// handler passed the authenticated caller rather than an invented member.
type fakeWallet struct {
	calls       int
	gotMemberID uuid.UUID
}

func (w *fakeWallet) PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int) error {
	w.calls++
	w.gotMemberID = memberID
	return nil
}

// authedCtx builds the context a request actually arrives with, by driving the
// real auth interceptor rather than faking its context key.
func authedCtx(t *testing.T, memberID uuid.UUID) context.Context {
	t.Helper()

	var captured context.Context

	interceptor := commonauth.Auth(func(token string) (commonauth.Identity, error) {
		return commonauth.Identity{MemberID: memberID, Role: commonauth.RolePlayer}, nil
	})

	incoming := metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)

	_, err := interceptor(incoming, nil, &grpclib.UnaryServerInfo{FullMethod: "/marketplace.MarketplaceService/PlaceBid"},
		func(ctx context.Context, req any) (any, error) {
			captured = ctx
			return nil, nil
		})
	require.NoError(t, err)

	return captured
}

// activeListing is an ACTIVE listing, open for another hour, with the given
// bids already on it.
func activeListing(t *testing.T, bids ...*listing.BidReconstituteParams) *listing.Listing {
	t.Helper()

	now := time.Now()
	l, err := listing.Reconstitute(listing.ReconstituteParams{
		ID:         uuid.New(),
		SellerID:   uuid.New(),
		ItemID:     uuid.New(),
		StartPrice: 100,
		Status:     listing.StatusActive,
		EndsAt:     now.Add(time.Hour),
		CreatedAt:  now,
		UpdatedAt:  now,
		Bids:       bids,
	})
	require.NoError(t, err)

	return l
}

func newTestHandler(repo *fakeRepo, wallet *fakeWallet) *Handler {
	return NewHandler(
		nil,
		nil,
		usecase.NewPlaceBidUC(repo, wallet),
		usecase.NewWithdrawBidUC(repo),
		nil,
	)
}

func TestPlaceBidRejectsACallerWithoutIdentity(t *testing.T) {
	l := activeListing(t)
	wallet := &fakeWallet{}
	h := newTestHandler(&fakeRepo{l: l}, wallet)

	_, err := h.PlaceBid(context.Background(), &pb.PlaceBidRequest{
		ListingId: l.Snapshot().ID.String(),
		Amount:    150,
	})

	assert.Equal(t, codes.Unauthenticated, status.Code(err))
	assert.Zero(t, wallet.calls, "no gold may be held for an unknown caller")
}

func TestPlaceBidHoldsGoldForTheAuthenticatedCaller(t *testing.T) {
	memberID := uuid.New()
	l := activeListing(t)
	repo := &fakeRepo{l: l}
	wallet := &fakeWallet{}
	h := newTestHandler(repo, wallet)

	_, err := h.PlaceBid(authedCtx(t, memberID), &pb.PlaceBidRequest{
		ListingId: l.Snapshot().ID.String(),
		Amount:    150,
	})
	require.NoError(t, err)

	assert.Equal(t, memberID, wallet.gotMemberID)

	bids := repo.l.Snapshot().Bids
	require.Len(t, bids, 1)
	assert.Equal(t, memberID, bids[0].MemberID)
}

func TestWithdrawBidRejectsACallerWithoutIdentity(t *testing.T) {
	bidID := uuid.New()
	l := activeListing(t, winningBid(bidID, uuid.New()))
	h := newTestHandler(&fakeRepo{l: l}, &fakeWallet{})

	_, err := h.WithdrawBid(context.Background(), &pb.WithdrawBidRequest{
		ListingId: l.Snapshot().ID.String(),
		BidId:     bidID.String(),
	})

	assert.Equal(t, codes.Unauthenticated, status.Code(err))
}

// The ownership check used to be unreachable: the handler invented a fresh
// member per call, so no caller ever matched their own bid.
func TestWithdrawBidLetsTheOwnerWithdraw(t *testing.T) {
	memberID := uuid.New()
	bidID := uuid.New()
	l := activeListing(t, winningBid(bidID, memberID))
	repo := &fakeRepo{l: l}
	h := newTestHandler(repo, &fakeWallet{})

	_, err := h.WithdrawBid(authedCtx(t, memberID), &pb.WithdrawBidRequest{
		ListingId: l.Snapshot().ID.String(),
		BidId:     bidID.String(),
	})
	require.NoError(t, err)

	bids := repo.l.Snapshot().Bids
	require.Len(t, bids, 1)
	assert.Equal(t, listing.BidStatusCancelled, bids[0].Status)
}

func TestWithdrawBidRejectsSomeoneElsesBid(t *testing.T) {
	bidID := uuid.New()
	l := activeListing(t, winningBid(bidID, uuid.New()))
	h := newTestHandler(&fakeRepo{l: l}, &fakeWallet{})

	_, err := h.WithdrawBid(authedCtx(t, uuid.New()), &pb.WithdrawBidRequest{
		ListingId: l.Snapshot().ID.String(),
		BidId:     bidID.String(),
	})

	assert.Equal(t, codes.PermissionDenied, status.Code(err))
}

func winningBid(bidID, memberID uuid.UUID) *listing.BidReconstituteParams {
	now := time.Now()
	return &listing.BidReconstituteParams{
		ID:        bidID,
		MemberID:  memberID,
		Type:      listing.BidTypeBid,
		Amount:    150,
		Status:    listing.BidStatusWinning,
		CreatedAt: now,
		UpdatedAt: now,
	}
}
