package grpc

import (
	"context"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commoncursor "github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// fakeMyBidsReader records what the handler asked for, so a test can prove the
// member came from the token and the cursor was decoded before the read.
type fakeMyBidsReader struct {
	page *dto.MyBidsPage
	err  error

	calls     int
	gotMember uuid.UUID
	gotCursor *commoncursor.Cursor
	gotLimit  int
}

func (r *fakeMyBidsReader) Execute(ctx context.Context, memberID uuid.UUID, c *commoncursor.Cursor, limit int) (*dto.MyBidsPage, error) {
	r.calls++
	r.gotMember = memberID
	r.gotCursor = c
	r.gotLimit = limit
	if r.err != nil {
		return nil, r.err
	}
	if r.page == nil {
		return &dto.MyBidsPage{}, nil
	}
	return r.page, nil
}

func newMyBidsHandler(reader *fakeMyBidsReader) *Handler {
	return NewHandler(nil, nil, nil, nil, nil, reader, nil, nil, nil, nil)
}

func TestListMyBidsReadsTheCallersOwnBids(t *testing.T) {
	caller := uuid.New()
	reader := &fakeMyBidsReader{}

	_, err := newMyBidsHandler(reader).ListMyBids(authedCtx(t, caller), &pb.ListMyBidsRequest{Limit: 20})

	require.NoError(t, err)
	require.Equal(t, 1, reader.calls)
	assert.Equal(t, caller, reader.gotMember, "the member must be the authenticated caller")
	assert.Nil(t, reader.gotCursor, "no cursor means the first page")
	assert.Equal(t, 20, reader.gotLimit)
}

func TestListMyBidsRejectsACallerWithoutIdentity(t *testing.T) {
	reader := &fakeMyBidsReader{}

	_, err := newMyBidsHandler(reader).ListMyBids(context.Background(), &pb.ListMyBidsRequest{})

	assert.Equal(t, codes.Unauthenticated, status.Code(err))
	assert.Zero(t, reader.calls)
}

func TestListMyBidsRejectsAMalformedCursor(t *testing.T) {
	reader := &fakeMyBidsReader{}

	_, err := newMyBidsHandler(reader).ListMyBids(authedCtx(t, uuid.New()), &pb.ListMyBidsRequest{Cursor: "%%not-a-cursor%%"})

	assert.Equal(t, codes.InvalidArgument, status.Code(err))
	assert.Zero(t, reader.calls, "a malformed cursor must not reach the database")
}

func TestListMyBidsPassesTheDecodedCursorOn(t *testing.T) {
	reader := &fakeMyBidsReader{}
	position := commoncursor.Cursor{ID: uuid.New(), CreatedAt: time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)}

	_, err := newMyBidsHandler(reader).ListMyBids(authedCtx(t, uuid.New()), &pb.ListMyBidsRequest{Cursor: position.Encode()})

	require.NoError(t, err)
	require.NotNil(t, reader.gotCursor)
	assert.Equal(t, position.ID, reader.gotCursor.ID)
	assert.True(t, position.CreatedAt.Equal(reader.gotCursor.CreatedAt))
}

func TestListMyBidsMapsEveryBidField(t *testing.T) {
	placed := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	currentPrice, buyoutPrice := 80, 500

	contested := dto.MyBid{
		ID:        uuid.New(),
		ListingID: uuid.New(),
		Amount:    60,
		Status:    listing.BidStatusOutbid,
		PlacedAt:  placed,
		Listing: dto.MyBidListing{
			Status:      listing.StatusActive,
			EndsAt:      time.Now().Add(time.Hour),
			ItemID:      uuid.New(),
			BuyoutPrice: &buyoutPrice,
			PriceFacts:  dto.PriceFacts{BidCount: 2, CurrentPrice: &currentPrice},
		},
	}
	ended := dto.MyBid{
		ID:        uuid.New(),
		ListingID: uuid.New(),
		Amount:    55,
		Status:    listing.BidStatusOutbid,
		PlacedAt:  placed.Add(-time.Hour),
		Listing: dto.MyBidListing{
			Status: listing.StatusActive,
			EndsAt: time.Now().Add(-time.Hour),
			ItemID: uuid.New(),
		},
	}
	reader := &fakeMyBidsReader{page: &dto.MyBidsPage{
		Bids:       []dto.MyBid{contested, ended},
		NextCursor: "next-page",
	}}

	res, err := newMyBidsHandler(reader).ListMyBids(authedCtx(t, uuid.New()), &pb.ListMyBidsRequest{})

	require.NoError(t, err)
	require.Len(t, res.GetBids(), 2)

	got := res.GetBids()[0]
	assert.Equal(t, contested.ID.String(), got.GetBidId())
	assert.Equal(t, contested.ListingID.String(), got.GetListingId())
	assert.Equal(t, int64(60), got.GetAmount())
	assert.Equal(t, string(listing.BidStatusOutbid), got.GetStatus())
	assert.True(t, placed.Equal(got.GetPlacedAt().AsTime()))
	assert.Equal(t, string(listing.StatusActive), got.GetListing().GetStatus())
	assert.True(t, contested.Listing.EndsAt.Equal(got.GetListing().GetEndsAt().AsTime()))
	assert.False(t, got.GetListing().GetEnded())
	assert.Equal(t, int64(80), got.GetListing().GetCurrentPrice())
	assert.Equal(t, int64(500), got.GetListing().GetBuyoutPrice())
	assert.Equal(t, contested.Listing.ItemID.String(), got.GetListing().GetItemInstanceId())

	// nobody leads and no buyout was set: both say so by absence
	past := res.GetBids()[1]
	assert.True(t, past.GetListing().GetEnded())
	assert.Nil(t, past.GetListing().CurrentPrice)
	assert.Nil(t, past.GetListing().BuyoutPrice)

	assert.Equal(t, "next-page", res.GetPagination().GetNextCursor())
}

// A member with no bids gets an empty page, not NotFound, and the last page
// carries no pagination to follow.
func TestListMyBidsAnswersAnEmptyPageWhenThereAreNone(t *testing.T) {
	res, err := newMyBidsHandler(&fakeMyBidsReader{}).ListMyBids(authedCtx(t, uuid.New()), &pb.ListMyBidsRequest{})

	require.NoError(t, err)
	assert.Empty(t, res.GetBids())
	assert.Nil(t, res.GetPagination())
}

func TestListMyBidsSendsReadFailuresThroughMapError(t *testing.T) {
	reader := &fakeMyBidsReader{err: commonconstants.ErrTransient}

	_, err := newMyBidsHandler(reader).ListMyBids(authedCtx(t, uuid.New()), &pb.ListMyBidsRequest{})

	assert.Equal(t, codes.Unavailable, status.Code(err))
}
