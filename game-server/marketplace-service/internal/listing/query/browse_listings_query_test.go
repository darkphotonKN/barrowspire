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

// Browse is filtered on now() in postgres, so these rows are placed relative to
// the real clock with room to spare either side.

// insertBrowsable writes a listing ending at endsAt with the given status and
// start price, and returns its id.
func insertBrowsable(t *testing.T, db *sqlx.DB, status listing.ListingStatus, startPrice int, endsAt time.Time) uuid.UUID {
	t.Helper()

	id := uuid.New()
	created := time.Now().Add(-48 * time.Hour)
	_, err := db.Exec(`
		INSERT INTO listings (id, seller_id, item_id, start_price, status, ends_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
		id, uuid.New(), uuid.New(), startPrice, string(status), endsAt, created)
	require.NoError(t, err)

	return id
}

func insertBid(t *testing.T, db *sqlx.DB, listingID uuid.UUID, amount int, status listing.BidStatus) {
	t.Helper()

	_, err := db.Exec(`
		INSERT INTO bids (id, listing_id, member_id, type, amount, status, created_at, updated_at)
		VALUES ($1, $2, $3, 'BID', $4, $5, now(), now())`,
		uuid.New(), listingID, uuid.New(), amount, string(status))
	require.NoError(t, err)
}

func browseAll(t *testing.T, q *BrowseListingsQuery, limit int) []dto.ListingDetails {
	t.Helper()

	var (
		all []dto.ListingDetails
		c   *commoncursor.EndsAt
	)
	for pages := 0; pages < 100; pages++ {
		page, err := q.Execute(context.Background(), c, limit)
		require.NoError(t, err)
		all = append(all, page.Listings...)
		if page.NextCursor == "" {
			return all
		}
		c, err = commoncursor.DecodeEndsAt(page.NextCursor)
		require.NoError(t, err)
	}
	t.Fatal("paging never reached the last page")
	return nil
}

func ids(listings []dto.ListingDetails) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(listings))
	for _, l := range listings {
		out = append(out, l.ID)
	}
	return out
}

// Only live auctions are browsable: ACTIVE and not yet past their end. An
// auction past its end stays ACTIVE in storage (nothing settles it yet), so the
// time filter is what keeps it out.
func TestBrowseListingsReturnsOnlyLiveAuctionsSoonestEndingFirst(t *testing.T) {
	db := listingsDB(t)
	now := time.Now()

	later := insertBrowsable(t, db, listing.StatusActive, 100, now.Add(3*time.Hour))
	soonest := insertBrowsable(t, db, listing.StatusActive, 100, now.Add(time.Hour))
	middle := insertBrowsable(t, db, listing.StatusActive, 100, now.Add(2*time.Hour))

	insertBrowsable(t, db, listing.StatusActive, 100, now.Add(-time.Hour)) // ended, unsettled
	insertBrowsable(t, db, listing.StatusSold, 100, now.Add(4*time.Hour))
	insertBrowsable(t, db, listing.StatusCancelled, 100, now.Add(4*time.Hour))
	insertBrowsable(t, db, listing.StatusPendingSettlement, 100, now.Add(4*time.Hour))

	page, err := NewBrowseListingsQuery(db).Execute(context.Background(), nil, 10)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{soonest, middle, later}, ids(page.Listings))
	assert.Empty(t, page.NextCursor)
	for _, l := range page.Listings {
		assert.False(t, l.EndedAt(time.Now()), "browse never returns an ended listing")
	}
}

// Every browsable listing is visited exactly once across pages, including two
// that end in the same instant and straddle a page boundary.
func TestBrowseListingsPagingVisitsEveryListingOnce(t *testing.T) {
	db := listingsDB(t)
	now := time.Now().Truncate(time.Microsecond) // postgres keeps microseconds
	same := now.Add(2 * time.Hour)

	want := []uuid.UUID{
		insertBrowsable(t, db, listing.StatusActive, 100, now.Add(time.Hour)),
		insertBrowsable(t, db, listing.StatusActive, 100, same),
		insertBrowsable(t, db, listing.StatusActive, 100, same),
		insertBrowsable(t, db, listing.StatusActive, 100, same),
		insertBrowsable(t, db, listing.StatusActive, 100, now.Add(3*time.Hour)),
	}

	got := browseAll(t, NewBrowseListingsQuery(db), 2)

	assert.ElementsMatch(t, want, ids(got), "every listing exactly once")
	require.Len(t, got, len(want))
	for i := 1; i < len(got); i++ {
		prev, cur := got[i-1], got[i]
		inOrder := prev.EndsAt.Before(cur.EndsAt) ||
			(prev.EndsAt.Equal(cur.EndsAt) && prev.ID.String() < cur.ID.String())
		assert.True(t, inOrder, "row %d is out of (ends_at, id) order", i)
	}
}

func TestBrowseListingsBoundsTheLimit(t *testing.T) {
	db := listingsDB(t)
	for i := 0; i < 3; i++ {
		insertBrowsable(t, db, listing.StatusActive, 100, time.Now().Add(time.Duration(i+1)*time.Hour))
	}

	page, err := NewBrowseListingsQuery(db).Execute(context.Background(), nil, 0)

	require.NoError(t, err)
	assert.Len(t, page.Listings, 3, "an unset limit falls back to the default page size")
}

func TestBrowseListingsAnswersAnEmptyPageWhenNothingIsLive(t *testing.T) {
	db := listingsDB(t)

	page, err := NewBrowseListingsQuery(db).Execute(context.Background(), nil, 10)

	require.NoError(t, err)
	assert.Empty(t, page.Listings)
	assert.Empty(t, page.NextCursor)
}

// The price facts per bid history (FS-8EGFA §Requirements 5 and the issue's
// scenario table). Each case is its own listing on one page, so the join is
// also proven not to leak one listing's bids into another's.
func TestBrowseListingsCarriesThePriceFacts(t *testing.T) {
	db := listingsDB(t)
	now := time.Now()
	const start = 50

	type bid struct {
		amount int
		status listing.BidStatus
	}

	tests := []struct {
		name        string
		bids        []bid
		wantCurrent *int
		wantMinimum int
		wantCount   int
	}{
		{
			name:        "no bids",
			wantMinimum: start,
			wantCount:   0,
		},
		{
			name:        "one bid of N",
			bids:        []bid{{60, listing.BidStatusWinning}},
			wantCurrent: intPtr(60),
			wantMinimum: 61,
			wantCount:   1,
		},
		{
			name:        "a higher bid of M after that",
			bids:        []bid{{60, listing.BidStatusOutbid}, {75, listing.BidStatusWinning}},
			wantCurrent: intPtr(75),
			wantMinimum: 76,
			wantCount:   2,
		},
		{
			// no promotion: the outbid bid does not become the leader
			name:        "leader withdrawn, an OUTBID bid left",
			bids:        []bid{{60, listing.BidStatusOutbid}, {75, listing.BidStatusCancelled}},
			wantMinimum: start,
			wantCount:   1,
		},
		{
			// an unconfirmed bid still sets the bar, as findContendingBid has it
			name:        "a pending bid above the winner leads",
			bids:        []bid{{60, listing.BidStatusWinning}, {80, listing.BidStatusPending}},
			wantCurrent: intPtr(80),
			wantMinimum: 81,
			wantCount:   2,
		},
		{
			name:        "a failed bid is neither counted nor leading",
			bids:        []bid{{60, listing.BidStatusWinning}, {90, listing.BidStatusFailed}},
			wantCurrent: intPtr(60),
			wantMinimum: 61,
			wantCount:   1,
		},
	}

	listingFor := make(map[uuid.UUID]int, len(tests))
	for i, tt := range tests {
		id := insertBrowsable(t, db, listing.StatusActive, start, now.Add(time.Duration(i+1)*time.Hour))
		for _, b := range tt.bids {
			insertBid(t, db, id, b.amount, b.status)
		}
		listingFor[id] = i
	}

	page, err := NewBrowseListingsQuery(db).Execute(context.Background(), nil, 50)
	require.NoError(t, err)
	require.Len(t, page.Listings, len(tests))

	for _, l := range page.Listings {
		tt := tests[listingFor[l.ID]]
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.wantCount, l.BidCount, "bid count")
			if tt.wantCurrent == nil {
				assert.Nil(t, l.CurrentPrice, "no leading bid means no current price")
			} else {
				require.NotNil(t, l.CurrentPrice)
				assert.Equal(t, *tt.wantCurrent, *l.CurrentPrice, "current price")
			}
			assert.Equal(t, tt.wantMinimum, l.MinimumBid(), "minimum bid")
		})
	}
}

func intPtr(v int) *int { return &v }
