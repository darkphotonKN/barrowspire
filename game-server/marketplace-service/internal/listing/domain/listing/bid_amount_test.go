package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// AcceptsBidAmount is the price half of PlaceBidWithID, asked on its own: the
// place-bid use case asks it before any gold is held, and PlaceBidWithID asks it
// again under the lock.
func TestAcceptsBidAmount(t *testing.T) {
	now := time.Now()
	buyout := 500

	withLeader := func(t *testing.T, amount int) *Listing {
		t.Helper()
		l, err := NewListing(uuid.New(), uuid.New(), uuid.New(), 100, &buyout, now, now.Add(time.Hour))
		require.NoError(t, err)
		bidID := uuid.New()
		require.NoError(t, l.PlaceBidWithID(bidID, uuid.New(), amount, uuid.Nil, now))
		require.NoError(t, l.ConfirmBid(bidID, now))
		return l
	}
	noBids := func(t *testing.T) *Listing {
		t.Helper()
		l, err := NewListing(uuid.New(), uuid.New(), uuid.New(), 100, &buyout, now, now.Add(time.Hour))
		require.NoError(t, err)
		return l
	}

	tests := []struct {
		name    string
		listing func(t *testing.T) *Listing
		amount  int
		wantErr error
	}{
		{"no bids, below the starting price", noBids, 99, ErrBidTooLow},
		{"no bids, at the starting price", noBids, 100, nil},
		{"a leader, equal to their bid", func(t *testing.T) *Listing { return withLeader(t, 150) }, 150, ErrBidTooLow},
		{"a leader, below their bid", func(t *testing.T) *Listing { return withLeader(t, 150) }, 120, ErrBidTooLow},
		{"a leader, one above their bid", func(t *testing.T) *Listing { return withLeader(t, 150) }, 151, nil},
		{"just under the buyout", noBids, 499, nil},
		{"at the buyout", noBids, 500, ErrBidAtOrAboveBuyout},
		{"above the buyout", noBids, 501, ErrBidAtOrAboveBuyout},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := tt.listing(t)
			before := len(l.Snapshot().Bids)

			err := l.AcceptsBidAmount(tt.amount)

			if tt.wantErr == nil {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, tt.wantErr)
			}
			assert.Len(t, l.Snapshot().Bids, before, "asking records nothing")
		})
	}
}

// Without a buyout price there is no upper bound.
func TestAcceptsBidAmount_NoBuyout_HasNoCeiling(t *testing.T) {
	now := time.Now()
	l, err := NewListing(uuid.New(), uuid.New(), uuid.New(), 100, nil, now, now.Add(time.Hour))
	require.NoError(t, err)

	assert.NoError(t, l.AcceptsBidAmount(1_000_000))
}
