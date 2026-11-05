package query

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// insertUpdated writes a listing in status, last updated at updatedAt, and
// returns its id and its item's.
func insertUpdated(t *testing.T, db *sqlx.DB, status listing.ListingStatus, updatedAt time.Time) (uuid.UUID, uuid.UUID) {
	t.Helper()

	id, itemID := uuid.New(), uuid.New()
	_, err := db.Exec(`
		INSERT INTO listings (id, seller_id, item_id, start_price, status, ends_at, created_at, updated_at)
		VALUES ($1, $2, $3, 100, $4, $5, $6, $7)`,
		id, uuid.New(), itemID, string(status), updatedAt.Add(24*time.Hour), updatedAt.Add(-time.Hour), updatedAt)
	require.NoError(t, err)

	return id, itemID
}

// insertBidID writes a bid on the listing and returns its id.
func insertBidID(t *testing.T, db *sqlx.DB, listingID uuid.UUID, status listing.BidStatus) uuid.UUID {
	t.Helper()

	id := uuid.New()
	_, err := db.Exec(`
		INSERT INTO bids (id, listing_id, member_id, type, amount, status, created_at, updated_at)
		VALUES ($1, $2, $3, 'BID', 150, $4, now(), now())`,
		id, listingID, uuid.New(), string(status))
	require.NoError(t, err)

	return id
}

func cancelledIDs(listings []dto.CancelledListing) []uuid.UUID {
	out := make([]uuid.UUID, len(listings))
	for i, l := range listings {
		out[i] = l.ID
	}
	return out
}

// markStarted records that the listing's withdraw workflow started, at at.
func markStarted(t *testing.T, db *sqlx.DB, id uuid.UUID, at time.Time) {
	t.Helper()

	_, err := db.Exec(`UPDATE listings SET withdrawal_started_at = $2 WHERE id = $1`, id, at)
	require.NoError(t, err)
}

// FS-V7A5S Req 8 backstop (amended 2026-11-05): CANCELLED listings whose workflow
// is not marked started, oldest first, however long ago they were withdrawn. A
// marked one, and any other status, is left out.
func TestUnstartedCancelledListings_OnlyCancelledNotMarkedStarted(t *testing.T) {
	db := listingsDB(t)
	now := time.Now().Truncate(time.Microsecond)

	// a crash between the CANCELLED commit and the start, a month ago: no window
	// puts it out of reach
	monthOld, _ := insertUpdated(t, db, listing.StatusCancelled, now.Add(-30*24*time.Hour))
	dayOld, _ := insertUpdated(t, db, listing.StatusCancelled, now.Add(-25*time.Hour))
	recent, _ := insertUpdated(t, db, listing.StatusCancelled, now.Add(-time.Minute))
	started, _ := insertUpdated(t, db, listing.StatusCancelled, now.Add(-time.Hour))
	markStarted(t, db, started, now.Add(-time.Hour))
	for _, status := range []listing.ListingStatus{
		listing.StatusActive,
		listing.StatusPendingSettlement,
		listing.StatusSettlementFailed,
		listing.StatusSold,
		listing.StatusExpired,
	} {
		insertUpdated(t, db, status, now.Add(-time.Hour))
	}

	got, err := NewCancelledListingsQuery(db).UnstartedCancelledListings(context.Background(), nil, 10)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{monthOld, dayOld, recent}, cancelledIDs(got), "unmarked CANCELLED of any age, oldest first")
}

// The backstop's read is served by the partial index, so a table of historical
// withdrawals (all marked) costs nothing to skip.
func TestUnstartedCancelledListings_HasItsPartialIndex(t *testing.T) {
	db := listingsDB(t)

	var def string
	require.NoError(t, db.Get(&def, `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_listings_withdrawal_unstarted'`))
	assert.Contains(t, def, "(updated_at, id)")
	assert.Contains(t, def, "withdrawal_started_at IS NULL")
	assert.Contains(t, def, "'CANCELLED'")
}

// The start needs the item and every bid, statuses unfiltered; a listing with no
// bids carries an empty set.
func TestUnstartedCancelledListings_CarriesTheItemAndEveryBid(t *testing.T) {
	db := listingsDB(t)
	now := time.Now().Truncate(time.Microsecond)

	withBids, item := insertUpdated(t, db, listing.StatusCancelled, now.Add(-2*time.Minute))
	var bids []uuid.UUID
	for _, s := range []listing.BidStatus{listing.BidStatusLost, listing.BidStatusLost, listing.BidStatusCancelled, listing.BidStatusFailed} {
		bids = append(bids, insertBidID(t, db, withBids, s))
	}
	bare, bareItem := insertUpdated(t, db, listing.StatusCancelled, now.Add(-time.Minute))

	got, err := NewCancelledListingsQuery(db).UnstartedCancelledListings(context.Background(), nil, 10)

	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, withBids, got[0].ID)
	assert.Equal(t, item, got[0].ItemID)
	assert.ElementsMatch(t, bids, got[0].BidIDs)
	assert.Equal(t, bare, got[1].ID)
	assert.Equal(t, bareItem, got[1].ItemID)
	assert.Empty(t, got[1].BidIDs)
}

// Pages continue strictly after the cursor and visit each listing once, ties on
// updated_at broken by id, so the backstop's walk reaches all of them.
func TestUnstartedCancelledListings_PagesVisitEachListingOnce(t *testing.T) {
	db := listingsDB(t)
	now := time.Now().Truncate(time.Microsecond)
	same := now.Add(-time.Hour)

	var want []uuid.UUID
	for range 3 {
		id, _ := insertUpdated(t, db, listing.StatusCancelled, same)
		want = append(want, id)
	}
	later, _ := insertUpdated(t, db, listing.StatusCancelled, now.Add(-time.Minute))
	want = append(want, later)
	q := NewCancelledListingsQuery(db)

	var seen []uuid.UUID
	var after *dto.CancelledListing
	for {
		page, err := q.UnstartedCancelledListings(context.Background(), after, 2)
		require.NoError(t, err)
		seen = append(seen, cancelledIDs(page)...)
		if len(page) < 2 {
			break
		}
		after = &page[len(page)-1]
	}

	assert.ElementsMatch(t, want, seen)
	assert.Equal(t, uniq(seen), seen, "no listing repeated across a page boundary")
	assert.Equal(t, later, seen[len(seen)-1], "oldest first; the ties before the later one")
}
