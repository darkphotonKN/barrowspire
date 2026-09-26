package usecase

import (
	"context"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeItemReserver stands in for items-service. It records what it was asked
// to reserve, so a test can prove the seller's terms reach the reservation.
type fakeItemReserver struct {
	calls int

	gotItemID     uuid.UUID
	gotStartPrice int
	gotEndsAt     time.Time
}

func (f *fakeItemReserver) ReserveItem(ctx context.Context, itemID uuid.UUID, startPrice int, endsAt time.Time) (*pb.ReserveItemResponse, error) {
	f.calls++
	f.gotItemID = itemID
	f.gotStartPrice = startPrice
	f.gotEndsAt = endsAt
	return &pb.ReserveItemResponse{}, nil
}

func TestReserveItemSendsTheSellersTermsToTheReserver(t *testing.T) {
	now := time.Now()
	cmd := &ReserveItemCommand{
		SellerID:   uuid.New(),
		ItemID:     uuid.New(),
		StartPrice: 150,
		Now:        now,
		EndsAt:     now.Add(24 * time.Hour),
	}
	reserver := &fakeItemReserver{}

	err := NewReserveItemUC(reserver).Handle(context.Background(), cmd)

	require.NoError(t, err)
	assert.Equal(t, 1, reserver.calls)
	assert.Equal(t, cmd.ItemID, reserver.gotItemID)
	assert.Equal(t, 150, reserver.gotStartPrice)
	assert.True(t, cmd.EndsAt.Equal(reserver.gotEndsAt), "ends_at must reach the reservation unchanged")
}

// Terms the listing would refuse must be refused before the item is reserved,
// otherwise the item is locked for a listing that can never be born.
func TestReserveItemRefusesTermsTheListingWouldRefuseBeforeReserving(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name       string
		startPrice int
		endsAt     time.Time
		want       error
	}{
		{name: "end time in the past", startPrice: 150, endsAt: now.Add(-24 * time.Hour), want: listing.ErrInvalidEndTime},
		{name: "end time is now", startPrice: 150, endsAt: now, want: listing.ErrInvalidEndTime},
		{name: "non-positive start price", startPrice: 0, endsAt: now.Add(time.Hour), want: listing.ErrInvalidStartPrice},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reserver := &fakeItemReserver{}

			err := NewReserveItemUC(reserver).Handle(context.Background(), &ReserveItemCommand{
				SellerID:   uuid.New(),
				ItemID:     uuid.New(),
				StartPrice: tt.startPrice,
				Now:        now,
				EndsAt:     tt.endsAt,
			})

			assert.ErrorIs(t, err, tt.want)
			assert.Zero(t, reserver.calls, "items-service must not be called for terms the listing refuses")
		})
	}
}
