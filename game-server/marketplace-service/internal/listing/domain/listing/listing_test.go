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

			err := l.PlaceBid(uuid.New(), tt.amount, time.Now())

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
		bid, err := newBid(uuid.New(), uuid.New(), BidTypeBid, amount, time.Now())

		assert.ErrorIs(t, err, ErrInvalidAmount)
		assert.Nil(t, bid)
	}
}

// TestNewBidIsBornWinning pins the bid FSM's starting state — a new bid always
// takes the lead, and PlaceBid demotes the previous leader in the same verb.
func TestNewBidIsBornWinning(t *testing.T) {
	bid, err := newBid(uuid.New(), uuid.New(), BidTypeBid, 100, time.Now())

	require.NoError(t, err)
	assert.Equal(t, BidStatusWinning, bid.status)
}

// TestBidBelowCurrentPriceIsNotCreated is the headline requirement: a bid that
// does not beat the current price must not exist at all. Returning an error
// while still appending the bid would leave a phantom row that never won
// anything, so the assertion on the bid count matters as much as the error.
func TestBidBelowCurrentPriceIsNotCreated(t *testing.T) {
	l := activeListing(t, 100)
	require.NoError(t, l.PlaceBid(uuid.New(), 150, time.Now()))

	tests := []struct {
		name   string
		amount int
	}{
		{name: "equal to the current price is not enough", amount: 150},
		{name: "below the current price is rejected", amount: 80},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := l.PlaceBid(uuid.New(), tt.amount, time.Now())

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

		err := l.PlaceBid(uuid.New(), 99, time.Now())

		assert.ErrorIs(t, err, ErrBidTooLow)
		assert.Empty(t, l.Snapshot().Bids)
	})

	t.Run("exactly the start price is accepted", func(t *testing.T) {
		l := activeListing(t, 100)

		require.NoError(t, l.PlaceBid(uuid.New(), 100, time.Now()))
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

	require.NoError(t, l.PlaceBid(uuid.New(), 100, now))
	require.NoError(t, l.PlaceBid(uuid.New(), 150, now))
	require.NoError(t, l.PlaceBid(uuid.New(), 200, now))

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

// TestPlaceBidOnNonActiveListing pins that bidding is only open between publish
// and settlement. A draft listing is not public yet, and a withdrawn or sold
// one is closed for good.
func TestPlaceBidOnNonActiveListing(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name  string
		setup func(t *testing.T) *Listing
	}{
		{
			name: "draft listing is not public yet",
			setup: func(t *testing.T) *Listing {
				return draftListing(t, 100)
			},
		},
		{
			name: "withdrawn listing is closed",
			setup: func(t *testing.T) *Listing {
				l := activeListing(t, 100)
				require.NoError(t, l.Withdraw(now))
				return l
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := tt.setup(t)

			err := l.PlaceBid(uuid.New(), 500, now)

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

	err := l.PlaceBid(uuid.New(), 500, endsAt)

	assert.ErrorIs(t, err, ErrListingExpired)
	assert.Empty(t, l.Snapshot().Bids)
}

// TestWithdrawBidOwnershipGuard pins that a bid belongs to its bidder. Without
// this check any member could cancel a rival's bid and take the lead for free.
func TestWithdrawBidOwnershipGuard(t *testing.T) {
	l := activeListing(t, 100)
	bidder := uuid.New()
	now := time.Now()

	require.NoError(t, l.PlaceBid(bidder, 150, now))
	bidID := l.Snapshot().Bids[0].ID

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

	require.NoError(t, l.PlaceBid(bidder, 150, now))
	require.NoError(t, l.PlaceBid(uuid.New(), 200, now))

	// the first bid is now OUTBID — a terminal state
	outbidID := l.Snapshot().Bids[0].ID

	err := l.WithdrawBid(outbidID, bidder, now)

	assert.ErrorIs(t, err, ErrInvalidBidTransition)
}

// TestWithdrawWinningBidLeavesNoLeader documents the deliberate choice not to
// promote the runner-up: the price falls back to the reserve instead. Once bids
// are backed by wallet holds the runner-up's hold has already been released, so
// promoting it would create a leading bid with no gold behind it.
func TestWithdrawWinningBidLeavesNoLeader(t *testing.T) {
	l := activeListing(t, 100)
	winner := uuid.New()
	now := time.Now()

	require.NoError(t, l.PlaceBid(uuid.New(), 150, now))
	require.NoError(t, l.PlaceBid(winner, 200, now))

	winningID := l.Snapshot().Bids[1].ID
	require.NoError(t, l.WithdrawBid(winningID, winner, now))

	assert.Nil(t, l.findWinningBid(), "no bid leads after the leader withdraws")
	assert.Equal(t, 100, l.currentPrice(), "price falls back to the reserve")
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
	require.NoError(t, l.PlaceBid(uuid.New(), 150, time.Now()))

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

// draftListing builds a listing in its freshly created state, before publish.
func draftListing(t *testing.T, startPrice int) *Listing {
	t.Helper()

	now := time.Now()
	l, err := NewListing(uuid.New(), uuid.New(), startPrice, now, now.Add(time.Hour))
	require.NoError(t, err)

	return l
}

// activeListing builds a listing that is open for bidding. NewListing always
// starts at DRAFT, so it is published here — the same path CreateListing takes.
func activeListing(t *testing.T, startPrice int) *Listing {
	t.Helper()

	l := draftListing(t, startPrice)
	require.NoError(t, l.Publish(time.Now()))

	return l
}

// soldListing builds a settled listing. MarkSold refuses to run before endsAt,
// so the clock is pushed past the end of the auction rather than shortening it
// at construction — NewListing rejects an endsAt that is not in the future.
func soldListing(t *testing.T, startPrice, soldPrice int) *Listing {
	t.Helper()

	l := activeListing(t, startPrice)
	afterEnd := time.Now().Add(2 * time.Hour)
	require.NoError(t, l.MarkSold(afterEnd, uuid.New(), soldPrice))

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
