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

// Every listing read carries the buyout price when the seller set one and
// leaves it nil when not (FS-9XKS6 Req 9).
func TestListingReads_CarryTheBuyoutPrice(t *testing.T) {
	db := listingsDB(t)
	seller := uuid.New()
	endsAt := time.Now().Add(time.Hour)

	withBuyout := insertBrowsable(t, db, listing.StatusActive, 50, endsAt)
	_, err := db.Exec(`UPDATE listings SET buyout_price = 500, seller_id = $2 WHERE id = $1`, withBuyout, seller)
	require.NoError(t, err)
	without := insertBrowsable(t, db, listing.StatusActive, 50, endsAt)
	_, err = db.Exec(`UPDATE listings SET seller_id = $2 WHERE id = $1`, without, seller)
	require.NoError(t, err)

	want := map[uuid.UUID]*int{withBuyout: func() *int { v := 500; return &v }(), without: nil}

	got, err := NewGetListingQuery(db).Execute(context.Background(), withBuyout)
	require.NoError(t, err)
	assert.Equal(t, want[withBuyout], got.BuyoutPrice, "get")

	got, err = NewGetListingQuery(db).Execute(context.Background(), without)
	require.NoError(t, err)
	assert.Nil(t, got.BuyoutPrice, "get, none")

	browsed, err := NewBrowseListingsQuery(db).Execute(context.Background(), nil, 10)
	require.NoError(t, err)
	require.Len(t, browsed.Listings, 2)
	for _, l := range browsed.Listings {
		assert.Equal(t, want[l.ID], l.BuyoutPrice, "browse %s", l.ID)
	}

	mine, err := NewListMyListingsQuery(db).Execute(context.Background(), seller, nil, 10)
	require.NoError(t, err)
	require.Len(t, mine.Listings, 2)
	for _, l := range mine.Listings {
		assert.Equal(t, want[l.ID], l.BuyoutPrice, "mine %s", l.ID)
	}
}

// The schema backstops the domain: a buyout at or under the start price is
// refused by the CHECK even if a write bypasses NewListing.
func TestListingsTable_RefusesBuyoutAtOrBelowStartPrice(t *testing.T) {
	db := listingsDB(t)
	id := insertBrowsable(t, db, listing.StatusActive, 50, time.Now().Add(time.Hour))

	_, err := db.Exec(`UPDATE listings SET buyout_price = 50 WHERE id = $1`, id)

	assert.Error(t, err)
}
