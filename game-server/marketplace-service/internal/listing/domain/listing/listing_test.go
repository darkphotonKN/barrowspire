package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPlaceBidAmountInvariant pins that a non-positive bid never creates a bid.
// Which sentinel comes back depends on the reserve: against a normal listing
// the threshold check rejects it first, so the amount guard in newBid is only
// reachable once the price bar is out of the way. Either way the listing must
// be left untouched.
func TestPlaceBidAmountInvariant(t *testing.T) {
	tests := []struct {
		name       string
		startPrice int
		amount     int
		wantErr    error
	}{
		{name: "negative amount is below the reserve", startPrice: 100, amount: -1, wantErr: ErrBidTooLow},
		{name: "zero amount is below the reserve", startPrice: 100, amount: 0, wantErr: ErrBidTooLow},
		// a reserve of 1 is the lowest a listing can have (NewListing rejects 0),
		// so this is the only way a non-positive bid clears the price bar and
		// reaches newBid's own guard
		{name: "negative amount clearing the reserve still fails on newBid", startPrice: 1, amount: -1, wantErr: ErrBidTooLow},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := activeListing(t, tt.startPrice)

			err := l.PlaceBid(uuid.New(), tt.amount, uuid.Nil, time.Now())

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Empty(t, l.Snapshot().Bids, "a rejected bid must not be appended")
		})
	}
}

// TestNewBidRejectsNonPositiveAmount reaches the entity's own birth invariant
// directly. PlaceBid's threshold check shadows it in practice, but the guard
// has to hold on its own — it is the last line of defence if a future verb
// creates a bid on a different path.
func TestNewBidRejectsNonPositiveAmount(t *testing.T) {
	for _, amount := range []int{-1, 0} {
		bid, err := newBid(uuid.New(), uuid.New(), uuid.New(), BidTypeBid, amount, uuid.Nil, time.Now())

		assert.ErrorIs(t, err, ErrInvalidAmount)
		assert.Nil(t, bid)
	}
}

// NOTE: a bid is now born PENDING rather than WINNING — it leads nothing until
// wallet confirms its hold. That starting state is pinned by
// TestNewBidIsBornPending in bid_saga_test.go.

// TestBidBelowCurrentPriceIsNotCreated is the headline requirement: a bid that
// does not beat the current price must not exist at all. Returning an error
// while still appending the bid would leave a phantom row that never won
// anything, so the assertion on the bid count matters as much as the error.
func TestBidBelowCurrentPriceIsNotCreated(t *testing.T) {
	l := activeListing(t, 100)
	leadingBid(t, l, uuid.New(), 150, time.Now())

	tests := []struct {
		name   string
		amount int
	}{
		{name: "equal to the current price is not enough", amount: 150},
		{name: "below the current price is rejected", amount: 80},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := l.PlaceBid(uuid.New(), tt.amount, uuid.Nil, time.Now())

			assert.ErrorIs(t, err, ErrBidTooLow)
			assert.Len(t, l.Snapshot().Bids, 1, "a rejected bid must not be created")
			assert.Equal(t, 150, l.currentPrice(), "a rejected bid must not move the price")
		})
	}
}

// TestFirstBidMustMeetStartPrice covers the other half of the threshold: with
// no leader yet the bar is the reserve, and matching it exactly is allowed.
// Together with the test above this pins the boundary from both sides.
func TestFirstBidMustMeetStartPrice(t *testing.T) {
	t.Run("below the start price is rejected", func(t *testing.T) {
		l := activeListing(t, 100)

		err := l.PlaceBid(uuid.New(), 99, uuid.Nil, time.Now())

		assert.ErrorIs(t, err, ErrBidTooLow)
		assert.Empty(t, l.Snapshot().Bids)
	})

	t.Run("exactly the start price is accepted", func(t *testing.T) {
		l := activeListing(t, 100)

		require.NoError(t, l.PlaceBid(uuid.New(), 100, uuid.Nil, time.Now()))
		assert.Len(t, l.Snapshot().Bids, 1)
	})
}

// TestSingleWinnerInvariant is the core rule of this aggregate: at most one bid
// per listing is WINNING. Promotion and demotion happen in the same verb, so
// the invariant can never be observed broken. It also pins that losers are
// demoted rather than deleted — the bid rows are the audit trail of the
// auction.
func TestSingleWinnerInvariant(t *testing.T) {
	l := activeListing(t, 100)
	now := time.Now()

	leadingBid(t, l, uuid.New(), 100, now)
	leadingBid(t, l, uuid.New(), 150, now)
	leadingBid(t, l, uuid.New(), 200, now)

	bids := l.Snapshot().Bids
	require.Len(t, bids, 3, "outbid bids are kept as history, not removed")

	var winners int
	for _, bid := range bids {
		if bid.Status == BidStatusWinning {
			winners++
			assert.Equal(t, 200, bid.Amount, "the highest bid must be the one leading")
		}
	}

	assert.Equal(t, 1, winners, "exactly one bid may lead at a time")
	assert.Equal(t, BidStatusOutbid, bids[0].Status)
	assert.Equal(t, BidStatusOutbid, bids[1].Status)
}

// TestPlaceBidOnNonActiveListing pins that bidding closes for good once the
// listing leaves ACTIVE: a withdrawn or sold one never reopens.
func TestPlaceBidOnNonActiveListing(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name  string
		setup func(t *testing.T) *Listing
	}{
		{
			name: "withdrawn listing is closed",
			setup: func(t *testing.T) *Listing {
				l := activeListing(t, 100)
				require.NoError(t, l.Cancel(now))
				return l
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := tt.setup(t)

			err := l.PlaceBid(uuid.New(), 500, uuid.Nil, now)

			assert.ErrorIs(t, err, ErrListingNotAcceptingBids)
			assert.Empty(t, l.Snapshot().Bids)
		})
	}
}

// TestPlaceBidAfterEndsAt pins the deadline. Bidding closes at endsAt, so a bid
// landing exactly on the boundary is already too late.
func TestPlaceBidAfterEndsAt(t *testing.T) {
	l := activeListing(t, 100)
	endsAt := l.Snapshot().EndsAt

	err := l.PlaceBid(uuid.New(), 500, uuid.Nil, endsAt)

	assert.ErrorIs(t, err, ErrListingExpired)
	assert.Empty(t, l.Snapshot().Bids)
}

// TestWithdrawBidOwnershipGuard pins that a bid belongs to its bidder. Without
// this check any member could cancel a rival's bid and take the lead for free.
func TestWithdrawBidOwnershipGuard(t *testing.T) {
	l := activeListing(t, 100)
	bidder := uuid.New()
	now := time.Now()

	bidID := leadingBid(t, l, bidder, 150, now)

	err := l.WithdrawBid(bidID, uuid.New(), now)

	assert.ErrorIs(t, err, ErrNotBidOwner)
	assert.Equal(t, BidStatusWinning, l.Snapshot().Bids[0].Status, "a rejected withdrawal must not change the bid")
}

// TestWithdrawBidNotFound pins that a listing only owns its own bids.
func TestWithdrawBidNotFound(t *testing.T) {
	l := activeListing(t, 100)

	err := l.WithdrawBid(uuid.New(), uuid.New(), time.Now())

	assert.ErrorIs(t, err, ErrBidNotFound)
}

// TestBidFSMRejectsIllegalTransition pins that terminal states are terminal. A
// bid that already lost cannot be withdrawn, otherwise a member could cancel
// their way backwards through the auction's history.
func TestBidFSMRejectsIllegalTransition(t *testing.T) {
	l := activeListing(t, 100)
	bidder := uuid.New()
	now := time.Now()

	leadingBid(t, l, bidder, 150, now)
	leadingBid(t, l, uuid.New(), 200, now)

	// the first bid is now OUTBID — a terminal state
	outbidID := l.Snapshot().Bids[0].ID

	err := l.WithdrawBid(outbidID, bidder, now)

	assert.ErrorIs(t, err, ErrInvalidBidTransition)
}

// heldBid is one bid in a test auction: its status, amount, and when it was placed.
type heldBid struct {
	status BidStatus
	amount int
	placed time.Duration // after the auction's base time
}

// auctionWith builds an ACTIVE listing (start price 100) holding exactly these
// bids, and returns each bid's ID and member in the same order.
func auctionWith(t *testing.T, now time.Time, bids ...heldBid) (*Listing, []uuid.UUID, []uuid.UUID) {
	t.Helper()
	listingID := uuid.New()
	ids, members := make([]uuid.UUID, len(bids)), make([]uuid.UUID, len(bids))
	params := make([]*BidReconstituteParams, len(bids))
	for i, b := range bids {
		ids[i], members[i] = uuid.New(), uuid.New()
		at := now.Add(b.placed)
		params[i] = &BidReconstituteParams{
			ID: ids[i], ListingID: listingID, MemberID: members[i],
			Type: BidTypeBid, Amount: b.amount, Status: b.status, CreatedAt: at, UpdatedAt: at,
		}
	}
	l, err := Reconstitute(reconstituteParams(listingID, now, params))
	require.NoError(t, err)
	return l, ids, members
}

// ADR-0028: withdrawing the leader promotes the highest remaining OUTBID bid. Its
// hold has been RESERVED since it was placed (an outbid hold is released only at
// settlement step 2), so the new leader is backed by gold.
func TestWithdrawBid_LeaderWithdraws_HighestOutbidIsPromoted(t *testing.T) {
	now := time.Now()
	l, ids, members := auctionWith(t, now,
		heldBid{BidStatusOutbid, 150, 0},
		heldBid{BidStatusOutbid, 180, time.Second},
		heldBid{BidStatusWinning, 200, 2 * time.Second},
	)

	require.NoError(t, l.WithdrawBid(ids[2], members[2], now.Add(time.Minute)))

	assert.Equal(t, BidStatusWinning, bidByID(t, l, ids[1]).Status, "the highest OUTBID leads")
	assert.Equal(t, BidStatusOutbid, bidByID(t, l, ids[0]).Status)
	assert.Equal(t, BidStatusCancelled, bidByID(t, l, ids[2]).Status)
	assert.Equal(t, 180, l.currentPrice())
}

// Equal amounts: the bid placed first is promoted.
func TestWithdrawBid_LeaderWithdraws_TieGoesToTheEarliest(t *testing.T) {
	now := time.Now()
	l, ids, members := auctionWith(t, now,
		heldBid{BidStatusOutbid, 150, time.Second}, // placed later
		heldBid{BidStatusOutbid, 150, 0},           // placed first
		heldBid{BidStatusWinning, 200, 2 * time.Second},
	)

	require.NoError(t, l.WithdrawBid(ids[2], members[2], now.Add(time.Minute)))

	assert.Equal(t, BidStatusWinning, bidByID(t, l, ids[1]).Status, "earliest of the tied bids leads")
	assert.Equal(t, BidStatusOutbid, bidByID(t, l, ids[0]).Status)
}

// No OUTBID bid left: nobody leads and the price falls back to the starting bid.
func TestWithdrawBid_LeaderWithdraws_NoOtherBid_PriceFallsBackToStart(t *testing.T) {
	now := time.Now()
	l, ids, members := auctionWith(t, now, heldBid{BidStatusWinning, 200, 0})

	require.NoError(t, l.WithdrawBid(ids[0], members[0], now.Add(time.Minute)))

	assert.Nil(t, l.findWinningBid())
	assert.Equal(t, 100, l.currentPrice())
}

// Only an OUTBID bid is promoted. A PENDING bid has no confirmed hold yet and
// competes for the lead when it confirms; CANCELLED, FAILED and LOST bids are out.
func TestWithdrawBid_LeaderWithdraws_OnlyOutbidIsPromoted(t *testing.T) {
	now := time.Now()
	l, ids, members := auctionWith(t, now,
		heldBid{BidStatusPending, 300, 0},
		heldBid{BidStatusCancelled, 290, 0},
		heldBid{BidStatusFailed, 280, 0},
		heldBid{BidStatusWinning, 200, time.Second},
	)

	require.NoError(t, l.WithdrawBid(ids[3], members[3], now.Add(time.Minute)))

	assert.Nil(t, l.findWinningBid(), "nothing OUTBID, nothing promoted")
	assert.Equal(t, BidStatusPending, bidByID(t, l, ids[0]).Status)
	assert.Equal(t, 100, l.currentPrice())
}

// Decided at code review (I-0YXG6-7, option c): the runner-up may be the
// withdrawer's own earlier bid. A member who raised their own bid and then
// withdraws the raise still leads, with the earlier amount; they can withdraw
// that one too once it leads. Pinned so it stays a decision, not an accident.
func TestWithdrawBid_LeaderWithdraws_OwnEarlierBidMayBePromoted(t *testing.T) {
	now := time.Now()
	l, ids, members := auctionWith(t, now,
		heldBid{BidStatusOutbid, 150, 0},
		heldBid{BidStatusWinning, 200, time.Second},
	)
	l.bids[0].memberID = members[1] // the same member raised their own bid

	require.NoError(t, l.WithdrawBid(ids[1], members[1], now.Add(time.Minute)))

	assert.Equal(t, BidStatusWinning, bidByID(t, l, ids[0]).Status, "their own earlier bid leads")
	require.NoError(t, l.WithdrawBid(ids[0], members[1], now.Add(2*time.Minute)), "and can be withdrawn in turn")
	assert.Nil(t, l.findWinningBid())
}

// Withdrawing a bid that does not lead promotes nobody: the leader stands.
func TestWithdrawBid_NonLeaderWithdraws_LeaderStands(t *testing.T) {
	now := time.Now()
	l, ids, members := auctionWith(t, now,
		heldBid{BidStatusPending, 160, 0},
		heldBid{BidStatusOutbid, 150, 0},
		heldBid{BidStatusWinning, 200, time.Second},
	)

	require.NoError(t, l.WithdrawBid(ids[0], members[0], now.Add(time.Minute)))

	assert.Equal(t, BidStatusWinning, bidByID(t, l, ids[2]).Status)
	assert.Equal(t, BidStatusOutbid, bidByID(t, l, ids[1]).Status)
}

// TestReconstituteRejectsTwoWinners is the safety net for persisted state. If
// the partial unique index ever fails or a row is edited by hand, refusing to
// load the listing is safer than letting an auction with two leaders keep
// trading.
func TestReconstituteRejectsTwoWinners(t *testing.T) {
	listingID := uuid.New()
	now := time.Now()

	twoWinners := []*BidReconstituteParams{
		{
			ID: uuid.New(), ListingID: listingID, MemberID: uuid.New(),
			Type: BidTypeBid, Amount: 150, Status: BidStatusWinning,
			CreatedAt: now, UpdatedAt: now,
		},
		{
			ID: uuid.New(), ListingID: listingID, MemberID: uuid.New(),
			Type: BidTypeBid, Amount: 200, Status: BidStatusWinning,
			CreatedAt: now, UpdatedAt: now,
		},
	}

	_, err := Reconstitute(reconstituteParams(listingID, now, twoWinners))

	assert.ErrorIs(t, err, ErrCorruptListingState)
}

// TestReconstituteAcceptsOneOrZeroWinners is the counterpart: zero winners is a
// normal state (nobody has bid, or the only bidder withdrew), so it must load.
func TestReconstituteAcceptsOneOrZeroWinners(t *testing.T) {
	listingID := uuid.New()
	now := time.Now()

	t.Run("no bids at all", func(t *testing.T) {
		l, err := Reconstitute(reconstituteParams(listingID, now, nil))

		require.NoError(t, err)
		assert.Empty(t, l.Snapshot().Bids)
	})

	t.Run("one winner and one outbid", func(t *testing.T) {
		bids := []*BidReconstituteParams{
			{
				ID: uuid.New(), ListingID: listingID, MemberID: uuid.New(),
				Type: BidTypeBid, Amount: 150, Status: BidStatusOutbid,
				CreatedAt: now, UpdatedAt: now,
			},
			{
				ID: uuid.New(), ListingID: listingID, MemberID: uuid.New(),
				Type: BidTypeBid, Amount: 200, Status: BidStatusWinning,
				CreatedAt: now, UpdatedAt: now,
			},
		}

		l, err := Reconstitute(reconstituteParams(listingID, now, bids))

		require.NoError(t, err)
		assert.Len(t, l.Snapshot().Bids, 2)
		assert.Equal(t, 200, l.currentPrice())
	})
}

// TestSnapshotDoesNotShareBidState pins that a snapshot is a copy, not a
// window. Snapshot is the aggregate's only read path precisely because it hands
// out values that cannot be written back through.
func TestSnapshotDoesNotShareBidState(t *testing.T) {
	l := activeListing(t, 100)
	leadingBid(t, l, uuid.New(), 150, time.Now())

	snap := l.Snapshot()
	snap.Bids[0].Amount = 999
	snap.Bids[0].Status = BidStatusCancelled

	assert.Equal(t, 150, l.Snapshot().Bids[0].Amount, "mutating a snapshot must not reach the aggregate")
	assert.Equal(t, BidStatusWinning, l.Snapshot().Bids[0].Status)
}

// TestSnapshotDoesNotShareSettlementState is the scalar-pointer sibling of the
// test above. BuyerID and SoldPrice are the only nilable fields on the snapshot,
// so they are the only ones that can hand back a live *pointer into* the
// aggregate rather than a copy of it. Handing out l.soldPrice directly lets a
// caller rewrite the sale price through the snapshot.
func TestSnapshotDoesNotShareSettlementState(t *testing.T) {
	l := soldListing(t, 100, 250)

	snap := l.Snapshot()
	require.NotNil(t, snap.SoldPrice)
	require.NotNil(t, snap.BuyerID)

	originalBuyer := *snap.BuyerID

	*snap.SoldPrice = 999
	*snap.BuyerID = uuid.New()

	after := l.Snapshot()
	assert.Equal(t, 250, *after.SoldPrice, "writing through a snapshot pointer must not reach the aggregate")
	assert.Equal(t, originalBuyer, *after.BuyerID)
}

// --- helpers ---

// activeListing builds a listing that is open for bidding — which is simply a
// freshly created one: NewListing is born ACTIVE.
func activeListing(t *testing.T, startPrice int) *Listing {
	t.Helper()

	now := time.Now()
	l, err := NewListing(uuid.New(), uuid.New(), uuid.New(), startPrice, nil, now, now.Add(time.Hour))
	require.NoError(t, err)

	return l
}

// leadingBid places a bid and confirms it, standing in for the round trip through
// wallet. Tests that care about the confirmed leader — the price bar, the
// single-winner rule — use this rather than PlaceBid alone, which now leaves the
// bid PENDING and leading nothing.
func leadingBid(t *testing.T, l *Listing, member uuid.UUID, amount int, now time.Time) uuid.UUID {
	t.Helper()

	require.NoError(t, l.PlaceBid(member, amount, uuid.Nil, now))

	bids := l.Snapshot().Bids
	bidID := bids[len(bids)-1].ID
	require.NoError(t, l.ConfirmBid(bidID, now))

	return bidID
}

// soldListing builds a settled listing the way settlement does: a winning bid at
// soldPrice, frozen at 0a, marked WON at 1a, then SOLD at step 6, which takes the
// buyer and the price from that WON bid.
func soldListing(t *testing.T, startPrice, soldPrice int) *Listing {
	t.Helper()

	now := time.Now()
	l := activeListing(t, startPrice)
	winner := leadingBid(t, l, uuid.New(), soldPrice, now)
	require.NoError(t, l.Freeze(now))
	require.NoError(t, l.SetWinningBid(winner, now))
	require.NoError(t, l.MarkSold(now))

	return l
}

// reconstituteParams fills in the listing columns so each test only has to
// describe the bids it cares about.
func reconstituteParams(listingID uuid.UUID, now time.Time, bids []*BidReconstituteParams) ReconstituteParams {
	return ReconstituteParams{
		ID:         listingID,
		SellerID:   uuid.New(),
		ItemID:     uuid.New(),
		StartPrice: 100,
		Status:     StatusActive,
		EndsAt:     now.Add(time.Hour),
		CreatedAt:  now,
		UpdatedAt:  now,
		Version:    0,
		Bids:       bids,
	}
}

// The idempotency key deduplicates one member's resends, never another member's
// bid: the same key from someone else is a bid of their own (ADR-0027).
func TestPlaceBidWithID_SameKeyFromAnotherMember_IsAnotherBid(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)
	key := uuid.New()
	require.NoError(t, l.PlaceBidWithID(uuid.New(), uuid.New(), 150, key, now))

	other := uuid.New()
	require.NoError(t, l.PlaceBidWithID(other, uuid.New(), 200, key, now))

	assert.True(t, l.HasBid(other), "another member's bid with the same key is recorded")
	assert.Len(t, l.Snapshot().Bids, 2)
}

// The same member resending the same key under a new bid ID is still a replay:
// the deploy transition, where an earlier bid carries a random ID.
func TestPlaceBidWithID_SameKeyFromTheSameMember_IsAReplay(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)
	member, key := uuid.New(), uuid.New()
	require.NoError(t, l.PlaceBidWithID(uuid.New(), member, 150, key, now))

	resend := uuid.New()
	require.NoError(t, l.PlaceBidWithID(resend, member, 150, key, now))

	assert.False(t, l.HasBid(resend))
	assert.Len(t, l.Snapshot().Bids, 1)
}
