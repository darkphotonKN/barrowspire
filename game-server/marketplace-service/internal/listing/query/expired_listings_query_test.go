package query

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func expiredIDs(listings []usecase.ExpiredListing) []uuid.UUID {
	out := make([]uuid.UUID, len(listings))
	for i, l := range listings {
		out[i] = l.ID
	}
	return out
}

// FS-NXP1W §Req 2: the poller selects ACTIVE listings past expiry and never any
// other status, SETTLEMENT_FAILED included; a listing still running is left alone.
func TestExpiredActiveListings_OnlyActiveListingsPastTheirEnd(t *testing.T) {
	db := listingsDB(t)
	now := time.Now().Truncate(time.Microsecond)

	older := insertBrowsable(t, db, listing.StatusActive, 100, now.Add(-2*time.Hour))
	newer := insertBrowsable(t, db, listing.StatusActive, 100, now.Add(-time.Minute))
	atNow := insertBrowsable(t, db, listing.StatusActive, 100, now)
	insertBrowsable(t, db, listing.StatusActive, 100, now.Add(time.Hour)) // still running
	for _, status := range []listing.ListingStatus{
		listing.StatusPendingSettlement,
		listing.StatusSettlementFailed,
		listing.StatusSold,
		listing.StatusExpired,
		listing.StatusCancelled,
	} {
		insertBrowsable(t, db, status, 100, now.Add(-time.Hour))
	}

	got, err := NewExpiredListingsQuery(db).ExpiredActiveListings(context.Background(), now, nil, 10)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{older, newer, atNow}, expiredIDs(got), "ACTIVE and ended by now, soonest first")
}

// Pages continue strictly after the cursor and, together, visit each expired
// listing once, so the poller's walk reaches all of them.
func TestExpiredActiveListings_PagesVisitEachListingOnce(t *testing.T) {
	db := listingsDB(t)
	now := time.Now().Truncate(time.Microsecond)
	var want []uuid.UUID
	for i := range 5 {
		want = append(want, insertBrowsable(t, db, listing.StatusActive, 100, now.Add(-time.Duration(5-i)*time.Minute)))
	}
	q := NewExpiredListingsQuery(db)

	var seen []uuid.UUID
	var after *usecase.ExpiredListing
	for {
		page, err := q.ExpiredActiveListings(context.Background(), now, after, 2)
		require.NoError(t, err)
		seen = append(seen, expiredIDs(page)...)
		if len(page) < 2 {
			break
		}
		after = &page[len(page)-1]
	}

	assert.Equal(t, want, seen)
}

// Listings ending at the same instant still page cleanly: the cursor carries the
// id as a tiebreak, so none is skipped or repeated across the page boundary.
func TestExpiredActiveListings_SameEndTimeTiesBreakOnID(t *testing.T) {
	db := listingsDB(t)
	now := time.Now().Truncate(time.Microsecond)
	ended := now.Add(-time.Minute)
	for range 3 {
		insertBrowsable(t, db, listing.StatusActive, 100, ended)
	}
	q := NewExpiredListingsQuery(db)

	first, err := q.ExpiredActiveListings(context.Background(), now, nil, 2)
	require.NoError(t, err)
	require.Len(t, first, 2)
	rest, err := q.ExpiredActiveListings(context.Background(), now, &first[1], 2)
	require.NoError(t, err)

	all := append(expiredIDs(first), expiredIDs(rest)...)
	assert.Len(t, all, 3)
	assert.ElementsMatch(t, all, uniq(all), "no listing repeated")
}

func uniq(in []uuid.UUID) []uuid.UUID {
	set := map[uuid.UUID]bool{}
	var out []uuid.UUID
	for _, id := range in {
		if !set[id] {
			set[id] = true
			out = append(out, id)
		}
	}
	return out
}
