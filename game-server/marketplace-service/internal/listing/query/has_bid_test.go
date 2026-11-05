package query

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// insertBidWithID writes one bid with the given id and status, on a listing of
// its own so the single-winner index never refuses it.
func insertBidWithID(t *testing.T, db *sqlx.DB, bidID uuid.UUID, status listing.BidStatus) {
	t.Helper()

	listingID := uuid.New()
	insertListingWithStatus(t, db, listingID, uuid.New(), listing.StatusActive)
	_, err := db.Exec(`
		INSERT INTO bids (id, listing_id, member_id, type, amount, status, created_at, updated_at)
		VALUES ($1, $2, $3, 'BID', 100, $4, now(), now())`,
		bidID, listingID, uuid.New(), string(status))
	require.NoError(t, err)
}

// FS-9BJCP Req 15: one query over a page's bid ids answers exactly the ones a
// recorded bid still claims gold for: every status but CANCELLED and FAILED. An
// id with no bid at all is absent, as is a cancelled or failed one.
func TestBidsHoldingGold_AnswersExactlyTheBidsNotCancelledOrFailed(t *testing.T) {
	db := listingsDB(t)

	claimed := map[uuid.UUID]bool{}
	var ids []uuid.UUID
	for _, status := range []listing.BidStatus{
		listing.BidStatusPending,
		listing.BidStatusWinning,
		listing.BidStatusOutbid,
		listing.BidStatusWon,
		listing.BidStatusLost,
	} {
		id := uuid.New()
		insertBidWithID(t, db, id, status)
		claimed[id] = true
		ids = append(ids, id)
	}
	for _, status := range []listing.BidStatus{listing.BidStatusCancelled, listing.BidStatusFailed} {
		id := uuid.New()
		insertBidWithID(t, db, id, status)
		ids = append(ids, id)
	}
	ids = append(ids, uuid.New()) // never recorded
	// a claimed bid outside the page is not answered
	insertBidWithID(t, db, uuid.New(), listing.BidStatusWinning)

	got, err := NewHasBidQuery(db).BidsHoldingGold(context.Background(), ids)

	require.NoError(t, err)
	assert.Equal(t, claimed, got)
}

func TestBidsHoldingGold_NoIDs_AnswersEmpty(t *testing.T) {
	db := listingsDB(t)

	got, err := NewHasBidQuery(db).BidsHoldingGold(context.Background(), nil)

	require.NoError(t, err)
	assert.Empty(t, got)
}
