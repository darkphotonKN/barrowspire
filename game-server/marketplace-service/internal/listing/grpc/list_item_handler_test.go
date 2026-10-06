package grpc

import (
	"context"
	"testing"
	"time"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// fakeItemReserver records what items-service would be asked to reserve.
type fakeItemReserver struct {
	calls          int
	gotStartPrice  int
	gotBuyoutPrice *int
	gotEndsAt      time.Time
}

func (f *fakeItemReserver) ReserveItem(ctx context.Context, itemID uuid.UUID, startPrice int, buyoutPrice *int, endsAt time.Time) (*itemspb.ReserveItemResponse, error) {
	f.calls++
	f.gotStartPrice = startPrice
	f.gotBuyoutPrice = buyoutPrice
	f.gotEndsAt = endsAt
	return &itemspb.ReserveItemResponse{}, nil
}

func newListItemHandler(reserver *fakeItemReserver) *Handler {
	return NewHandler(usecase.NewReserveItemUC(reserver), nil, nil, nil, nil, nil, nil, nil, nil)
}

func TestListItemSendsTheSellersTermsToTheReservation(t *testing.T) {
	reserver := &fakeItemReserver{}
	endsAt := time.Now().Add(24 * time.Hour)

	_, err := newListItemHandler(reserver).ListItem(authedCtx(t, uuid.New()), &pb.ListItemRequest{
		ItemId:     uuid.New().String(),
		StartPrice: 150,
		EndsAt:     timestamppb.New(endsAt),
	})

	require.NoError(t, err)
	assert.Equal(t, 1, reserver.calls)
	assert.Equal(t, 150, reserver.gotStartPrice)
	assert.True(t, endsAt.Equal(reserver.gotEndsAt))
}

func TestListItemWithAPastEndTimeIsInvalidArgumentAndReservesNothing(t *testing.T) {
	reserver := &fakeItemReserver{}

	_, err := newListItemHandler(reserver).ListItem(authedCtx(t, uuid.New()), &pb.ListItemRequest{
		ItemId:     uuid.New().String(),
		StartPrice: 150,
		EndsAt:     timestamppb.New(time.Now().Add(-24 * time.Hour)),
	})

	assert.Equal(t, codes.InvalidArgument, status.Code(err))
	assert.Zero(t, reserver.calls, "items-service must not be called for an end time in the past")
}

func TestListItem_SendsBuyoutPriceToTheReservation(t *testing.T) {
	reserver := &fakeItemReserver{}
	buyout := int64(900)

	_, err := newListItemHandler(reserver).ListItem(authedCtx(t, uuid.New()), &pb.ListItemRequest{
		ItemId:      uuid.New().String(),
		StartPrice:  150,
		BuyoutPrice: &buyout,
		EndsAt:      timestamppb.New(time.Now().Add(time.Hour)),
	})

	require.NoError(t, err)
	require.NotNil(t, reserver.gotBuyoutPrice)
	assert.Equal(t, 900, *reserver.gotBuyoutPrice)
}

func TestListItem_WithoutBuyoutPriceSendsNone(t *testing.T) {
	reserver := &fakeItemReserver{}

	_, err := newListItemHandler(reserver).ListItem(authedCtx(t, uuid.New()), &pb.ListItemRequest{
		ItemId:     uuid.New().String(),
		StartPrice: 150,
		EndsAt:     timestamppb.New(time.Now().Add(time.Hour)),
	})

	require.NoError(t, err)
	assert.Nil(t, reserver.gotBuyoutPrice)
}

func TestListItem_BuyoutAtOrBelowStartPriceIsInvalidArgumentAndReservesNothing(t *testing.T) {
	reserver := &fakeItemReserver{}
	buyout := int64(150)

	_, err := newListItemHandler(reserver).ListItem(authedCtx(t, uuid.New()), &pb.ListItemRequest{
		ItemId:      uuid.New().String(),
		StartPrice:  150,
		BuyoutPrice: &buyout,
		EndsAt:      timestamppb.New(time.Now().Add(time.Hour)),
	})

	assert.Equal(t, codes.InvalidArgument, status.Code(err))
	assert.Zero(t, reserver.calls)
}
