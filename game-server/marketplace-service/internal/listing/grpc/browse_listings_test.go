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

type fakeBrowseReader struct {
	page *dto.ListingsPage
	err  error

	calls     int
	gotCursor *commoncursor.EndsAt
	gotLimit  int
}

func (r *fakeBrowseReader) Execute(ctx context.Context, c *commoncursor.EndsAt, limit int) (*dto.ListingsPage, error) {
	r.calls++
	r.gotCursor = c
	r.gotLimit = limit
	if r.err != nil {
		return nil, r.err
	}
	if r.page == nil {
		return &dto.ListingsPage{}, nil
	}
	return r.page, nil
}

func newBrowseHandler(reader *fakeBrowseReader) *Handler {
	return NewHandler(nil, nil, nil, nil, nil, reader, nil)
}

// Browse is public: a visitor with no identity on the context is served.
func TestBrowseListingsServesACallerWithoutIdentity(t *testing.T) {
	reader := &fakeBrowseReader{}

	_, err := newBrowseHandler(reader).BrowseListings(context.Background(), &pb.BrowseListingsRequest{Limit: 20})

	require.NoError(t, err)
	require.Equal(t, 1, reader.calls)
	assert.Nil(t, reader.gotCursor, "no cursor means the first page")
	assert.Equal(t, 20, reader.gotLimit)
}

func TestBrowseListingsRejectsAMalformedCursor(t *testing.T) {
	reader := &fakeBrowseReader{}

	_, err := newBrowseHandler(reader).BrowseListings(context.Background(), &pb.BrowseListingsRequest{Cursor: "%%not-a-cursor%%"})

	assert.Equal(t, codes.InvalidArgument, status.Code(err), "the gateway turns this into 400 VALIDATION_FAILED")
	assert.Zero(t, reader.calls, "a malformed cursor must not reach the database")
}

func TestBrowseListingsPassesTheDecodedCursorOn(t *testing.T) {
	reader := &fakeBrowseReader{}
	position := commoncursor.EndsAt{ID: uuid.New(), EndsAt: time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)}

	_, err := newBrowseHandler(reader).BrowseListings(context.Background(), &pb.BrowseListingsRequest{Cursor: position.Encode()})

	require.NoError(t, err)
	require.NotNil(t, reader.gotCursor)
	assert.Equal(t, position.ID, reader.gotCursor.ID)
	assert.True(t, position.EndsAt.Equal(reader.gotCursor.EndsAt))
}

func TestBrowseListingsMapsThePriceFacts(t *testing.T) {
	ends := time.Now().Add(time.Hour)
	current := 75
	withBids := dto.ListingDetails{
		ID: uuid.New(), SellerID: uuid.New(), ItemID: uuid.New(),
		StartPrice: 50, Status: listing.StatusActive, EndsAt: ends,
		PriceFacts: dto.PriceFacts{BidCount: 2, CurrentPrice: &current},
	}
	noBids := dto.ListingDetails{
		ID: uuid.New(), SellerID: uuid.New(), ItemID: uuid.New(),
		StartPrice: 50, Status: listing.StatusActive, EndsAt: ends,
	}
	reader := &fakeBrowseReader{page: &dto.ListingsPage{
		Listings:   []dto.ListingDetails{withBids, noBids},
		NextCursor: "next-page",
	}}

	res, err := newBrowseHandler(reader).BrowseListings(context.Background(), &pb.BrowseListingsRequest{})

	require.NoError(t, err)
	require.Len(t, res.GetListings(), 2)

	got := res.GetListings()[0]
	assert.Equal(t, withBids.ID.String(), got.GetId())
	assert.Equal(t, withBids.SellerID.String(), got.GetSellerId())
	require.NotNil(t, got.CurrentPrice)
	assert.Equal(t, int64(75), got.GetCurrentPrice())
	assert.Equal(t, int64(76), got.GetMinimumBid())
	assert.Equal(t, int32(2), got.GetBidCount())
	assert.False(t, got.GetEnded())

	opening := res.GetListings()[1]
	assert.Nil(t, opening.CurrentPrice, "no leading bid is absent, not zero")
	assert.Equal(t, int64(50), opening.GetMinimumBid())
	assert.Zero(t, opening.GetBidCount())

	assert.Equal(t, "next-page", res.GetPagination().GetNextCursor())
}

func TestBrowseListingsAnswersAnEmptyPageWhenThereAreNone(t *testing.T) {
	res, err := newBrowseHandler(&fakeBrowseReader{}).BrowseListings(context.Background(), &pb.BrowseListingsRequest{})

	require.NoError(t, err)
	assert.Empty(t, res.GetListings())
	assert.Nil(t, res.GetPagination())
}

func TestBrowseListingsSendsReadFailuresThroughMapError(t *testing.T) {
	reader := &fakeBrowseReader{err: commonconstants.ErrTransient}

	_, err := newBrowseHandler(reader).BrowseListings(context.Background(), &pb.BrowseListingsRequest{})

	assert.Equal(t, codes.Unavailable, status.Code(err))
}
