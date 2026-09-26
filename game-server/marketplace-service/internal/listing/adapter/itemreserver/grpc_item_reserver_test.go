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

	_, err := NewItemReserver(client).ReserveItem(ctx, itemID, 150, endsAt)

	require.NoError(t, err)
	require.NotNil(t, client.gotReserve)
	assert.Equal(t, itemID.String(), client.gotReserve.GetItemId())
	assert.Equal(t, int64(150), client.gotReserve.GetStartPrice())
	require.NotNil(t, client.gotReserve.GetEndsAt(), "ends_at must be sent, or the event carries 1970-01-01")
	assert.True(t, endsAt.Equal(client.gotReserve.GetEndsAt().AsTime()))
}
