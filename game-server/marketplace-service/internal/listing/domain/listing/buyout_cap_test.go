package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func listingWithBuyout(t *testing.T, startPrice, buyout int) *Listing {
	t.Helper()

	now := time.Now()
	l, err := NewListing(uuid.New(), uuid.New(), uuid.New(), startPrice, &buyout, now, now.Add(time.Hour))
	require.NoError(t, err)

	return l
}

// A bid at or above the buyout price is refused: paying that much is what
// Buyout is for (FS-9XKS6 Req 4).
func TestPlaceBidWithID_CappedBelowBuyoutPrice(t *testing.T) {
	tests := []struct {
		name    string
		amount  int
		wantErr error
	}{
		{"below buyout", 499, nil},
		{"at buyout", 500, ErrBidAtOrAboveBuyout},
		{"above buyout", 501, ErrBidAtOrAboveBuyout},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := listingWithBuyout(t, 100, 500)
			bidID := uuid.New()

			err := l.PlaceBidWithID(bidID, uuid.New(), tt.amount, uuid.New(), time.Now())

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.False(t, l.HasBid(bidID), "a refused bid must not be recorded")
				return
			}
			require.NoError(t, err)
			assert.True(t, l.HasBid(bidID))
		})
	}
}

// The too-low rules still apply under the cap.
func TestPlaceBidWithID_BuyoutCapKeepsTooLowRule(t *testing.T) {
	l := listingWithBuyout(t, 100, 500)

	err := l.PlaceBidWithID(uuid.New(), uuid.New(), 99, uuid.New(), time.Now())

	assert.ErrorIs(t, err, ErrBidTooLow)
}

// A listing without a buyout price has no cap.
func TestPlaceBidWithID_NoBuyoutPriceNoCap(t *testing.T) {
	l := activeListing(t, 100)

	err := l.PlaceBidWithID(uuid.New(), uuid.New(), 1_000_000, uuid.New(), time.Now())

	assert.NoError(t, err)
}
