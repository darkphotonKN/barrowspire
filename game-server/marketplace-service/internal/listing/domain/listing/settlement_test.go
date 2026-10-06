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

// Settlement step 0a (FS-NXP1W): Freeze moves an open listing to
// PENDING_SETTLEMENT. The listing FSM is the guard, so any other starting status
// is refused and left as it was.
func TestFreeze(t *testing.T) {
	tests := []struct {
		name    string
		from    ListingStatus
		wantErr error
		want    ListingStatus
	}{
		{"active is frozen", StatusActive, nil, StatusPendingSettlement},
		{"already frozen is refused", StatusPendingSettlement, ErrInvalidListingState, StatusPendingSettlement},
		{"sold is refused", StatusSold, ErrInvalidListingState, StatusSold},
		{"cancelled is refused", StatusCancelled, ErrInvalidListingState, StatusCancelled},
		{"expired is refused", StatusExpired, ErrInvalidListingState, StatusExpired},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := listingWithBids(t, tt.from)

			err := l.Freeze(time.Now())

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, tt.want, l.Snapshot().Status)
		})
	}
}

// Settlement step NB2 (FS-NXP1W §Req 34b): a frozen listing nobody bid on ends
// EXPIRED. A retry catching up with its own success is not an error; any other
// status is an invariant breach and is left as it was, never overwritten.
func TestExpire(t *testing.T) {
	tests := []struct {
		name    string
		from    ListingStatus
		wantErr error
		want    ListingStatus
	}{
		{"pending settlement is expired", StatusPendingSettlement, nil, StatusExpired},
		{"already expired is applied", StatusExpired, nil, StatusExpired},
		{"active is refused", StatusActive, ErrInvalidListingState, StatusActive},
		{"sold is refused", StatusSold, ErrInvalidListingState, StatusSold},
		{"cancelled is refused", StatusCancelled, ErrInvalidListingState, StatusCancelled},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := listingWithBids(t, tt.from)

			err := l.Expire(time.Now())

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, tt.want, l.Snapshot().Status)
		})
	}
}

// 0a reads the winner off the frozen listing. Only a WINNING bid is a winner;
// a listing whose bids all dropped out is a legitimate no-winner ending, not
// corruption.
func TestFindWinningBid(t *testing.T) {
	tests := []struct {
		name       string
		bids       []BidStatus
		wantWinner bool
	}{
		{"no bids", nil, false},
		{"one leader among losers", []BidStatus{BidStatusOutbid, BidStatusWinning, BidStatusCancelled}, true},
		{"all withdrawn", []BidStatus{BidStatusCancelled, BidStatusCancelled}, false},
		{"all refused by wallet", []BidStatus{BidStatusFailed}, false},
		{"hold still pending", []BidStatus{BidStatusPending}, false},
		{"leader withdrew, runner-up left outbid", []BidStatus{BidStatusOutbid, BidStatusCancelled}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := listingWithBids(t, StatusPendingSettlement, tt.bids...)

			bid, err := l.FindWinningBid()

			require.NoError(t, err)
			if !tt.wantWinner {
				assert.Nil(t, bid)
				return
			}
			require.NotNil(t, bid)
			assert.Equal(t, BidStatusWinning, bid.Snapshot().Status)
		})
	}
}

// listingWithBids loads a listing straight into a given status with one bid per
// status passed, the way the repository would hand it back.
func listingWithBids(t *testing.T, status ListingStatus, bidStatuses ...BidStatus) *Listing {
	t.Helper()

	now := time.Now()
	listingID := uuid.New()

	bids := make([]*BidReconstituteParams, 0, len(bidStatuses))
	for i, s := range bidStatuses {
		bids = append(bids, &BidReconstituteParams{
			ID:        uuid.New(),
			ListingID: listingID,
			MemberID:  uuid.New(),
			Amount:    150 + i,
			Status:    s,
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	params := reconstituteParams(listingID, now, bids)
	params.Status = status

	l, err := Reconstitute(params)
	require.NoError(t, err)

	return l
}

// AcceptBid (FS-NXP1W §Req 3): only the seller may end their auction early, only
// while it still takes bids, and only at a current WINNING bid. Read-only: the
// listing is never changed here; 0a does that under the row lock.
func TestCanAcceptBid(t *testing.T) {
	tests := []struct {
		name    string
		status  ListingStatus
		bids    []BidStatus
		asOther bool
		late    bool
		wantErr error
	}{
		{"seller with a winning bid", StatusActive, []BidStatus{BidStatusOutbid, BidStatusWinning}, false, false, nil},
		{"not the seller", StatusActive, []BidStatus{BidStatusWinning}, true, false, ErrNotSeller},
		{"not the seller learns nothing of state", StatusSold, nil, true, false, ErrNotSeller},
		{"already settling", StatusPendingSettlement, []BidStatus{BidStatusWinning}, false, false, ErrListingNotAcceptingBids},
		{"past its end", StatusActive, []BidStatus{BidStatusWinning}, false, true, ErrListingExpired},
		{"no bids", StatusActive, nil, false, false, ErrNoBidToAccept},
		{"only a pending bid", StatusActive, []BidStatus{BidStatusPending}, false, false, ErrNoBidToAccept},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := listingWithBids(t, tt.status, tt.bids...)
			before := l.Snapshot()

			member := before.SellerID
			if tt.asOther {
				member = uuid.New()
			}
			now := time.Now()
			if tt.late {
				now = before.EndsAt
			}

			err := l.CanAcceptBid(member, now)

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, before, l.Snapshot(), "CanAcceptBid must not change the listing")
		})
	}
}
