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
