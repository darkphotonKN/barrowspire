package query

import (
	"context"
	"testing"
	"time"

	commoncursor "github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// insertMemberBid writes a bid by the member on the listing, placed at the
// given time, and returns its id.
func insertMemberBid(t *testing.T, db *sqlx.DB, listingID, memberID uuid.UUID, amount int, status listing.BidStatus, placedAt time.Time) uuid.UUID {
	t.Helper()

	id := uuid.New()
	_, err := db.Exec(`
		INSERT INTO bids (id, listing_id, member_id, type, amount, status, created_at, updated_at)
		VALUES ($1, $2, $3, 'BID', $4, $5, $6, $6)`,
		id, listingID, memberID, amount, string(status), placedAt)
	require.NoError(t, err)

	return id
}

func bidIDs(bids []dto.MyBid) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(bids))
	for _, b := range bids {
		out = append(out, b.ID)
	}
	return out
}

// FS-EYQ8K §Requirements 3, 4: live and resolved bids, newest placed first;
// FAILED (no gold was ever held) and CANCELLED (withdrawn) never.
func TestListMyBidsReturnsOnlyListedStatusesNewestFirst(t *testing.T) {
	db := listingsDB(t)
	member := uuid.New()
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	// one listing per bid: a listing holds at most one WINNING bid
	bidAt := func(status listing.BidStatus, offset time.Duration) uuid.UUID {
		l := insertListing(t, db, uuid.New(), base)
		return insertMemberBid(t, db, l, member, 100, status, base.Add(offset))
	}

	pending := bidAt(listing.BidStatusPending, 1*time.Minute)
	winning := bidAt(listing.BidStatusWinning, 2*time.Minute)
	outbid := bidAt(listing.BidStatusOutbid, 3*time.Minute)
	won := bidAt(listing.BidStatusWon, 4*time.Minute)
	lost := bidAt(listing.BidStatusLost, 5*time.Minute)
	bidAt(listing.BidStatusFailed, 6*time.Minute)
	bidAt(listing.BidStatusCancelled, 7*time.Minute)

	page, err := NewListMyBidsQuery(db).Execute(context.Background(), member, nil, 10)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{lost, won, outbid, winning, pending}, bidIDs(page.Bids))
	assert.Empty(t, page.NextCursor, "everything fit, so there is no next page")
}

// FS-EYQ8K User Story 20: another member's bids never leak into the page, even
// on a listing the caller also bid on.
func TestListMyBidsReturnsOnlyTheCallersBids(t *testing.T) {
	db := listingsDB(t)
	member, other := uuid.New(), uuid.New()
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	l := insertListing(t, db, uuid.New(), base)
	mine := insertMemberBid(t, db, l, member, 100, listing.BidStatusOutbid, base.Add(time.Minute))
	insertMemberBid(t, db, l, other, 150, listing.BidStatusWinning, base.Add(2*time.Minute))

	page, err := NewListMyBidsQuery(db).Execute(context.Background(), member, nil, 10)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{mine}, bidIDs(page.Bids))
}

// FS-EYQ8K §Requirements 5: a member who raised their own bid sees each bid as
// its own row, not one row per listing.
func TestListMyBidsListsTwoBidsOnOneListingAsTwoRows(t *testing.T) {
	db := listingsDB(t)
	member := uuid.New()
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	l := insertListing(t, db, uuid.New(), base)
	first := insertMemberBid(t, db, l, member, 100, listing.BidStatusOutbid, base.Add(time.Minute))
	raised := insertMemberBid(t, db, l, member, 150, listing.BidStatusWinning, base.Add(2*time.Minute))

	page, err := NewListMyBidsQuery(db).Execute(context.Background(), member, nil, 10)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{raised, first}, bidIDs(page.Bids))
}

func TestListMyBidsSecondPageFollowsTheCursor(t *testing.T) {
	db := listingsDB(t)
	member := uuid.New()
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	l := insertListing(t, db, uuid.New(), base)
	oldest := insertMemberBid(t, db, l, member, 100, listing.BidStatusOutbid, base.Add(time.Minute))
	middle := insertMemberBid(t, db, l, member, 110, listing.BidStatusOutbid, base.Add(2*time.Minute))
	newest := insertMemberBid(t, db, l, member, 120, listing.BidStatusWinning, base.Add(3*time.Minute))

	q := NewListMyBidsQuery(db)

	page1, err := q.Execute(context.Background(), member, nil, 2)
	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{newest, middle}, bidIDs(page1.Bids))
	require.NotEmpty(t, page1.NextCursor)

	c, err := commoncursor.Decode(page1.NextCursor)
	require.NoError(t, err)

	page2, err := q.Execute(context.Background(), member, c, 2)
	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{oldest}, bidIDs(page2.Bids))
	assert.Empty(t, page2.NextCursor)
}

// Bids placed in the same instant are split by id, so a page boundary between
// them neither repeats nor skips one.
func TestListMyBidsBreaksPlacedAtTiesByID(t *testing.T) {
	db := listingsDB(t)
	member := uuid.New()
	same := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	l := insertListing(t, db, uuid.New(), same)
	a := insertMemberBid(t, db, l, member, 100, listing.BidStatusOutbid, same)
	b := insertMemberBid(t, db, l, member, 110, listing.BidStatusOutbid, same)
	c := insertMemberBid(t, db, l, member, 120, listing.BidStatusOutbid, same)

	q := NewListMyBidsQuery(db)
	var (
		got    []uuid.UUID
		cursor *commoncursor.Cursor
	)
	for pages := 0; pages < 10; pages++ {
		page, err := q.Execute(context.Background(), member, cursor, 1)
		require.NoError(t, err)
		got = append(got, bidIDs(page.Bids)...)
		if page.NextCursor == "" {
			break
		}
		cursor, err = commoncursor.Decode(page.NextCursor)
		require.NoError(t, err)
	}

	assert.Len(t, got, 3, "every bid exactly once")
	assert.ElementsMatch(t, []uuid.UUID{a, b, c}, got)
}

func TestListMyBidsAnswersAnEmptyPageForAMemberWithNone(t *testing.T) {
	db := listingsDB(t)

	page, err := NewListMyBidsQuery(db).Execute(context.Background(), uuid.New(), nil, 10)

	require.NoError(t, err)
	assert.Empty(t, page.Bids)
	assert.Empty(t, page.NextCursor)
}

func TestListMyBidsBoundsTheLimit(t *testing.T) {
	db := listingsDB(t)
	member := uuid.New()
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	l := insertListing(t, db, uuid.New(), base)
	for i := 0; i < 3; i++ {
		insertMemberBid(t, db, l, member, 100+i, listing.BidStatusOutbid, base.Add(time.Duration(i)*time.Minute))
	}

	page, err := NewListMyBidsQuery(db).Execute(context.Background(), member, nil, 0)

	require.NoError(t, err)
	assert.Len(t, page.Bids, 3, "an unset limit falls back to the default page size")
}

// FS-EYQ8K §Requirements 6: each row carries the bid and a summary of its
// listing as it stands now. The current price is the listing's, so another
// delver's leading bid shows through; it is absent when nobody leads.
func TestListMyBidsCarriesTheBidAndItsListingSummary(t *testing.T) {
	db := listingsDB(t)
	member, rival := uuid.New(), uuid.New()
	now := time.Now()
	buyout := 500

	insert := func(item uuid.UUID, buyoutPrice *int, endsAt time.Time) uuid.UUID {
		t.Helper()
		id := uuid.New()
		_, err := db.Exec(`
			INSERT INTO listings (id, seller_id, item_id, start_price, buyout_price, status, ends_at, created_at, updated_at)
			VALUES ($1, $2, $3, 50, $4, 'ACTIVE', $5, $6, $6)`,
			id, uuid.New(), item, buyoutPrice, endsAt, now.Add(-2*time.Hour))
		require.NoError(t, err)
		return id
	}

	// outbid by a rival who now leads, with a buyout price
	contestedItem := uuid.New()
	contestedEnds := now.Add(time.Hour).Truncate(time.Microsecond)
	contested := insert(contestedItem, &buyout, contestedEnds)
	placed := now.Add(-time.Minute).Truncate(time.Microsecond)
	outbidID := insertMemberBid(t, db, contested, member, 60, listing.BidStatusOutbid, placed)
	insertMemberBid(t, db, contested, rival, 80, listing.BidStatusWinning, now.Add(-30*time.Second))

	// past its end, still ACTIVE, nobody leads (the leader withdrew), no buyout
	endedListing := insert(uuid.New(), nil, now.Add(-time.Hour))
	insertMemberBid(t, db, endedListing, member, 55, listing.BidStatusOutbid, now.Add(-90*time.Minute))
	insertMemberBid(t, db, endedListing, rival, 70, listing.BidStatusCancelled, now.Add(-80*time.Minute))

	page, err := NewListMyBidsQuery(db).Execute(context.Background(), member, nil, 10)
	require.NoError(t, err)
	require.Len(t, page.Bids, 2)

	got := page.Bids[0]
	assert.Equal(t, outbidID, got.ID)
	assert.Equal(t, contested, got.ListingID)
	assert.Equal(t, 60, got.Amount)
	assert.Equal(t, listing.BidStatusOutbid, got.Status)
	assert.True(t, placed.Equal(got.PlacedAt), "placed at: want %s, got %s", placed, got.PlacedAt)
	assert.Equal(t, listing.StatusActive, got.Listing.Status)
	assert.True(t, contestedEnds.Equal(got.Listing.EndsAt), "ends at")
	assert.Equal(t, contestedItem, got.Listing.ItemID, "the listing's item instance")
	require.NotNil(t, got.Listing.CurrentPrice, "the rival leads")
	assert.Equal(t, 80, *got.Listing.CurrentPrice, "current price is the listing's, not the caller's bid")
	require.NotNil(t, got.Listing.BuyoutPrice)
	assert.Equal(t, 500, *got.Listing.BuyoutPrice)
	assert.False(t, got.Listing.EndedAt(time.Now()))

	past := page.Bids[1]
	assert.Nil(t, past.Listing.CurrentPrice, "nobody leads")
	assert.Nil(t, past.Listing.BuyoutPrice, "no buyout was set")
	assert.True(t, past.Listing.EndedAt(time.Now()), "an ACTIVE listing past its end is reported ended")
}
