package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// memberBid is one bid already on a test listing: who placed it and where it
// ended up.
type memberBid struct {
	member uuid.UUID
	status BidStatus
}

// listingWithMemberBids builds an ACTIVE listing (start price 100, no buyout) holding
// these bids at 110, 120, ... in order, so none of them sets the price bar for a
// bid of 200 unless it is still contending.
func listingWithMemberBids(t *testing.T, now time.Time, bids ...memberBid) *Listing {
	t.Helper()
	listingID := uuid.New()
	params := make([]*BidReconstituteParams, len(bids))
	for i, b := range bids {
		params[i] = &BidReconstituteParams{
			ID: uuid.New(), ListingID: listingID, MemberID: b.member, Type: BidTypeBid,
			Amount: 110 + 10*i, Status: b.status, IdempotencyKey: uuid.New(),
			CreatedAt: now, UpdatedAt: now,
		}
	}
	l, err := Reconstitute(reconstituteParams(listingID, now, params))
	require.NoError(t, err)
	return l
}

func withdrawn(member uuid.UUID, n int) []memberBid {
	bids := make([]memberBid, n)
	for i := range bids {
		bids[i] = memberBid{member, BidStatusCancelled}
	}
	return bids
}

// FS-ZE43K Req 1-2, 9: a member with bidWithdrawalCap CANCELLED bids on the
// listing is refused; only that member's own withdrawals on this listing count.
func TestPlaceBidWithID_BidWithdrawalCap(t *testing.T) {
	member, other := uuid.New(), uuid.New()

	tests := []struct {
		name    string
		bids    []memberBid
		wantErr error
	}{
		{"three withdrawals are refused", withdrawn(member, 3), ErrBidWithdrawLimitReached},
		{"more than three are refused", withdrawn(member, 5), ErrBidWithdrawLimitReached},
		{"two withdrawals still bid", withdrawn(member, 2), nil},
		{"another member's withdrawals do not count", withdrawn(other, 3), nil},
		{"LOST bids do not count", []memberBid{
			{member, BidStatusCancelled}, {member, BidStatusCancelled}, {member, BidStatusLost},
		}, nil},
		{"FAILED bids do not count", []memberBid{
			{member, BidStatusCancelled}, {member, BidStatusCancelled}, {member, BidStatusFailed},
		}, nil},
		{"OUTBID bids do not count", []memberBid{
			{member, BidStatusCancelled}, {member, BidStatusCancelled}, {member, BidStatusOutbid},
		}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			l := listingWithMemberBids(t, now, tt.bids...)
			before := len(l.Snapshot().Bids)
			bidID := uuid.New()

			err := l.PlaceBidWithID(bidID, member, 200, uuid.New(), now)

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.Len(t, l.Snapshot().Bids, before, "a refused bid is not appended")
				assert.ErrorIs(t, l.WithinBidWithdrawalCap(member), tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.True(t, l.HasBid(bidID))
			assert.NoError(t, l.WithinBidWithdrawalCap(member))
		})
	}
}

// FS-ZE43K Req 2: the cap is per listing. Withdrawals on one listing say nothing
// about another.
func TestPlaceBidWithID_BidWithdrawalCap_OtherListingUnaffected(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	capped := listingWithMemberBids(t, now, withdrawn(member, 3)...)
	require.ErrorIs(t, capped.PlaceBidWithID(uuid.New(), member, 200, uuid.Nil, now), ErrBidWithdrawLimitReached)

	other := listingWithMemberBids(t, now)
	bidID := uuid.New()
	require.NoError(t, other.PlaceBidWithID(bidID, member, 200, uuid.Nil, now))
	assert.True(t, other.HasBid(bidID))
}

// FS-ZE43K Req 5: both replay checks come before the cap, so a resend of a bid
// recorded before the member reached it is still answered as a replay.
func TestPlaceBidWithID_BidWithdrawalCap_ReplayStillSucceeds(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	l := listingWithMemberBids(t, now, withdrawn(member, 2)...)
	recordedID, key := uuid.New(), uuid.New()
	require.NoError(t, l.PlaceBidWithID(recordedID, member, 200, key, now))
	require.NoError(t, l.ConfirmBid(recordedID, now))
	require.NoError(t, l.WithdrawBid(recordedID, member, now), "the third withdrawal")
	require.ErrorIs(t, l.WithinBidWithdrawalCap(member), ErrBidWithdrawLimitReached)
	before := len(l.Snapshot().Bids)

	t.Run("same bid id", func(t *testing.T) {
		assert.NoError(t, l.PlaceBidWithID(recordedID, member, 200, key, now))
		assert.Len(t, l.Snapshot().Bids, before)
	})
	t.Run("same idempotency key under a new id", func(t *testing.T) {
		resend := uuid.New()
		assert.NoError(t, l.PlaceBidWithID(resend, member, 200, key, now))
		assert.False(t, l.HasBid(resend))
		assert.Len(t, l.Snapshot().Bids, before)
	})
}

// FS-ZE43K Req 5: the cap is checked before the price rules, so a capped member
// hears about the cap whatever they bid.
func TestPlaceBidWithID_BidWithdrawalCap_BeforePriceRules(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	buyout := 500

	for _, amount := range []int{50, buyout} {
		l := listingWithMemberBids(t, now, withdrawn(member, 3)...)
		l.buyoutPrice = &buyout

		err := l.PlaceBidWithID(uuid.New(), member, amount, uuid.Nil, now)

		assert.ErrorIs(t, err, ErrBidWithdrawLimitReached, "amount %d", amount)
	}
}

// FS-ZE43K Req 3: withdrawing is never refused by the cap, so a member at it can
// still leave a live bid, taking the count past three.
func TestWithdrawBid_AtTheBidWithdrawalCap_Succeeds(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	bids := append(withdrawn(member, 3), memberBid{member, BidStatusOutbid}, memberBid{member, BidStatusWinning})
	l := listingWithMemberBids(t, now, bids...)
	snap := l.Snapshot()

	for _, b := range snap.Bids[3:] {
		require.NoError(t, l.WithdrawBid(b.ID, member, now))
	}

	cancelled := 0
	for _, b := range l.Snapshot().Bids {
		if b.Status == BidStatusCancelled {
			cancelled++
		}
	}
	assert.Equal(t, 5, cancelled)
}

// FS-ZE43K Req 4: buyout is not limited.
func TestBuyout_AtTheBidWithdrawalCap_Succeeds(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	l := listingWithMemberBids(t, now, withdrawn(member, 3)...)
	buyout := 500
	l.buyoutPrice = &buyout
	bidID := uuid.New()

	require.NoError(t, l.CanBuyout(member, buyout, now))
	require.NoError(t, l.Buyout(bidID, member, buyout, now))
	assert.True(t, l.HasBid(bidID))
}
