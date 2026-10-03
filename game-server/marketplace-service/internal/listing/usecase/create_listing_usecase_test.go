package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// insertCapturingRepo records the listing handed to Insert.
type insertCapturingRepo struct {
	listing.Repository
	inserted *listing.Listing
}

func (r *insertCapturingRepo) Insert(ctx context.Context, l *listing.Listing) error {
	r.inserted = l
	return nil
}

// The listing written is the one the reservation named (FS-NXP1W Req 24a).
func TestCreateListingUC_InsertsListingWithCommandID(t *testing.T) {
	repo := &insertCapturingRepo{}
	uc := NewCreateListingUC(repo)
	now := time.Now()
	cmd := &CreateListingCommand{
		ListingID:  uuid.New(),
		SellerID:   uuid.New(),
		ItemID:     uuid.New(),
		StartPrice: 100,
		Now:        now,
		EndsAt:     now.Add(time.Hour),
	}

	require.NoError(t, uc.Handle(context.Background(), cmd))

	require.NotNil(t, repo.inserted)
	assert.Equal(t, cmd.ListingID, repo.inserted.Snapshot().ID)
}
