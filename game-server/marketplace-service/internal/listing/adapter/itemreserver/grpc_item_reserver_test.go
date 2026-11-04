package itemreserver

import (
	"context"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/metadata"
)

// fakeClient records the request items-service would receive.
type fakeClient struct {
	ItemReserverClient
	gotReserve *pb.ReserveItemRequest
	gotList    *pb.ListStaleReservedRequest
	gotCancel  *pb.CancelReservationRequest
	gotConfirm *pb.ConfirmReservationRequest
}

func (f *fakeClient) ListStaleReserved(ctx context.Context, req *pb.ListStaleReservedRequest) (*pb.ListStaleReservedResponse, error) {
	f.gotList = req
	return &pb.ListStaleReservedResponse{}, nil
}

func (f *fakeClient) CancelReservation(ctx context.Context, req *pb.CancelReservationRequest) (*pb.CancelReservationResponse, error) {
	f.gotCancel = req
	return &pb.CancelReservationResponse{}, nil
}

func (f *fakeClient) ConfirmReservation(ctx context.Context, req *pb.ConfirmReservationRequest) (*pb.ConfirmReservationResponse, error) {
	f.gotConfirm = req
	return &pb.ConfirmReservationResponse{}, nil
}

func (f *fakeClient) ReserveItem(ctx context.Context, req *pb.ReserveItemRequest) (*pb.ReserveItemResponse, error) {
	f.gotReserve = req
	return &pb.ReserveItemResponse{}, nil
}

func TestReserveItemRequestCarriesTheListingTerms(t *testing.T) {
	itemID := uuid.New()
	endsAt := time.Now().Add(24 * time.Hour)
	client := &fakeClient{}
	ctx := metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)

	_, err := NewItemReserver(client).ReserveItem(ctx, itemID, 150, nil, endsAt)

	require.NoError(t, err)
	require.NotNil(t, client.gotReserve)
	assert.Equal(t, itemID.String(), client.gotReserve.GetItemId())
	assert.Equal(t, int64(150), client.gotReserve.GetStartPrice())
	require.NotNil(t, client.gotReserve.GetEndsAt(), "ends_at must be sent, or the event carries 1970-01-01")
	assert.True(t, endsAt.Equal(client.gotReserve.GetEndsAt().AsTime()))
	assert.Nil(t, client.gotReserve.BuyoutPrice, "no buyout must stay absent, not become 0")
}

func TestReserveItemRequestCarriesTheBuyoutPrice(t *testing.T) {
	client := &fakeClient{}
	ctx := metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)
	buyout := 900

	_, err := NewItemReserver(client).ReserveItem(ctx, uuid.New(), 150, &buyout, time.Now().Add(time.Hour))

	require.NoError(t, err)
	require.NotNil(t, client.gotReserve.BuyoutPrice)
	assert.Equal(t, int64(900), client.gotReserve.GetBuyoutPrice())
}

func authedCtx() context.Context {
	return metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)
}

// The reconciler sends an age, which items-service measures on its own clock,
// not a cutoff computed on this one.
func TestListStaleReservedRequestCarriesTheAge(t *testing.T) {
	client := &fakeClient{}

	_, err := NewItemReserver(client).ListStaleReserved(authedCtx(), 10*time.Minute)

	require.NoError(t, err)
	require.NotNil(t, client.gotList.GetOlderThan(), "a missing age would read as zero")
	assert.Equal(t, 10*time.Minute, client.gotList.GetOlderThan().AsDuration())
}

// Cancel and confirm both name the listing, so items-service fences the write to
// that one reservation.
func TestReservationWritesCarryItemAndListing(t *testing.T) {
	itemID, listingID := uuid.New(), uuid.New()
	client := &fakeClient{}
	reserver := NewItemReserver(client)

	_, err := reserver.CancelReservation(authedCtx(), itemID, listingID)
	require.NoError(t, err)
	_, err = reserver.ConfirmReservation(authedCtx(), itemID, listingID)
	require.NoError(t, err)

	assert.Equal(t, itemID.String(), client.gotCancel.GetItemId())
	assert.Equal(t, listingID.String(), client.gotCancel.GetListingId())
	assert.Equal(t, itemID.String(), client.gotConfirm.GetItemId())
	assert.Equal(t, listingID.String(), client.gotConfirm.GetListingId())
}
