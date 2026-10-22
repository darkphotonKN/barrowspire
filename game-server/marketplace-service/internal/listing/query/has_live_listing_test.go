package query

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-NXP1W §Req 6 (I-NXP1W-3): the reservation reconciler must not cancel the
// reservation of an item whose listing is settling. A listing is live while it is
// ACTIVE and while settlement runs (PENDING_SETTLEMENT); any status it ends in
// leaves the item's reservation to be reconciled.
func TestHasLiveListing_ActiveAndSettlingListingsKeepTheItemsReservation(t *testing.T) {
	db := listingsDB(t)

	tests := []struct {
		status listing.ListingStatus
		live   bool
	}{
		{listing.StatusActive, true},
		{listing.StatusPendingSettlement, true},
		{listing.StatusSold, false},
		{listing.StatusExpired, false},
		{listing.StatusCancelled, false},
		{listing.StatusSettlementFailed, false},
	}
	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			itemID := uuid.New()
			_, err := db.Exec(`
				INSERT INTO listings (id, seller_id, item_id, start_price, status, ends_at, created_at, updated_at)
				VALUES ($1, $2, $3, 100, $4, $5, NOW(), NOW())`,
				uuid.New(), uuid.New(), itemID, string(tt.status), time.Now().Add(-time.Minute))
			require.NoError(t, err)

			live, err := NewHasLiveListingQuery(db).HasLiveListing(context.Background(), itemID)

			require.NoError(t, err)
			assert.Equal(t, tt.live, live)
		})
	}

	live, err := NewHasLiveListingQuery(db).HasLiveListing(context.Background(), uuid.New())
	require.NoError(t, err)
	assert.False(t, live, "an item with no listing at all has nothing keeping its reservation")
}
