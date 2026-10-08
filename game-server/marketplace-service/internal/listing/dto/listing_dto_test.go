package dto

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func intPtr(v int) *int { return &v }

func TestMinimumBid(t *testing.T) {
	tests := []struct {
		name         string
		startPrice   int
		currentPrice *int
		want         int
	}{
		{name: "no leading bid: the opening price", startPrice: 50, currentPrice: nil, want: 50},
		{name: "a leading bid: one more than it", startPrice: 50, currentPrice: intPtr(50), want: 51},
		{name: "a leading bid well above the start", startPrice: 10, currentPrice: intPtr(900), want: 901},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := ListingDetails{StartPrice: tt.startPrice, PriceFacts: PriceFacts{CurrentPrice: tt.currentPrice}}

			assert.Equal(t, tt.want, l.MinimumBid())
		})
	}
}

func TestEndedAt(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name   string
		status listing.ListingStatus
		endsAt time.Time
		want   bool
	}{
		{name: "active and still running", status: listing.StatusActive, endsAt: now.Add(time.Minute), want: false},
		{name: "active and past its end", status: listing.StatusActive, endsAt: now.Add(-time.Minute), want: true},
		{name: "active and ending this instant", status: listing.StatusActive, endsAt: now, want: true},
		// ended is a read-side fact about an unsettled auction; a settled or
		// withdrawn one already says what happened through its status
		{name: "sold is not 'ended'", status: listing.StatusSold, endsAt: now.Add(-time.Hour), want: false},
		{name: "settling is not 'ended'", status: listing.StatusPendingSettlement, endsAt: now.Add(-time.Hour), want: false},
		{name: "cancelled is not 'ended'", status: listing.StatusCancelled, endsAt: now.Add(-time.Hour), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := ListingDetails{Status: tt.status, EndsAt: tt.endsAt}

			assert.Equal(t, tt.want, l.EndedAt(now))
		})
	}
}

// The read side restates the aggregate's acceptance rule; this pins the two
// together. For each bid history the facts are derived from the aggregate's own
// bids the way the SQL derives them, and the domain must then accept MinimumBid
// and refuse one gold less. If PlaceBidWithID's threshold ever changes, this
// fails before the page starts pre-filling amounts the server rejects.
func TestMinimumBidMatchesWhatTheAggregateAccepts(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	const start = 50

	tests := []struct {
		name  string
		build func(t *testing.T, l *listing.Listing)
	}{
		{
			name:  "no bids",
			build: func(t *testing.T, l *listing.Listing) {},
		},
		{
			name: "one confirmed bid",
			build: func(t *testing.T, l *listing.Listing) {
				confirmedBid(t, l, uuid.New(), 50, now)
			},
		},
		{
			name: "outbid by a higher confirmed bid",
			build: func(t *testing.T, l *listing.Listing) {
				confirmedBid(t, l, uuid.New(), 50, now)
				confirmedBid(t, l, uuid.New(), 70, now)
			},
		},
		{
			name: "a pending bid still sets the bar",
			build: func(t *testing.T, l *listing.Listing) {
				confirmedBid(t, l, uuid.New(), 50, now)
				require.NoError(t, l.PlaceBidWithID(uuid.New(), uuid.New(), 80, uuid.Nil, now))
			},
		},
		{
			// FS-0YXG6's no-promotion rule: a withdrawn leader leaves no leader
			name: "the leader withdrew, an outbid bid remains",
			build: func(t *testing.T, l *listing.Listing) {
				confirmedBid(t, l, uuid.New(), 50, now)
				leader, bidder := uuid.New(), uuid.New()
				placeAndConfirm(t, l, leader, bidder, 70, now)
				require.NoError(t, l.WithdrawBid(leader, bidder, now))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			agg, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), start, nil, now, now.Add(time.Hour))
			require.NoError(t, err)
			tt.build(t, agg)

			read := ListingDetails{StartPrice: start, PriceFacts: factsFrom(agg.Snapshot().Bids)}
			minimum := read.MinimumBid()

			assert.ErrorIs(t, agg.PlaceBidWithID(uuid.New(), uuid.New(), minimum-1, uuid.Nil, now), listing.ErrBidTooLow,
				"one gold under the minimum must be refused")
			assert.NoError(t, agg.PlaceBidWithID(uuid.New(), uuid.New(), minimum, uuid.Nil, now),
				"the minimum itself must be accepted")
		})
	}
}

func confirmedBid(t *testing.T, l *listing.Listing, bidder uuid.UUID, amount int, now time.Time) {
	t.Helper()
	placeAndConfirm(t, l, uuid.New(), bidder, amount, now)
}

func placeAndConfirm(t *testing.T, l *listing.Listing, bidID, bidder uuid.UUID, amount int, now time.Time) {
	t.Helper()
	require.NoError(t, l.PlaceBidWithID(bidID, bidder, amount, uuid.Nil, now))
	require.NoError(t, l.ConfirmBid(bidID, now))
}

// factsFrom mirrors query.priceFactsJoin over in-memory bids.
func factsFrom(bids []listing.BidSnapshot) PriceFacts {
	var facts PriceFacts
	for _, b := range bids {
		switch b.Status {
		case listing.BidStatusWinning, listing.BidStatusPending:
			facts.BidCount++
			if facts.CurrentPrice == nil || b.Amount > *facts.CurrentPrice {
				amount := b.Amount
				facts.CurrentPrice = &amount
			}
		case listing.BidStatusOutbid:
			facts.BidCount++
		}
	}
	return facts
}
