package query

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-04ZB6 Req 12: the confirmed-without-listing backstop must tell a listing id
// that exists nowhere from one whose listing exists in any status, ended ones
// included, so it releases only an item whose listing was never created. A
// page's listings are answered in one query.
func TestListingStatuses_AnswersEachListingsStatusWhateverItIs(t *testing.T) {
	db := listingsDB(t)

	want := map[uuid.UUID]listing.ListingStatus{}
	ids := []uuid.UUID{}
	for _, status := range []listing.ListingStatus{
		listing.StatusActive,
		listing.StatusPendingSettlement,
		listing.StatusSold,
		listing.StatusExpired,
		listing.StatusCancelled,
		listing.StatusSettlementFailed,
	} {
		listingID := uuid.New()
		insertListingWithStatus(t, db, listingID, uuid.New(), status)
		want[listingID] = status
		ids = append(ids, listingID)
	}

	got, err := NewListingStatusQuery(db).ListingStatuses(context.Background(), ids)

	require.NoError(t, err)
	assert.Equal(t, want, got)
}

// An id with no listing is simply absent from the answer, even beside ids that
// exist; a listing on the same item under another id is not this listing.
func TestListingStatuses_NoSuchListing_IsAbsent(t *testing.T) {
	db := listingsDB(t)
	itemID, existing := uuid.New(), uuid.New()
	insertListingWithStatus(t, db, existing, itemID, listing.StatusActive)
	insertListingWithStatus(t, db, uuid.New(), itemID, listing.StatusExpired)
	missing := uuid.New()

	got, err := NewListingStatusQuery(db).ListingStatuses(context.Background(), []uuid.UUID{missing, existing})

	require.NoError(t, err)
	assert.Equal(t, map[uuid.UUID]listing.ListingStatus{existing: listing.StatusActive}, got)
}

func TestListingStatuses_NoIDs_AnswersEmpty(t *testing.T) {
	db := listingsDB(t)

	got, err := NewListingStatusQuery(db).ListingStatuses(context.Background(), nil)

	require.NoError(t, err)
	assert.Empty(t, got)
}
