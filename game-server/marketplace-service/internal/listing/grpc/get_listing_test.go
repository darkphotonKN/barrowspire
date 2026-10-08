package grpc

import (
	"context"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type fakeListingReader struct {
	listing *dto.ListingDetails
	err     error

	calls int
	gotID uuid.UUID
}

func (r *fakeListingReader) Execute(ctx context.Context, listingID uuid.UUID) (*dto.ListingDetails, error) {
	r.calls++
	r.gotID = listingID
	if r.err != nil {
		return nil, r.err
	}
	return r.listing, nil
}

func newGetListingHandler(reader *fakeListingReader) *Handler {
	return NewHandler(nil, nil, nil, nil, nil, nil, reader, nil, nil)
}

// Get-one is public: a visitor with no identity on the context is served, and
// an ACTIVE listing past its end comes back ended.
func TestGetListingServesACallerWithoutIdentity(t *testing.T) {
	current := 75
	ended := dto.ListingDetails{
		ID: uuid.New(), SellerID: uuid.New(), ItemID: uuid.New(),
		StartPrice: 50, Status: listing.StatusActive, EndsAt: time.Now().Add(-time.Minute),
		PriceFacts: dto.PriceFacts{BidCount: 2, CurrentPrice: &current},
	}
	reader := &fakeListingReader{listing: &ended}

	res, err := newGetListingHandler(reader).GetListing(context.Background(), &pb.GetListingRequest{ListingId: ended.ID.String()})

	require.NoError(t, err)
	assert.Equal(t, ended.ID, reader.gotID)
	got := res.GetListing()
	assert.Equal(t, ended.ID.String(), got.GetId())
	assert.Equal(t, int64(75), got.GetCurrentPrice())
	assert.Equal(t, int64(76), got.GetMinimumBid())
	assert.Equal(t, int32(2), got.GetBidCount())
	assert.True(t, got.GetEnded())
}

func TestGetListingRejectsAMalformedID(t *testing.T) {
	reader := &fakeListingReader{}

	_, err := newGetListingHandler(reader).GetListing(context.Background(), &pb.GetListingRequest{ListingId: "not-a-uuid"})

	assert.Equal(t, codes.InvalidArgument, status.Code(err))
	assert.Zero(t, reader.calls)
}

func TestGetListingSendsReadFailuresThroughMapError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want codes.Code
	}{
		{"unknown id", commonconstants.ErrNotFound, codes.NotFound},
		{"transient", commonconstants.ErrTransient, codes.Unavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reader := &fakeListingReader{err: tt.err}

			_, err := newGetListingHandler(reader).GetListing(context.Background(), &pb.GetListingRequest{ListingId: uuid.NewString()})

			assert.Equal(t, tt.want, status.Code(err))
		})
	}
}

// The buyout price reaches the wire when set and stays absent, never 0, when
// not (FS-9XKS6 Req 9).
func TestGetListing_CarriesTheBuyoutPrice(t *testing.T) {
	buyout := 500

	tests := []struct {
		name   string
		buyout *int
	}{
		{"set", &buyout},
		{"none", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := dto.ListingDetails{
				ID: uuid.New(), SellerID: uuid.New(), ItemID: uuid.New(),
				StartPrice: 50, BuyoutPrice: tt.buyout, Status: listing.StatusActive, EndsAt: time.Now().Add(time.Hour),
			}

			res, err := newGetListingHandler(&fakeListingReader{listing: &l}).GetListing(context.Background(), &pb.GetListingRequest{ListingId: l.ID.String()})

			require.NoError(t, err)
			if tt.buyout == nil {
				assert.Nil(t, res.GetListing().BuyoutPrice)
				return
			}
			assert.Equal(t, int64(500), res.GetListing().GetBuyoutPrice())
		})
	}
}
