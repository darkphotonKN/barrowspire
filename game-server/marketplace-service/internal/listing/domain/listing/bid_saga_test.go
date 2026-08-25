package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNewBidIsBornPending pins the saga's starting state. A bid no longer takes
// the lead the moment it is placed — the buyer's gold has not been held yet, so
// a bid that led immediately would be a claim with no money behind it.
func TestNewBidIsBornPending(t *testing.T) {
	bid, err := newBid(uuid.New(), uuid.New(), uuid.New(), BidTypeBid, 100, uuid.Nil, time.Now())

	require.NoError(t, err)
	assert.Equal(t, BidStatusPending, bid.status)
}

// TestPlaceBidLeavesTheIncumbentAlone is the reason demotion moved out of
// PlaceBid. Until wallet confirms the hold, the new bid might still fail — and
// demoting the current leader on a bid that then fails would cost the listing
// its rightful winner.
func TestPlaceBidLeavesTheIncumbentAlone(t *testing.T) {
	l := activeListing(t, 100)
	leader := uuid.New()

	require.NoError(t, l.PlaceBid(leader, 150, uuid.Nil, time.Now()))
	require.NoError(t, l.ConfirmBid(l.Snapshot().Bids[0].ID, time.Now()))

	// a higher bid arrives but has not cleared its hold yet
	require.NoError(t, l.PlaceBid(uuid.New(), 200, uuid.Nil, time.Now()))

	bids := l.Snapshot().Bids
	require.Len(t, bids, 2)
	assert.Equal(t, BidStatusWinning, bids[0].Status, "the incumbent keeps the lead until the challenger confirms")
	assert.Equal(t, BidStatusPending, bids[1].Status)
	assert.Equal(t, 150, l.currentPrice(), "the price only moves once a bid confirms")
}

// TestPlaceBidComparesAgainstPendingBids covers the gap the partial unique index
// cannot: idx_bids_single_winner only constrains WINNING, so two PENDING bids
// can coexist. Without counting PENDING as contending, two bidders could each
// clear the threshold against the same stale leader and both hold gold for a
// lead only one of them can take.
func TestPlaceBidComparesAgainstPendingBids(t *testing.T) {
	l := activeListing(t, 100)

	require.NoError(t, l.PlaceBid(uuid.New(), 150, uuid.Nil, time.Now()))

	// 150 is only PENDING, but it still sets the bar
	err := l.PlaceBid(uuid.New(), 120, uuid.Nil, time.Now())

	assert.ErrorIs(t, err, ErrBidTooLow)
	assert.Len(t, l.Snapshot().Bids, 1, "the rejected bid must not be appended")
}

// TestConfirmBid covers the promotion step, which runs after wallet reports the
// hold. It is the step that cannot simply fail: the gold is already frozen, so a
// bid stuck in PENDING means money held against a bid that never leads.
func TestConfirmBid(t *testing.T) {
	t.Run("promotes the bid and demotes the incumbent", func(t *testing.T) {
		l := activeListing(t, 100)

		require.NoError(t, l.PlaceBid(uuid.New(), 150, uuid.Nil, time.Now()))
		first := l.Snapshot().Bids[0].ID
		require.NoError(t, l.ConfirmBid(first, time.Now()))

		require.NoError(t, l.PlaceBid(uuid.New(), 200, uuid.Nil, time.Now()))
		second := l.Snapshot().Bids[1].ID
		require.NoError(t, l.ConfirmBid(second, time.Now()))

		bids := l.Snapshot().Bids
		assert.Equal(t, BidStatusOutbid, bids[0].Status)
		assert.Equal(t, BidStatusWinning, bids[1].Status)
		assert.Equal(t, 200, l.currentPrice())
	})

	// Hold-confirmation events are delivered at-least-once, so a redelivered
	// confirmation is expected traffic. Rejecting it would make the saga treat a
	// completed step as a failure and compensate a bid that actually succeeded.
	t.Run("confirming an already winning bid succeeds", func(t *testing.T) {
		l := activeListing(t, 100)
		require.NoError(t, l.PlaceBid(uuid.New(), 150, uuid.Nil, time.Now()))
		bidID := l.Snapshot().Bids[0].ID

		require.NoError(t, l.ConfirmBid(bidID, time.Now()))

		assert.NoError(t, l.ConfirmBid(bidID, time.Now()), "redelivery must not error")
		assert.Equal(t, BidStatusWinning, l.Snapshot().Bids[0].Status)
	})

	t.Run("a bid that does not exist is rejected", func(t *testing.T) {
		l := activeListing(t, 100)

		assert.ErrorIs(t, l.ConfirmBid(uuid.New(), time.Now()), ErrBidNotFound)
	})
}

// TestFailBid covers the other branch: wallet could not hold the gold, so the
// bid never leads. The incumbent must be untouched, since nothing about a failed
// challenge changes who is winning.
func TestFailBid(t *testing.T) {
	l := activeListing(t, 100)

	require.NoError(t, l.PlaceBid(uuid.New(), 150, uuid.Nil, time.Now()))
	leader := l.Snapshot().Bids[0].ID
	require.NoError(t, l.ConfirmBid(leader, time.Now()))

	require.NoError(t, l.PlaceBid(uuid.New(), 200, uuid.Nil, time.Now()))
	challenger := l.Snapshot().Bids[1].ID

	require.NoError(t, l.FailBid(challenger, time.Now()))

	bids := l.Snapshot().Bids
	assert.Equal(t, BidStatusWinning, bids[0].Status, "a failed challenge leaves the leader alone")
	assert.Equal(t, BidStatusFailed, bids[1].Status)
	assert.Equal(t, 150, l.currentPrice())
}

// TestPlaceBidIsIdempotentPerKey pins retry safety. Network retries and broker
// redelivery both replay the same request; without the key, a replay becomes a
// second bid that outbids the first — the same member bidding against themselves.
func TestPlaceBidIsIdempotentPerKey(t *testing.T) {
	l := activeListing(t, 100)
	key := uuid.New()
	member := uuid.New()

	require.NoError(t, l.PlaceBid(member, 150, key, time.Now()))
	require.NoError(t, l.PlaceBid(member, 150, key, time.Now()), "a replay must be accepted, not rejected")

	assert.Len(t, l.Snapshot().Bids, 1, "a replay must not create a second bid")
}

// TestPlaceBidWithoutAKeyIsNotDeduplicated guards the boundary of the rule
// above: uuid.Nil means "no key supplied", and those bids must never be treated
// as replays of one another.
func TestPlaceBidWithoutAKeyIsNotDeduplicated(t *testing.T) {
	l := activeListing(t, 100)

	require.NoError(t, l.PlaceBid(uuid.New(), 150, uuid.Nil, time.Now()))
	require.NoError(t, l.ConfirmBid(l.Snapshot().Bids[0].ID, time.Now()))
	require.NoError(t, l.PlaceBid(uuid.New(), 200, uuid.Nil, time.Now()))

	assert.Len(t, l.Snapshot().Bids, 2)
}
