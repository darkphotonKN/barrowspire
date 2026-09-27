package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Settlement step 1a (FS-NXP1W §Req 27): the winner 0a selected is marked WON,
// the last step before the pivot moves the buyer's gold.
func TestSetWinningBid_WinningBid_BecomesWon(t *testing.T) {
	l := activeListing(t, 100)
	winner := leadingBid(t, l, uuid.New(), 150, time.Now())

	require.NoError(t, l.SetWinningBid(winner, time.Now()))

	assert.Equal(t, BidStatusWon, l.Snapshot().Bids[0].Status)
}

// Activities are retried, so a re-run after 1a already committed must be
// success rather than an error the workflow would treat as a failed step.
func TestSetWinningBid_AlreadyWon_Succeeds(t *testing.T) {
	l := activeListing(t, 100)
	winner := leadingBid(t, l, uuid.New(), 150, time.Now())
	require.NoError(t, l.SetWinningBid(winner, time.Now()))

	assert.NoError(t, l.SetWinningBid(winner, time.Now()))
	assert.Equal(t, BidStatusWon, l.Snapshot().Bids[0].Status)
}

func TestSetWinningBid_UnknownBid_ReturnsNotFound(t *testing.T) {
	l := activeListing(t, 100)
	leadingBid(t, l, uuid.New(), 150, time.Now())

	assert.ErrorIs(t, l.SetWinningBid(uuid.New(), time.Now()), ErrBidNotFound)
}

// 1a is conditional on the bid still being WINNING. The existing bid FSM is the
// condition: only WINNING -> WON is whitelisted, so a demoted or unconfirmed bid
// is refused without any status check of its own here.
func TestSetWinningBid_NotWinning_IsRefusedByTheFSM(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)
	outbid := leadingBid(t, l, uuid.New(), 150, now)
	leadingBid(t, l, uuid.New(), 200, now)
	require.NoError(t, l.PlaceBid(uuid.New(), 250, uuid.Nil, now))
	pending := l.Snapshot().Bids[2].ID

	tests := []struct {
		name  string
		bidID uuid.UUID
	}{
		{"outbid", outbid},
		{"pending", pending},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := findStatus(l, tt.bidID)

			assert.ErrorIs(t, l.SetWinningBid(tt.bidID, now), ErrInvalidBidTransition)
			assert.Equal(t, before, findStatus(l, tt.bidID), "a refused step must not change the bid")
		})
	}
}

func findStatus(l *Listing, bidID uuid.UUID) BidStatus {
	for _, b := range l.Snapshot().Bids {
		if b.ID == bidID {
			return b.Status
		}
	}
	return ""
}

// Marketplace's share of the pre-pivot rollback (FS-NXP1W §Req 12): every bid
// still in contention becomes LOST, the winner 1a already moved to WON included.
// Without the WON case the rolled-back listing keeps a bid claiming it won a sale
// that never happened.
func TestLoseAllBids_EveryContenderIncludingTheWonBid_BecomesLost(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)

	loser := leadingBid(t, l, uuid.New(), 150, now)
	winner := leadingBid(t, l, uuid.New(), 200, now) // demotes loser to OUTBID
	require.NoError(t, l.SetWinningBid(winner, now))

	require.NoError(t, l.LoseAllBids(now))

	byID := map[uuid.UUID]BidStatus{}
	for _, b := range l.Snapshot().Bids {
		byID[b.ID] = b.Status
	}

	assert.Equal(t, BidStatusLost, byID[winner], "the WON bid must not keep claiming the sale")
	assert.Equal(t, BidStatusLost, byID[loser], "an outbid contender is lost too")
}

// The rollback is retried without a cap (§Req 12), so running it twice must be the
// same as running it once — and it must not rewrite a bid that reached a terminal
// status of its own. A CANCELLED bidder withdrew and a FAILED one never had gold
// held; calling either LOST claims they lost a contest they had already left.
func TestLoseAllBids_IsIdempotentAndLeavesTerminalBidsAlone(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)

	contender := leadingBid(t, l, uuid.New(), 150, now)

	require.NoError(t, l.PlaceBid(uuid.New(), 160, uuid.Nil, now))
	failed := lastBidID(t, l)
	require.NoError(t, l.FailBid(failed, now))

	withdrawer := uuid.New()
	require.NoError(t, l.PlaceBid(withdrawer, 170, uuid.Nil, now))
	cancelled := lastBidID(t, l)
	require.NoError(t, l.WithdrawBid(cancelled, withdrawer, now))

	require.NoError(t, l.LoseAllBids(now))
	first := statusByBidID(t, l)

	// second run, standing in for the uncapped retry
	require.NoError(t, l.LoseAllBids(now.Add(time.Minute)))
	second := statusByBidID(t, l)

	assert.Equal(t, first, second, "a re-run changes nothing")
	assert.Equal(t, BidStatusLost, second[contender])
	assert.Equal(t, BidStatusFailed, second[failed], "a bid whose gold was never held is not a loser")
	assert.Equal(t, BidStatusCancelled, second[cancelled], "a bidder who withdrew did not lose")
}

func lastBidID(t *testing.T, l *Listing) uuid.UUID {
	t.Helper()

	bids := l.Snapshot().Bids
	require.NotEmpty(t, bids)

	return bids[len(bids)-1].ID
}

func statusByBidID(t *testing.T, l *Listing) map[uuid.UUID]BidStatus {
	t.Helper()

	byID := map[uuid.UUID]BidStatus{}
	for _, b := range l.Snapshot().Bids {
		byID[b.ID] = b.Status
	}

	return byID
}
