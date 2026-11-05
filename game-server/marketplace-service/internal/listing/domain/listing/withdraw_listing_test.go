package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// withdrawable is a listing as its seller might withdraw it: its status, its end,
// and the bids on it, each placed by its own member.
type withdrawable struct {
	status ListingStatus
	endsIn time.Duration // from now; negative is past its end
	bids   []withdrawableBid
}

type withdrawableBid struct {
	bidType BidType
	status  BidStatus
}

func bidIn(status BidStatus) withdrawableBid { return withdrawableBid{BidTypeBid, status} }

// build reconstitutes the listing and returns it with its seller.
func (w withdrawable) build(t *testing.T, now time.Time) (*Listing, uuid.UUID) {
	t.Helper()
	listingID, sellerID := uuid.New(), uuid.New()
	bids := make([]*BidReconstituteParams, len(w.bids))
	for i, b := range w.bids {
		bids[i] = &BidReconstituteParams{
			ID: uuid.New(), ListingID: listingID, MemberID: uuid.New(),
			Type: b.bidType, Amount: 100 + 10*i, Status: b.status,
			CreatedAt: now.Add(-time.Hour), UpdatedAt: now.Add(-time.Hour),
		}
	}
	l, err := Reconstitute(ReconstituteParams{
		ID:         listingID,
		SellerID:   sellerID,
		ItemID:     uuid.New(),
		StartPrice: 100,
		Status:     w.status,
		EndsAt:     now.Add(w.endsIn),
		CreatedAt:  now.Add(-2 * time.Hour),
		UpdatedAt:  now.Add(-2 * time.Hour),
		Bids:       bids,
	})
	require.NoError(t, err)
	return l, sellerID
}

func bidStatuses(l *Listing) []BidStatus {
	out := []BidStatus{}
	for _, b := range l.Snapshot().Bids {
		out = append(out, b.Status)
	}
	return out
}

// FS-V7A5S Reqs 1–5, ADR-0051: the seller withdraws an open auction; the listing
// becomes CANCELLED and every live bid LOST, except in the final 30 minutes of a
// contested auction.
func TestWithdraw_BySeller_Allowed(t *testing.T) {
	tests := []struct {
		name     string
		listing  withdrawable
		wantBids []BidStatus
	}{
		{
			name:     "no bids, well before the end",
			listing:  withdrawable{status: StatusActive, endsIn: 24 * time.Hour},
			wantBids: []BidStatus{},
		},
		{
			// without live bids there is no lock: up to the very end
			name:     "no bids, a minute before the end",
			listing:  withdrawable{status: StatusActive, endsIn: time.Minute},
			wantBids: []BidStatus{},
		},
		{
			name: "live bids, 31 minutes before the end: every live bid LOST, the rest untouched",
			listing: withdrawable{status: StatusActive, endsIn: 31 * time.Minute, bids: []withdrawableBid{
				bidIn(BidStatusPending), bidIn(BidStatusWinning), bidIn(BidStatusOutbid),
				bidIn(BidStatusCancelled), bidIn(BidStatusFailed),
			}},
			wantBids: []BidStatus{
				BidStatusLost, BidStatusLost, BidStatusLost,
				BidStatusCancelled, BidStatusFailed,
			},
		},
		{
			name: "only CANCELLED and FAILED bids inside the final 30 minutes: not live, no lock",
			listing: withdrawable{status: StatusActive, endsIn: 10 * time.Minute, bids: []withdrawableBid{
				bidIn(BidStatusCancelled), bidIn(BidStatusFailed),
			}},
			wantBids: []BidStatus{BidStatusCancelled, BidStatusFailed},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			l, seller := tt.listing.build(t, now)

			err := l.Withdraw(seller, now)

			require.NoError(t, err)
			assert.Equal(t, StatusCancelled, l.Snapshot().Status)
			assert.Equal(t, tt.wantBids, bidStatuses(l))
			assert.Equal(t, now, l.Snapshot().UpdatedAt)
		})
	}
}

// Every refusal leaves the listing and its bids exactly as they were.
func TestWithdraw_Refused(t *testing.T) {
	live := []withdrawableBid{bidIn(BidStatusWinning), bidIn(BidStatusOutbid)}

	tests := []struct {
		name     string
		listing  withdrawable
		bySeller bool
		wantErr  error
	}{
		{
			// Req 1: the seller check comes first, so a stranger learns nothing
			// about the listing's state — not even that it is locked or ended
			name:     "not the seller, on a locked listing",
			listing:  withdrawable{status: StatusActive, endsIn: 5 * time.Minute, bids: live},
			bySeller: false,
			wantErr:  ErrNotSeller,
		},
		{
			name:     "not the seller, on an ended listing",
			listing:  withdrawable{status: StatusActive, endsIn: -time.Minute},
			bySeller: false,
			wantErr:  ErrNotSeller,
		},
		{
			name:     "not the seller, on a CANCELLED listing",
			listing:  withdrawable{status: StatusCancelled, endsIn: time.Hour},
			bySeller: false,
			wantErr:  ErrNotSeller,
		},
		{
			// Req 3: closed at its start
			name:     "live bids, exactly 30 minutes before the end",
			listing:  withdrawable{status: StatusActive, endsIn: ListingWithdrawLock, bids: live},
			bySeller: true,
			wantErr:  ErrListingWithdrawLocked,
		},
		{
			name:     "live bids, a minute before the end",
			listing:  withdrawable{status: StatusActive, endsIn: time.Minute, bids: live},
			bySeller: true,
			wantErr:  ErrListingWithdrawLocked,
		},
		{
			name:     "a single PENDING bid counts as live",
			listing:  withdrawable{status: StatusActive, endsIn: 10 * time.Minute, bids: []withdrawableBid{bidIn(BidStatusPending)}},
			bySeller: true,
			wantErr:  ErrListingWithdrawLocked,
		},
		{
			name: "bought out",
			listing: withdrawable{status: StatusActive, endsIn: time.Hour, bids: []withdrawableBid{
				bidIn(BidStatusOutbid), {BidTypeBuyout, BidStatusWinning},
			}},
			bySeller: true,
			wantErr:  ErrListingNotAcceptingBids,
		},
		{
			name:     "past its end, no bids",
			listing:  withdrawable{status: StatusActive, endsIn: -time.Second},
			bySeller: true,
			wantErr:  ErrListingExpired,
		},
		{
			name:     "exactly at its end",
			listing:  withdrawable{status: StatusActive, endsIn: 0},
			bySeller: true,
			wantErr:  ErrListingExpired,
		},
		{
			name:     "PENDING_SETTLEMENT",
			listing:  withdrawable{status: StatusPendingSettlement, endsIn: time.Hour, bids: []withdrawableBid{bidIn(BidStatusWinning)}},
			bySeller: true,
			wantErr:  ErrListingNotAcceptingBids,
		},
		{
			name:     "SOLD",
			listing:  withdrawable{status: StatusSold, endsIn: -time.Hour, bids: []withdrawableBid{bidIn(BidStatusWon)}},
			bySeller: true,
			wantErr:  ErrListingNotAcceptingBids,
		},
		{
			name:     "EXPIRED",
			listing:  withdrawable{status: StatusExpired, endsIn: -time.Hour},
			bySeller: true,
			wantErr:  ErrListingNotAcceptingBids,
		},
		{
			name:     "SETTLEMENT_FAILED",
			listing:  withdrawable{status: StatusSettlementFailed, endsIn: time.Hour, bids: []withdrawableBid{bidIn(BidStatusLost)}},
			bySeller: true,
			wantErr:  ErrListingNotAcceptingBids,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			l, seller := tt.listing.build(t, now)
			before := l.Snapshot()
			caller := uuid.New()
			if tt.bySeller {
				caller = seller
			}

			err := l.Withdraw(caller, now)

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, before, l.Snapshot(), "a refusal changes nothing")
		})
	}
}

// Req 4: the seller withdrawing a listing already CANCELLED is success, and
// changes nothing — a double click or a retried request is harmless.
func TestWithdraw_AlreadyCancelledBySeller_IsSuccessAndChangesNothing(t *testing.T) {
	now := time.Now()
	l, seller := withdrawable{status: StatusActive, endsIn: time.Hour, bids: []withdrawableBid{
		bidIn(BidStatusWinning), bidIn(BidStatusOutbid),
	}}.build(t, now)
	require.NoError(t, l.Withdraw(seller, now))
	first := l.Snapshot()

	// later, even inside what would be the lock window, and past the end
	err := l.Withdraw(seller, now.Add(2*time.Hour))

	require.NoError(t, err)
	assert.Equal(t, first, l.Snapshot())
}
