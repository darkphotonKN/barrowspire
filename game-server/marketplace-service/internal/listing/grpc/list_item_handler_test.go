package grpc

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
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
	// err is what the reservation answers, as the itemreserver adapter hands
	// it back; nil reserves.
	err error
}

func (f *fakeItemReserver) ReserveItem(ctx context.Context, itemID uuid.UUID, startPrice int, buyoutPrice *int, endsAt time.Time) (*itemspb.ReserveItemResponse, error) {
	f.calls++
	f.gotStartPrice = startPrice
	f.gotBuyoutPrice = buyoutPrice
	f.gotEndsAt = endsAt
	if f.err != nil {
		return nil, f.err
	}
	return &itemspb.ReserveItemResponse{}, nil
}

func newListItemHandler(reserver *fakeItemReserver) *Handler {
	return NewHandler(usecase.NewReserveItemUC(reserver), nil, nil, nil, nil, nil, nil, nil, nil, nil)
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

// FS-HBXZN §Requirements B7–B9: items' answer to the reservation reaches the
// caller as items gave it. Each row is what the itemreserver adapter hands
// back for one items answer.
func TestListItem_ItemsAnswerReachesTheCaller(t *testing.T) {
	tests := []struct {
		name       string
		reserveErr error
		wantCode   codes.Code
		wantReason errcode.Code
	}{
		{"worn", errcode.Refuse(errcode.ItemWorn), codes.FailedPrecondition, errcode.ItemWorn},
		{"not available", errcode.Refuse(errcode.ItemNotAvailable), codes.FailedPrecondition, errcode.ItemNotAvailable},
		{"not found", fmt.Errorf("reserve item: %w", commonconstants.ErrNotFound), codes.NotFound, ""},
		{"transient", fmt.Errorf("reserve item: %w", commonconstants.ErrTransient), codes.Unavailable, ""},
		{"anything else", errors.New("boom"), codes.Internal, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reserver := &fakeItemReserver{err: tt.reserveErr}

			_, err := newListItemHandler(reserver).ListItem(authedCtx(t, uuid.New()), &pb.ListItemRequest{
				ItemId:     uuid.New().String(),
				StartPrice: 150,
				EndsAt:     timestamppb.New(time.Now().Add(time.Hour)),
			})

			st := status.Convert(err)
			assert.Equal(t, tt.wantCode, st.Code())
			reason, ok := errcode.RefusalReason(st)
			assert.Equal(t, tt.wantReason != "", ok)
			assert.Equal(t, tt.wantReason, reason)
		})
	}
}

// FS-HBXZN §Requirements B9: the email gate still answers ahead of items, so an
// item refusal never hides EMAIL_UNVERIFIED.
func TestListItem_UnverifiedEmailIsRefusedBeforeItemsIsAsked(t *testing.T) {
	reserver := &fakeItemReserver{err: errcode.Refuse(errcode.ItemWorn)}

	_, err := newListItemHandler(reserver).ListItem(unverifiedCtx(t, uuid.New()), &pb.ListItemRequest{
		ItemId:     uuid.New().String(),
		StartPrice: 150,
		EndsAt:     timestamppb.New(time.Now().Add(time.Hour)),
	})

	reason, ok := errcode.RefusalReason(status.Convert(err))
	require.True(t, ok)
	assert.Equal(t, errcode.EmailUnverified, reason)
	assert.Zero(t, reserver.calls)
}
