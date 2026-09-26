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

// fakeMyListingsReader records what the handler asked for, so a test can prove
// the seller came from the token and the cursor was decoded before the read.
type fakeMyListingsReader struct {
	page *dto.ListingsPage
	err  error

	calls     int
	gotSeller uuid.UUID
	gotCursor *commoncursor.Cursor
	gotLimit  int
}

func (r *fakeMyListingsReader) Execute(ctx context.Context, sellerID uuid.UUID, c *commoncursor.Cursor, limit int) (*dto.ListingsPage, error) {
	r.calls++
	r.gotSeller = sellerID
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

func newReadHandler(reader *fakeMyListingsReader) *Handler {
	return NewHandler(nil, nil, nil, nil, reader)
}

func TestListMyListingsReadsTheCallersOwnListings(t *testing.T) {
	caller := uuid.New()
	reader := &fakeMyListingsReader{}

	_, err := newReadHandler(reader).ListMyListings(authedCtx(t, caller), &pb.ListMyListingsRequest{Limit: 20})

	require.NoError(t, err)
	require.Equal(t, 1, reader.calls)
	assert.Equal(t, caller, reader.gotSeller, "the seller must be the authenticated caller")
	assert.Nil(t, reader.gotCursor, "no cursor means the first page")
	assert.Equal(t, 20, reader.gotLimit)
}

func TestListMyListingsRejectsACallerWithoutIdentity(t *testing.T) {
	reader := &fakeMyListingsReader{}

	_, err := newReadHandler(reader).ListMyListings(context.Background(), &pb.ListMyListingsRequest{})

	assert.Equal(t, codes.Unauthenticated, status.Code(err))
	assert.Zero(t, reader.calls)
}

func TestListMyListingsRejectsAMalformedCursor(t *testing.T) {
	reader := &fakeMyListingsReader{}

	_, err := newReadHandler(reader).ListMyListings(authedCtx(t, uuid.New()), &pb.ListMyListingsRequest{Cursor: "%%not-a-cursor%%"})

	assert.Equal(t, codes.InvalidArgument, status.Code(err))
	assert.Zero(t, reader.calls, "a malformed cursor must not reach the database")
}

func TestListMyListingsPassesTheDecodedCursorOn(t *testing.T) {
	reader := &fakeMyListingsReader{}
	position := commoncursor.Cursor{ID: uuid.New(), CreatedAt: time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)}

	_, err := newReadHandler(reader).ListMyListings(authedCtx(t, uuid.New()), &pb.ListMyListingsRequest{Cursor: position.Encode()})

	require.NoError(t, err)
	require.NotNil(t, reader.gotCursor)
	assert.Equal(t, position.ID, reader.gotCursor.ID)
	assert.True(t, position.CreatedAt.Equal(reader.gotCursor.CreatedAt))
}

func TestListMyListingsMapsEveryListingField(t *testing.T) {
	caller := uuid.New()
	buyer := uuid.New()
	soldPrice := 900
	created := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	sold := dto.ListingDetails{
		ID:         uuid.New(),
		SellerID:   caller,
		BuyerID:    &buyer,
		ItemID:     uuid.New(),
		StartPrice: 300,
		SoldPrice:  &soldPrice,
		Status:     listing.StatusSold,
		EndsAt:     created.Add(24 * time.Hour),
		CreatedAt:  created,
		UpdatedAt:  created.Add(25 * time.Hour),
	}
	active := dto.ListingDetails{
		ID:         uuid.New(),
		SellerID:   caller,
		ItemID:     uuid.New(),
		StartPrice: 100,
		Status:     listing.StatusListed,
		EndsAt:     created.Add(48 * time.Hour),
		CreatedAt:  created.Add(-time.Hour),
		UpdatedAt:  created.Add(-time.Hour),
	}
	reader := &fakeMyListingsReader{page: &dto.ListingsPage{
		Listings:   []dto.ListingDetails{sold, active},
		NextCursor: "next-page",
	}}

	res, err := newReadHandler(reader).ListMyListings(authedCtx(t, caller), &pb.ListMyListingsRequest{})

	require.NoError(t, err)
	require.Len(t, res.GetListings(), 2)

	got := res.GetListings()[0]
	assert.Equal(t, sold.ID.String(), got.GetId())
	assert.Equal(t, caller.String(), got.GetSellerId())
	assert.Equal(t, buyer.String(), got.GetBuyerId())
	assert.Equal(t, sold.ItemID.String(), got.GetItemId())
	assert.Equal(t, int64(300), got.GetStartPrice())
	assert.Equal(t, int64(900), got.GetSoldPrice())
	assert.Equal(t, string(listing.StatusSold), got.GetStatus())
	assert.True(t, sold.EndsAt.Equal(got.GetEndsAt().AsTime()))
	assert.True(t, sold.CreatedAt.Equal(got.GetCreatedAt().AsTime()))
	assert.True(t, sold.UpdatedAt.Equal(got.GetUpdatedAt().AsTime()))

	// an unsold listing has no buyer and no sold price, and says so by absence
	unsold := res.GetListings()[1]
	assert.Nil(t, unsold.BuyerId)
	assert.Nil(t, unsold.SoldPrice)

	assert.Equal(t, "next-page", res.GetPagination().GetNextCursor())
}

// A member with no listings gets an empty page, not NotFound, and the last
// page carries no pagination to follow.
func TestListMyListingsAnswersAnEmptyPageWhenThereAreNone(t *testing.T) {
	res, err := newReadHandler(&fakeMyListingsReader{}).ListMyListings(authedCtx(t, uuid.New()), &pb.ListMyListingsRequest{})

	require.NoError(t, err)
	assert.Empty(t, res.GetListings())
	assert.Nil(t, res.GetPagination())
}

func TestListMyListingsSendsReadFailuresThroughMapError(t *testing.T) {
	reader := &fakeMyListingsReader{err: commonconstants.ErrTransient}

	_, err := newReadHandler(reader).ListMyListings(authedCtx(t, uuid.New()), &pb.ListMyListingsRequest{})

	assert.Equal(t, codes.Unavailable, status.Code(err))
}
