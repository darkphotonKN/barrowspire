package repository

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// placeBidDiff places one bid on a fresh ACTIVE listing and returns the row
// diffListing would INSERT for it — exactly what Save and Modify write.
func placeBidDiff(t *testing.T, idempotencyKey uuid.UUID) *BidRow {
	t.Helper()

	now := time.Now()
	l, err := listing.Reconstitute(listing.ReconstituteParams{
		ID:         uuid.New(),
		SellerID:   uuid.New(),
		ItemID:     uuid.New(),
		StartPrice: 100,
		Status:     listing.StatusListed,
		EndsAt:     now.Add(time.Hour),
		CreatedAt:  now,
		UpdatedAt:  now,
	})
	require.NoError(t, err)

	before := l.Snapshot()
	require.NoError(t, l.PlaceBid(uuid.New(), 150, idempotencyKey, now))
	after := l.Snapshot()

	changes := (&ListingRepository{}).diffListing(&before, &after)
	require.NotNil(t, changes)
	require.Len(t, changes.newBids, 1)

	return changes.newBids[0]
}

// The key only protects a replay if it is still there when the next request
// reloads the listing. Dropping it here left every stored key NULL, so the
// domain's replay check could never match anything across requests.
func TestDiffListingPersistsTheIdempotencyKey(t *testing.T) {
	key := uuid.New()

	row := placeBidDiff(t, key)

	require.NotNil(t, row.IdempotencyKey, "a supplied key must reach the INSERT")
	assert.Equal(t, key, *row.IdempotencyKey)
}

// uuid.Nil is how the domain spells "no key". It must be stored as NULL: stored
// as the zero UUID instead, every keyless bid would share one value and the
// second would collide on idx_bids_idempotency_key.
func TestDiffListingStoresNoKeyAsNull(t *testing.T) {
	row := placeBidDiff(t, uuid.Nil)

	assert.Nil(t, row.IdempotencyKey)
}
