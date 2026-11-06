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
	// whileLeading marks a CANCELLED bid as withdrawn while WINNING, the kind
	// the bid withdrawal cap counts (ADR-0055)
	whileLeading bool
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
			WithdrawnWhileLeading: b.whileLeading, CreatedAt: now, UpdatedAt: now,
		}
	}
	l, err := Reconstitute(reconstituteParams(listingID, now, params))
	require.NoError(t, err)
	return l
}

// leadingWithdrawal is a bid member withdrew while it was WINNING, the kind the
// bid withdrawal cap counts (ADR-0055).
func leadingWithdrawal(member uuid.UUID) memberBid {
	return memberBid{member, BidStatusCancelled, true}
}

// outbidWithdrawal is a bid member withdrew while it was OUTBID, which never
// counts (ADR-0055).
func outbidWithdrawal(member uuid.UUID) memberBid {
	return memberBid{member, BidStatusCancelled, false}
}

// withdrawn is n leading withdrawals by member.
func withdrawn(member uuid.UUID, n int) []memberBid {
	return repeated(leadingWithdrawal(member), n)
}

// withdrawnWhileOutbid is n outbid withdrawals by member.
func withdrawnWhileOutbid(member uuid.UUID, n int) []memberBid {
	return repeated(outbidWithdrawal(member), n)
}

func repeated(b memberBid, n int) []memberBid {
	bids := make([]memberBid, n)
	for i := range bids {
		bids[i] = b
	}
	return bids
}

// FS-ZE43K Req 1-2, 9 as amended by FS-S109X Req 1: a member with
// bidWithdrawalCap leading withdrawals on the listing is refused; only that
// member's own leading withdrawals on this listing count.
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
			leadingWithdrawal(member), leadingWithdrawal(member), {member, BidStatusLost, false},
		}, nil},
		{"FAILED bids do not count", []memberBid{
			leadingWithdrawal(member), leadingWithdrawal(member), {member, BidStatusFailed, false},
		}, nil},
		{"OUTBID bids do not count", []memberBid{
			leadingWithdrawal(member), leadingWithdrawal(member), {member, BidStatusOutbid, false},
		}, nil},
		// FS-S109X Req 1: only a withdrawal of a leading bid counts (ADR-0055)
		{"three outbid withdrawals still bid", withdrawnWhileOutbid(member, 3), nil},
		{"many outbid withdrawals still bid", withdrawnWhileOutbid(member, 8), nil},
		{"two leading and any outbid withdrawals still bid",
			append(withdrawn(member, 2), withdrawnWhileOutbid(member, 4)...), nil},
		{"three leading among outbid withdrawals are refused",
			append(withdrawnWhileOutbid(member, 2), withdrawn(member, 3)...), ErrBidWithdrawLimitReached},
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
	bids := append(withdrawn(member, 3), memberBid{member, BidStatusOutbid, false}, memberBid{member, BidStatusWinning, false})
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

// bidSnapshot is the snapshot of bidID on l.
func bidSnapshot(t *testing.T, l *Listing, bidID uuid.UUID) BidSnapshot {
	t.Helper()
	for _, b := range l.Snapshot().Bids {
		if b.ID == bidID {
			return b
		}
	}
	t.Fatalf("bid %s not on the listing", bidID)
	return BidSnapshot{}
}

// FS-S109X Req 2-3: WithdrawBid records whether the bid was leading at the
// moment it turned CANCELLED; a new bid has never been withdrawn at all.
func TestWithdrawBid_RecordsWhetherTheBidWasLeading(t *testing.T) {
	now := time.Now()
	member, rival := uuid.New(), uuid.New()

	t.Run("a new bid is not a leading withdrawal", func(t *testing.T) {
		l := listingWithMemberBids(t, now)
		bidID := uuid.New()
		require.NoError(t, l.PlaceBidWithID(bidID, member, 200, uuid.Nil, now))
		assert.False(t, bidSnapshot(t, l, bidID).WithdrawnWhileLeading)
	})
	t.Run("withdrawing a WINNING bid is a leading withdrawal", func(t *testing.T) {
		l := listingWithMemberBids(t, now, memberBid{rival, BidStatusOutbid, false}, memberBid{member, BidStatusWinning, false})
		bidID := l.Snapshot().Bids[1].ID

		require.NoError(t, l.WithdrawBid(bidID, member, now))

		got := bidSnapshot(t, l, bidID)
		assert.Equal(t, BidStatusCancelled, got.Status)
		assert.True(t, got.WithdrawnWhileLeading)
	})
	t.Run("withdrawing an OUTBID bid is not", func(t *testing.T) {
		l := listingWithMemberBids(t, now, memberBid{member, BidStatusOutbid, false}, memberBid{rival, BidStatusWinning, false})
		bidID := l.Snapshot().Bids[0].ID

		require.NoError(t, l.WithdrawBid(bidID, member, now))

		got := bidSnapshot(t, l, bidID)
		assert.Equal(t, BidStatusCancelled, got.Status)
		assert.False(t, got.WithdrawnWhileLeading)
	})
	t.Run("the runner-up promoted by a leading withdrawal is not marked", func(t *testing.T) {
		l := listingWithMemberBids(t, now, memberBid{rival, BidStatusOutbid, false}, memberBid{member, BidStatusWinning, false})
		runnerUp := l.Snapshot().Bids[0].ID

		require.NoError(t, l.WithdrawBid(l.Snapshot().Bids[1].ID, member, now))

		got := bidSnapshot(t, l, runnerUp)
		assert.Equal(t, BidStatusWinning, got.Status)
		assert.False(t, got.WithdrawnWhileLeading)
	})
}

// placeConfirmed has member place and confirm a bid of amount on l, so it leads.
func placeConfirmed(t *testing.T, l *Listing, member uuid.UUID, amount int, now time.Time) uuid.UUID {
	t.Helper()
	bidID := uuid.New()
	require.NoError(t, l.PlaceBidWithID(bidID, member, amount, uuid.Nil, now))
	require.NoError(t, l.ConfirmBid(bidID, now))
	return bidID
}

// FS-S109X Req 2: the status at the moment of withdrawal decides, whatever the
// bid's history. Each case starts from two leading withdrawals by member, so the
// one under test decides whether member is capped.
func TestWithdrawBid_StatusAtWithdrawalDecidesWhetherItCounts(t *testing.T) {
	now := time.Now()
	member, rival := uuid.New(), uuid.New()

	tests := []struct {
		name   string
		play   func(t *testing.T, l *Listing) uuid.UUID
		counts bool
	}{
		{"promoted back to WINNING, then withdrawn, counts", func(t *testing.T, l *Listing) uuid.UUID {
			mine := placeConfirmed(t, l, member, 150, now)
			theirs := placeConfirmed(t, l, rival, 160, now)
			// the rival's leading withdrawal promotes member's bid (ADR-0028)
			require.NoError(t, l.WithdrawBid(theirs, rival, now))
			require.Equal(t, BidStatusWinning, bidSnapshot(t, l, mine).Status)
			require.NoError(t, l.WithdrawBid(mine, member, now))
			return mine
		}, true},
		{"led, outbid, then withdrawn, does not count", func(t *testing.T, l *Listing) uuid.UUID {
			mine := placeConfirmed(t, l, member, 150, now)
			placeConfirmed(t, l, rival, 160, now)
			require.Equal(t, BidStatusOutbid, bidSnapshot(t, l, mine).Status)
			require.NoError(t, l.WithdrawBid(mine, member, now))
			return mine
		}, false},
		{"sole WINNING bid withdrawn with no runner-up counts", func(t *testing.T, l *Listing) uuid.UUID {
			mine := placeConfirmed(t, l, member, 150, now)
			require.NoError(t, l.WithdrawBid(mine, member, now))
			return mine
		}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// the fixtures bid 110 and 120, below the start of play at 150
			l := listingWithMemberBids(t, now, withdrawn(member, 2)...)

			bidID := tt.play(t, l)

			assert.Equal(t, BidStatusCancelled, bidSnapshot(t, l, bidID).Status)
			assert.Equal(t, tt.counts, bidSnapshot(t, l, bidID).WithdrawnWhileLeading)
			if tt.counts {
				assert.ErrorIs(t, l.WithinBidWithdrawalCap(member), ErrBidWithdrawLimitReached)
			} else {
				assert.NoError(t, l.WithinBidWithdrawalCap(member))
			}
		})
	}
}
