package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func bidByID(t *testing.T, l *Listing, bidID uuid.UUID) BidSnapshot {
	t.Helper()

	for _, b := range l.Snapshot().Bids {
		if b.ID == bidID {
			return b
		}
	}
	t.Fatalf("bid %v not on listing", bidID)
	return BidSnapshot{}
}

// A buyout is born WINNING at the buyout price and takes the lead from the
// incumbent, which is demoted to OUTBID (FS-NXP1W Req 4).
func TestBuyout_OverIncumbentWinsAtTheBuyoutPrice(t *testing.T) {
	now := time.Now()
	l := listingWithBuyout(t, 100, 500)
	incumbent := leadingBid(t, l, uuid.New(), 200, now)
	buyer, bidID := uuid.New(), uuid.New()

	require.NoError(t, l.Buyout(bidID, buyer, now))

	got := bidByID(t, l, bidID)
	assert.Equal(t, BidTypeBuyout, got.Type)
	assert.Equal(t, BidStatusWinning, got.Status)
	assert.Equal(t, 500, got.Amount)
	assert.Equal(t, buyer, got.MemberID)
	assert.Equal(t, BidStatusOutbid, bidByID(t, l, incumbent).Status)
}

func TestBuyout_WithNoBidsWins(t *testing.T) {
	now := time.Now()
	l := listingWithBuyout(t, 100, 500)
	bidID := uuid.New()

	require.NoError(t, l.Buyout(bidID, uuid.New(), now))

	assert.Equal(t, BidStatusWinning, bidByID(t, l, bidID).Status)
}

func TestBuyout_Refusals(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name    string
		setup   func(t *testing.T) (*Listing, uuid.UUID)
		at      time.Time
		wantErr error
	}{
		{
			name: "seller buying their own listing",
			setup: func(t *testing.T) (*Listing, uuid.UUID) {
				l := listingWithBuyout(t, 100, 500)
				return l, l.Snapshot().SellerID
			},
			at:      now,
			wantErr: ErrSellerCannotBuyout,
		},
		{
			name: "listing without a buyout price",
			setup: func(t *testing.T) (*Listing, uuid.UUID) {
				return activeListing(t, 100), uuid.New()
			},
			at:      now,
			wantErr: ErrNoBuyoutPrice,
		},
		{
			name: "listing not ACTIVE",
			setup: func(t *testing.T) (*Listing, uuid.UUID) {
				l := listingWithBuyout(t, 100, 500)
				require.NoError(t, l.Freeze(now))
				return l, uuid.New()
			},
			at:      now,
			wantErr: ErrListingNotAcceptingBids,
		},
		{
			name: "listing past its end",
			setup: func(t *testing.T) (*Listing, uuid.UUID) {
				return listingWithBuyout(t, 100, 500), uuid.New()
			},
			at:      now.Add(2 * time.Hour),
			wantErr: ErrListingExpired,
		},
		{
			name: "already bought out by someone else",
			setup: func(t *testing.T) (*Listing, uuid.UUID) {
				l := listingWithBuyout(t, 100, 500)
				require.NoError(t, l.Buyout(uuid.New(), uuid.New(), now))
				return l, uuid.New()
			},
			at:      now,
			wantErr: ErrListingNotAcceptingBids,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l, member := tt.setup(t)
			before := len(l.Snapshot().Bids)
			bidID := uuid.New()

			err := l.Buyout(bidID, member, tt.at)

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Len(t, l.Snapshot().Bids, before, "a refused buyout records nothing")
		})
	}
}

// A replay of a buyout that already landed succeeds before any rule is checked:
// the listing may already be frozen by the settlement the first attempt started.
func TestBuyout_ReplayIsSuccessEvenAfterFreeze(t *testing.T) {
	now := time.Now()
	l := listingWithBuyout(t, 100, 500)
	buyer, bidID := uuid.New(), uuid.New()
	require.NoError(t, l.Buyout(bidID, buyer, now))
	require.NoError(t, l.Freeze(now))

	err := l.Buyout(bidID, buyer, now.Add(2*time.Hour))

	require.NoError(t, err)
	assert.Len(t, l.Snapshot().Bids, 1)
}

// Nothing may change the lead once a buyout has taken it.
func TestBuyout_ListingRejectsFurtherBidChanges(t *testing.T) {
	now := time.Now()
	l := listingWithBuyout(t, 100, 500)
	underbid := leadingBid(t, l, uuid.New(), 200, now)
	require.NoError(t, l.Buyout(uuid.New(), uuid.New(), now))

	assert.ErrorIs(t, l.PlaceBidWithID(uuid.New(), uuid.New(), 300, uuid.New(), now), ErrListingNotAcceptingBids, "place")
	assert.ErrorIs(t, l.WithdrawBid(underbid, bidByID(t, l, underbid).MemberID, now), ErrListingNotAcceptingBids, "withdraw")
}

// A bid whose hold was still in flight when the buyout landed confirms as a
// loser: its gold is held, so it is released with the other losers at
// settlement, and it never takes the lead from the buyout.
func TestBuyout_PendingBidConfirmingAfterwardsEndsOutbid(t *testing.T) {
	now := time.Now()
	l := listingWithBuyout(t, 100, 500)
	pending := uuid.New()
	require.NoError(t, l.PlaceBidWithID(pending, uuid.New(), 400, uuid.New(), now))
	buyout := uuid.New()
	require.NoError(t, l.Buyout(buyout, uuid.New(), now))

	require.NoError(t, l.ConfirmBid(pending, now))

	assert.Equal(t, BidStatusOutbid, bidByID(t, l, pending).Status)
	assert.Equal(t, BidStatusWinning, bidByID(t, l, buyout).Status)
}

// A hold that failed after the buyout still resolves: no gold is held for it.
func TestBuyout_PendingBidFailingAfterwardsEndsFailed(t *testing.T) {
	now := time.Now()
	l := listingWithBuyout(t, 100, 500)
	pending := uuid.New()
	require.NoError(t, l.PlaceBidWithID(pending, uuid.New(), 400, uuid.New(), now))
	require.NoError(t, l.Buyout(uuid.New(), uuid.New(), now))

	require.NoError(t, l.FailBid(pending, now))

	assert.Equal(t, BidStatusFailed, bidByID(t, l, pending).Status)
}

// The seller can no longer accept a bid once a buyout has started settlement.
func TestBuyout_SellerCannotAcceptABidAfterwards(t *testing.T) {
	now := time.Now()
	l := listingWithBuyout(t, 100, 500)
	require.NoError(t, l.Buyout(uuid.New(), uuid.New(), now))

	assert.ErrorIs(t, l.CanAcceptBid(l.Snapshot().SellerID, now), ErrListingNotAcceptingBids)
}

// After settlement has frozen the listing, a late confirmation is refused like on
// any frozen listing, buyout or not. It must not become an OUTBID that the
// losing-hold release, which may already have run, would never see.
func TestBuyout_PendingBidConfirmingAfterFreezeIsRefused(t *testing.T) {
	now := time.Now()
	l := listingWithBuyout(t, 100, 500)
	pending := uuid.New()
	require.NoError(t, l.PlaceBidWithID(pending, uuid.New(), 400, uuid.New(), now))
	require.NoError(t, l.Buyout(uuid.New(), uuid.New(), now))
	require.NoError(t, l.Freeze(now))

	err := l.ConfirmBid(pending, now)

	assert.ErrorIs(t, err, ErrListingNotAcceptingBids)
	assert.Equal(t, BidStatusPending, bidByID(t, l, pending).Status)
}
