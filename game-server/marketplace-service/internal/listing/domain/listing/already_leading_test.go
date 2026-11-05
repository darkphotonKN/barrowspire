package listing

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-72KT8 Req 1-2, ADR-0054: a member whose bid is the contending bid (the
// highest WINNING or PENDING) is leading and is refused; nothing is recorded.
func TestPlaceBidWithID_AlreadyLeading(t *testing.T) {
	member, other := uuid.New(), uuid.New()

	tests := []struct {
		name    string
		bids    []memberBid // at 110, 120, ... in order
		wantErr error
	}{
		{"own WINNING bid leads", []memberBid{{member, BidStatusWinning, false}}, ErrAlreadyLeading},
		{"own PENDING bid is the contender", []memberBid{{member, BidStatusPending, false}}, ErrAlreadyLeading},
		{"own WINNING bid over another's OUTBID", []memberBid{
			{other, BidStatusOutbid, false}, {member, BidStatusWinning, false},
		}, ErrAlreadyLeading},
		{"OUTBID while another member leads", []memberBid{
			{member, BidStatusOutbid, false}, {other, BidStatusWinning, false},
		}, nil},
		{"own WINNING outranked by another's PENDING", []memberBid{
			{member, BidStatusWinning, false}, {other, BidStatusPending, false},
		}, nil},
		{"another member leads", []memberBid{{other, BidStatusWinning, false}}, nil},
		{"no bids", nil, nil},
		{"own withdrawn bid only", []memberBid{outbidWithdrawal(member)}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			l := listingWithMemberBids(t, now, tt.bids...)
			before := len(l.Snapshot().Bids)
			bidID := uuid.New()
			advisory := l.NotLeading(member) // the read-only check agrees with the write

			err := l.PlaceBidWithID(bidID, member, 200, uuid.New(), now)

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.ErrorIs(t, advisory, tt.wantErr)
				assert.Len(t, l.Snapshot().Bids, before, "a refused bid is not appended")
				return
			}
			require.NoError(t, err)
			assert.NoError(t, advisory)
			assert.True(t, l.HasBid(bidID))
		})
	}
}

// FS-72KT8 Req 4: both replay checks come before the leading check, so a resend
// of the member's own leading bid is answered as that bid, not refused.
func TestPlaceBidWithID_AlreadyLeading_ReplayStillSucceeds(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	l := activeListing(t, 100)
	recordedID, key := uuid.New(), uuid.New()
	require.NoError(t, l.PlaceBidWithID(recordedID, member, 150, key, now))
	require.NoError(t, l.ConfirmBid(recordedID, now))
	require.ErrorIs(t, l.NotLeading(member), ErrAlreadyLeading)
	before := len(l.Snapshot().Bids)

	t.Run("same bid id", func(t *testing.T) {
		assert.NoError(t, l.PlaceBidWithID(recordedID, member, 150, key, now))
		assert.Len(t, l.Snapshot().Bids, before)
	})
	t.Run("same idempotency key under a new id", func(t *testing.T) {
		resend := uuid.New()
		assert.NoError(t, l.PlaceBidWithID(resend, member, 150, key, now))
		assert.False(t, l.HasBid(resend))
		assert.Len(t, l.Snapshot().Bids, before)
	})
}

// FS-72KT8 Req 4: CanPlaceBid and the withdrawal cap come before the leading
// check; the price rules come after it.
func TestPlaceBidWithID_AlreadyLeading_Order(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	buyout := 500

	// the leader's bid is the last one, at 110 + 10*(n-1)
	leading := func(bids ...memberBid) *Listing {
		l := listingWithMemberBids(t, now, append(bids, memberBid{member, BidStatusWinning, false})...)
		l.buyoutPrice = &buyout
		return l
	}

	t.Run("a capped leader hears about the cap", func(t *testing.T) {
		l := leading(withdrawn(member, 3)...)
		assert.ErrorIs(t, l.PlaceBidWithID(uuid.New(), member, 200, uuid.Nil, now), ErrBidWithdrawLimitReached)
	})
	for _, amount := range []int{50, 110, buyout, buyout + 1} {
		t.Run(fmt.Sprintf("a leader sending %d hears they lead, not the price rule", amount), func(t *testing.T) {
			l := leading()
			assert.ErrorIs(t, l.PlaceBidWithID(uuid.New(), member, amount, uuid.Nil, now), ErrAlreadyLeading)
		})
	}
	t.Run("the seller is refused as the seller", func(t *testing.T) {
		l := leading()
		assert.ErrorIs(t, l.PlaceBidWithID(uuid.New(), l.sellerID, 200, uuid.Nil, now), ErrSellerCannotBid)
	})
	t.Run("an ended listing refuses as ended", func(t *testing.T) {
		l := leading()
		assert.ErrorIs(t, l.PlaceBidWithID(uuid.New(), member, 200, uuid.Nil, l.endsAt), ErrListingExpired)
	})
}

// FS-72KT8 Req 9: ADR-0028's promotion is unchanged and its outcome counts. A
// leader who withdraws and gets their own earlier bid promoted leads again;
// one whose rival's bid is promoted does not.
func TestPlaceBidWithID_AlreadyLeading_AfterPromotion(t *testing.T) {
	now := time.Now()
	member, other := uuid.New(), uuid.New()

	tests := []struct {
		name     string
		runnerUp uuid.UUID // owner of the OUTBID bid ADR-0028 promotes
		wantErr  error
	}{
		{"own earlier bid promoted: refused", member, ErrAlreadyLeading},
		{"another member's bid promoted: placed", other, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// a legacy stack or a rival's withdrawn bid leaves this shape reachable
			l := listingWithMemberBids(t, now,
				memberBid{tt.runnerUp, BidStatusOutbid, false},
				memberBid{member, BidStatusWinning, false},
			)
			lead := l.Snapshot().Bids[1].ID
			require.NoError(t, l.WithdrawBid(lead, member, now), "before the final 30 minutes")
			bidID := uuid.New()

			err := l.PlaceBidWithID(bidID, member, 200, uuid.New(), now)

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.False(t, l.HasBid(bidID))
				return
			}
			require.NoError(t, err)
			assert.True(t, l.HasBid(bidID))
		})
	}
}

// FS-72KT8 Req 8: buyout is not limited; a leader may end the auction.
func TestBuyout_WhileLeading_Succeeds(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	l := listingWithMemberBids(t, now, memberBid{member, BidStatusWinning, false})
	buyout := 500
	l.buyoutPrice = &buyout
	require.ErrorIs(t, l.NotLeading(member), ErrAlreadyLeading)
	bidID := uuid.New()

	require.NoError(t, l.CanBuyout(member, buyout, now))
	require.NoError(t, l.Buyout(bidID, member, buyout, now))
	assert.True(t, l.HasBid(bidID))
}
