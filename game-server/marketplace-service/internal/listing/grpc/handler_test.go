package grpc

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/adapter/itemreserver"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	grpclib "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// fakeRepo keeps one listing in memory. Update, FindByID and Save all act on
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

func (r *fakeRepo) Update(ctx context.Context, id uuid.UUID, fn func(*listing.Listing) error) error {
	return fn(r.l)
}

// fakeWallet records who the hold was placed for, so a test can prove the
// handler passed the authenticated caller rather than an invented member.
type fakeWallet struct {
	calls       int
	gotMemberID uuid.UUID
}

func (w *fakeWallet) PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int, expiresAt time.Time) error {
	w.calls++
	w.gotMemberID = memberID
	return nil
}

// fakeReleaser stands in for the release workflow's starter: it counts the holds a
// use case handed back.
type fakeReleaser struct {
	calls int
}

func (r *fakeReleaser) StartReleaseHold(ctx context.Context, listingID, bidID uuid.UUID) error {
	r.calls++
	return nil
}

func (r *fakeReleaser) ReleaseHoldAndWait(ctx context.Context, listingID, bidID uuid.UUID, maxWait time.Duration) error {
	return r.StartReleaseHold(ctx, listingID, bidID)
}

// authedCtx is a verified player's request context, the ordinary caller every
// handler serves (FS-V6SFK §Requirements 29 gates only the unverified).
func authedCtx(t *testing.T, memberID uuid.UUID) context.Context {
	t.Helper()
	return identityCtx(t, commonauth.Identity{MemberID: memberID, Role: commonauth.RolePlayer, EmailVerified: true})
}

// unverifiedCtx is a player whose token carries no email_verified claim.
func unverifiedCtx(t *testing.T, memberID uuid.UUID) context.Context {
	t.Helper()
	return identityCtx(t, commonauth.Identity{MemberID: memberID, Role: commonauth.RolePlayer})
}

// identityCtx builds the context a request actually arrives with, by driving
// the real auth interceptor rather than faking its context key.
func identityCtx(t *testing.T, id commonauth.Identity) context.Context {
	t.Helper()

	var captured context.Context

	interceptor := commonauth.Auth(func(token string) (commonauth.Identity, error) {
		return id, nil
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

// viewerCtx is the context an optional-auth read (BrowseListings, GetListing)
// arrives with, by driving the real interceptor for that method. A nil viewer
// sends a bearer that fails validation, as an expired or invalid token does, so
// the read runs anonymously (ADR-0053).
func viewerCtx(t *testing.T, method string, viewer *uuid.UUID) context.Context {
	t.Helper()

	var captured context.Context

	interceptor := commonauth.Auth(func(token string) (commonauth.Identity, error) {
		if viewer == nil {
			return commonauth.Identity{}, errors.New("token is expired")
		}
		return commonauth.Identity{MemberID: *viewer, Role: commonauth.RolePlayer, EmailVerified: true}, nil
	})

	incoming := metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)

	_, err := interceptor(incoming, nil, &grpclib.UnaryServerInfo{FullMethod: method},
		func(ctx context.Context, req any) (any, error) {
			captured = ctx
			return nil, nil
		})
	require.NoError(t, err)

	return captured
}

// ownCases are the viewers an optional-auth read answers own for: only the
// listing's seller, signed in, reads true (FS-GKHYD §Requirements 2, 5).
func ownCases(seller uuid.UUID) []struct {
	name    string
	ctx     func(t *testing.T, method string) context.Context
	wantOwn bool
} {
	other := uuid.New()
	return []struct {
		name    string
		ctx     func(t *testing.T, method string) context.Context
		wantOwn bool
	}{
		{"the seller", func(t *testing.T, m string) context.Context { return viewerCtx(t, m, &seller) }, true},
		{"another member", func(t *testing.T, m string) context.Context { return viewerCtx(t, m, &other) }, false},
		{"an invalid or expired token", func(t *testing.T, m string) context.Context { return viewerCtx(t, m, nil) }, false},
		{"no identity at all", func(*testing.T, string) context.Context { return context.Background() }, false},
	}
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
	return newTestHandlerWithRelease(repo, wallet, &fakeReleaser{})
}

func newTestHandlerWithRelease(repo *fakeRepo, wallet *fakeWallet, release *fakeReleaser) *Handler {
	return NewHandler(
		nil,
		nil,
		usecase.NewPlaceBidUC(repo, wallet, release),
		usecase.NewWithdrawBidUC(repo, release),
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil)
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

// fakeItemsClient answers every ReserveItem with the configured status code,
// standing in for items-service behind the real item reserver adapter.
type fakeItemsClient struct {
	itemreserver.ItemReserverClient
	code codes.Code
}

func (c *fakeItemsClient) ReserveItem(ctx context.Context, req *itemspb.ReserveItemRequest) (*itemspb.ReserveItemResponse, error) {
	return nil, status.Error(c.code, "items says no")
}

// An items-service that cannot answer is retryable; only a code marketplace
// does not recognise is a server error.
func TestListItem_ItemsRefusal_KeepsItsMeaning(t *testing.T) {
	tests := []struct {
		name      string
		itemsCode codes.Code
		wantCode  codes.Code
	}{
		{"items unavailable", codes.Unavailable, codes.Unavailable},
		{"items deadline exceeded", codes.DeadlineExceeded, codes.Unavailable},
		{"unrecognised code", codes.DataLoss, codes.Internal},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reserver := itemreserver.NewItemReserver(&fakeItemsClient{code: tt.itemsCode})
			h := NewHandler(usecase.NewReserveItemUC(reserver), nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)

			_, err := h.ListItem(authedCtx(t, uuid.New()), &pb.ListItemRequest{
				ItemId:     uuid.New().String(),
				StartPrice: 100,
				EndsAt:     timestamppb.New(time.Now().Add(24 * time.Hour)),
			})

			assert.Equal(t, tt.wantCode, status.Code(err))
		})
	}
}

// A contended listing must not look like a broken server. mapError decides two
// things that matter here: the code the gateway turns into an HTTP status, and the
// level this shows up at in the logs.
//
// Aborted, not Unavailable: the gateway maps Unavailable to 503 and many gRPC
// clients retry it automatically, which would put back the retry storm the row lock
// was chosen to avoid. Aborted maps to 409, the same answer an OCC conflict already
// gets, and says "somebody else got there first" rather than "the service is down".
func TestMapError_LockTimeout_IsAbortedNotUnavailable(t *testing.T) {
	err := mapError(context.Background(),
		fmt.Errorf("place bid: %w", commonconstants.ErrLockUnavailable))

	assert.Equal(t, codes.Aborted, status.Code(err))
	assert.NotEqual(t, codes.Unavailable, status.Code(err),
		"a busy listing is not a dead service")
	assert.NotEqual(t, codes.Internal, status.Code(err),
		"contention is expected under load, not a bug")
}

// The infrastructure failures keep their own answer: a real outage still reads as one.
func TestMapError_TransientStaysUnavailable(t *testing.T) {
	err := mapError(context.Background(),
		fmt.Errorf("place bid: %w", commonconstants.ErrTransient))

	assert.Equal(t, codes.Unavailable, status.Code(err))
}

// FS-V74WE Req 2, 3, 5: a bid at the buyout price is refused with its own
// registered reason, so the gateway passes it through as 400 ·
// BID_AT_OR_ABOVE_BUYOUT (FS-9XKS6 Req 4). The unlocked read already prices it
// out, so no gold is held for it and there is nothing to give back.
func TestPlaceBid_AtBuyoutPrice_IsRefusedWithItsReasonAndHoldsNoGold(t *testing.T) {
	now := time.Now()
	buyout := 500
	l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), 100, &buyout, now, now.Add(time.Hour))
	require.NoError(t, err)
	repo := &fakeRepo{l: l}
	wallet, release := &fakeWallet{}, &fakeReleaser{}

	_, err = newTestHandlerWithRelease(repo, wallet, release).PlaceBid(authedCtx(t, uuid.New()), &pb.PlaceBidRequest{
		ListingId: l.Snapshot().ID.String(),
		Amount:    500,
	})

	st := status.Convert(err)
	assert.Equal(t, codes.FailedPrecondition, st.Code())
	reason, ok := errcode.RefusalReason(st)
	assert.True(t, ok)
	assert.Equal(t, errcode.BidAtOrAboveBuyout, reason)
	assert.Empty(t, repo.l.Snapshot().Bids)
	assert.Zero(t, wallet.calls, "no gold is held")
	assert.Zero(t, release.calls)
}

// FS-V74WE Req 2, 3, 5: a bid not above the contending bid is refused with its
// own registered reason, so the gateway passes it through as 400 · BID_TOO_LOW;
// no bid is recorded, and the unlocked read already prices it out, so no gold is held.
func TestPlaceBid_NotAboveTheLeader_IsRefusedWithItsReasonAndHoldsNoGold(t *testing.T) {
	repo := &fakeRepo{l: activeListing(t, winningBid(uuid.New(), uuid.New()))}
	wallet, release := &fakeWallet{}, &fakeReleaser{}

	_, err := newTestHandlerWithRelease(repo, wallet, release).PlaceBid(authedCtx(t, uuid.New()), &pb.PlaceBidRequest{
		ListingId: repo.l.Snapshot().ID.String(),
		Amount:    150, // the leader's amount: not above it
	})

	st := status.Convert(err)
	assert.Equal(t, codes.FailedPrecondition, st.Code())
	reason, ok := errcode.RefusalReason(st)
	assert.True(t, ok)
	assert.Equal(t, errcode.BidTooLow, reason)
	assert.Len(t, repo.l.Snapshot().Bids, 1, "only the leader's bid")
	assert.Zero(t, wallet.calls, "no gold is held")
	assert.Zero(t, release.calls)
}

// FS-V74WE Req 2, 6: the two price refusals cross as FailedPrecondition with
// their registered reason; a non-positive amount and a buyout amount mismatch
// stay InvalidArgument (400 · VALIDATION_FAILED at the gateway).
func TestMapError_BidPriceRefusals(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantCode   codes.Code
		wantReason errcode.Code // empty: no registered reason
	}{
		{"too low", listing.ErrBidTooLow, codes.FailedPrecondition, errcode.BidTooLow},
		{"at or above buyout", listing.ErrBidAtOrAboveBuyout, codes.FailedPrecondition, errcode.BidAtOrAboveBuyout},
		{"invalid amount", listing.ErrInvalidAmount, codes.InvalidArgument, ""},
		{"buyout amount mismatch", listing.ErrBuyoutAmountMismatch, codes.InvalidArgument, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// wrapped with context, as the use case returns it
			st := status.Convert(mapError(context.Background(), fmt.Errorf("place bid: %w", tt.err)))

			assert.Equal(t, tt.wantCode, st.Code())
			reason, ok := errcode.RefusalReason(st)
			if tt.wantReason == "" {
				assert.False(t, ok, "reason %q", reason)
				return
			}
			assert.True(t, ok)
			assert.Equal(t, tt.wantReason, reason)
		})
	}
}

// A seller bidding on their own listing is a who-may-do-this refusal, mapped like
// a seller's own buyout: PermissionDenied, and no gold held for it.
func TestPlaceBid_SellerOnOwnListing_PermissionDenied(t *testing.T) {
	l := activeListing(t)
	wallet := &fakeWallet{}
	h := newTestHandler(&fakeRepo{l: l}, wallet)

	_, err := h.PlaceBid(authedCtx(t, l.Snapshot().SellerID), &pb.PlaceBidRequest{
		ListingId: l.Snapshot().ID.String(),
		Amount:    150,
	})

	assert.Equal(t, codes.PermissionDenied, status.Code(err))
	assert.Zero(t, wallet.calls)
}

// A leader locked in by the final window answers FAILED_PRECONDITION, the code
// the client already reads as "this bid can no longer be withdrawn" (FS-0YXG6).
func TestWithdrawBid_LeaderInFinalWindow_FailedPrecondition(t *testing.T) {
	memberID := uuid.New()
	bidID := uuid.New()
	now := time.Now()
	l, err := listing.Reconstitute(listing.ReconstituteParams{
		ID:         uuid.New(),
		SellerID:   uuid.New(),
		ItemID:     uuid.New(),
		StartPrice: 100,
		Status:     listing.StatusActive,
		EndsAt:     now.Add(10 * time.Minute),
		CreatedAt:  now,
		UpdatedAt:  now,
		Bids:       []*listing.BidReconstituteParams{winningBid(bidID, memberID)},
	})
	require.NoError(t, err)
	h := newTestHandler(&fakeRepo{l: l}, &fakeWallet{})

	_, err = h.WithdrawBid(authedCtx(t, memberID), &pb.WithdrawBidRequest{
		ListingId: l.Snapshot().ID.String(),
		BidId:     bidID.String(),
	})

	assert.Equal(t, codes.FailedPrecondition, status.Code(err))
}

// FS-ZE43K Req 8: a member who has withdrawn three bids on the listing is refused
// with the registered reason, so the gateway passes it through as 400 ·
// BID_WITHDRAW_LIMIT_REACHED, and no gold is held for the bid.
func TestPlaceBid_AtTheBidWithdrawalCap_IsRefusedWithItsReason(t *testing.T) {
	member := uuid.New()
	now := time.Now()
	bids := make([]*listing.BidReconstituteParams, 3)
	for i := range bids {
		bids[i] = &listing.BidReconstituteParams{
			ID: uuid.New(), MemberID: member, Type: listing.BidTypeBid, Amount: 150 + i,
			Status: listing.BidStatusCancelled, CreatedAt: now, UpdatedAt: now,
		}
	}
	repo, wallet := &fakeRepo{l: activeListing(t, bids...)}, &fakeWallet{}

	_, err := newTestHandler(repo, wallet).PlaceBid(authedCtx(t, member), &pb.PlaceBidRequest{
		ListingId: repo.l.Snapshot().ID.String(),
		Amount:    200,
	})

	st := status.Convert(err)
	assert.Equal(t, codes.FailedPrecondition, st.Code())
	reason, ok := errcode.RefusalReason(st)
	assert.True(t, ok)
	assert.Equal(t, errcode.BidWithdrawLimitReached, reason)
	assert.Zero(t, wallet.calls)
}

// FS-72KT8 Req 12: a member whose bid already leads is refused with the
// registered reason, so the gateway passes it through as 400 · ALREADY_LEADING,
// and no gold is held for the bid.
func TestPlaceBid_WhileLeading_IsRefusedWithItsReason(t *testing.T) {
	member := uuid.New()
	repo, wallet := &fakeRepo{l: activeListing(t, winningBid(uuid.New(), member))}, &fakeWallet{}

	_, err := newTestHandler(repo, wallet).PlaceBid(authedCtx(t, member), &pb.PlaceBidRequest{
		ListingId: repo.l.Snapshot().ID.String(),
		Amount:    200,
	})

	st := status.Convert(err)
	assert.Equal(t, codes.FailedPrecondition, st.Code())
	reason, ok := errcode.RefusalReason(st)
	assert.True(t, ok)
	assert.Equal(t, errcode.AlreadyLeading, reason)
	assert.Zero(t, wallet.calls)
	assert.Len(t, repo.l.Snapshot().Bids, 1)
}

// FS-72KT8 Req 12: wrapped as the use case returns it, ErrAlreadyLeading maps to
// FailedPrecondition with reason ALREADY_LEADING.
func TestMapError_AlreadyLeading(t *testing.T) {
	st := status.Convert(mapError(context.Background(), fmt.Errorf("place bid: %w", listing.ErrAlreadyLeading)))

	assert.Equal(t, codes.FailedPrecondition, st.Code())
	reason, ok := errcode.RefusalReason(st)
	assert.True(t, ok)
	assert.Equal(t, errcode.AlreadyLeading, reason)
}
