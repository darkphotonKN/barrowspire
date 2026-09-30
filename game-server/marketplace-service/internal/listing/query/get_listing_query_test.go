package query

import (
	"context"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetListingUnknownIDIsNotFound(t *testing.T) {
	db := listingsDB(t)

	_, err := NewGetListingQuery(db).Execute(context.Background(), uuid.New())

	assert.ErrorIs(t, err, commonconstants.ErrNotFound)
}

// Any status is readable (FS-8EGFA §Requirements 4), and an ACTIVE listing past
// its end is returned and reported ended, unlike browse.
func TestGetListingReadsAListingInAnyStatus(t *testing.T) {
	db := listingsDB(t)
	now := time.Now()

	tests := []struct {
		name      string
		status    listing.ListingStatus
		endsAt    time.Time
		wantEnded bool
	}{
		{"live", listing.StatusActive, now.Add(time.Hour), false},
		{"ended, unsettled", listing.StatusActive, now.Add(-time.Hour), true},
		{"sold", listing.StatusSold, now.Add(-time.Hour), false},
		{"cancelled", listing.StatusCancelled, now.Add(time.Hour), false},
		{"pending settlement", listing.StatusPendingSettlement, now.Add(-time.Hour), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id := insertBrowsable(t, db, tt.status, 50, tt.endsAt)

			got, err := NewGetListingQuery(db).Execute(context.Background(), id)

			require.NoError(t, err)
			assert.Equal(t, id, got.ID)
			assert.Equal(t, tt.status, got.Status)
			assert.Equal(t, tt.wantEnded, got.EndedAt(time.Now()), "ended")
		})
	}
}

// The same price facts as browse, from the same SQL piece (the slice 3 cases).
func TestGetListingCarriesThePriceFacts(t *testing.T) {
	db := listingsDB(t)
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
		{"no bids", nil, nil, start, 0},
		{"one bid of N", []bid{{60, listing.BidStatusWinning}}, intPtr(60), 61, 1},
		{"a higher bid of M after that", []bid{{60, listing.BidStatusOutbid}, {75, listing.BidStatusWinning}}, intPtr(75), 76, 2},
		{"leader withdrawn, an OUTBID bid left", []bid{{60, listing.BidStatusOutbid}, {75, listing.BidStatusCancelled}}, nil, start, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id := insertBrowsable(t, db, listing.StatusActive, start, time.Now().Add(time.Hour))
			for _, b := range tt.bids {
				insertBid(t, db, id, b.amount, b.status)
			}

			got, err := NewGetListingQuery(db).Execute(context.Background(), id)

			require.NoError(t, err)
			assert.Equal(t, tt.wantCount, got.BidCount, "bid count")
			if tt.wantCurrent == nil {
				assert.Nil(t, got.CurrentPrice, "no leading bid means no current price")
			} else {
				require.NotNil(t, got.CurrentPrice)
				assert.Equal(t, *tt.wantCurrent, *got.CurrentPrice, "current price")
			}
			assert.Equal(t, tt.wantMinimum, got.MinimumBid(), "minimum bid")
		})
	}
}
