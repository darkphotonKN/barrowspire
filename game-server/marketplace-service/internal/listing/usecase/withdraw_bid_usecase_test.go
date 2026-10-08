package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Withdrawing a bid has to hand the gold back, and nothing else will. Settlement
// releases losing and rolled-back bids, but a CANCELLED one is in neither set — it
// left the auction — so the gold would stay reserved for as long as the account
// existed.
func TestWithdrawBidUC_ReleasesTheHold(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)
	bidder := uuid.New()
	require.NoError(t, l.PlaceBid(bidder, 150, uuid.Nil, now))
	bidID := l.Snapshot().Bids[0].ID
	require.NoError(t, l.ConfirmBid(bidID, now))

	repo := &fakeRepo{listing: l}
	wallet := &fakeWallet{}

	err := NewWithdrawBidUC(repo, wallet).Handle(context.Background(), WithdrawBidCommand{
		ListingID: uuid.New(),
		BidID:     bidID,
		MemberID:  bidder,
		Now:       now,
	})

	require.NoError(t, err)
	assert.Equal(t, 1, wallet.releaseCalls, "the bidder's gold goes back")
	assert.Equal(t, bidID, wallet.gotReleasedBidID)
	assert.Equal(t, listing.BidStatusCancelled, l.Snapshot().Bids[0].Status)
}

// The write comes first on purpose. Releasing before the bid is cancelled would, if
// the write then failed, leave a live bid with no gold behind it — the same state
// PlaceBid's hold-before-bid ordering exists to prevent, arrived at from the other
// direction.
func TestWithdrawBidUC_WriteFails_GoldStaysHeld(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)
	bidder := uuid.New()
	require.NoError(t, l.PlaceBid(bidder, 150, uuid.Nil, now))
	bidID := l.Snapshot().Bids[0].ID
	require.NoError(t, l.ConfirmBid(bidID, now))

	repo := &fakeRepo{listing: l, saveErr: errListingGone}
	wallet := &fakeWallet{}

	err := NewWithdrawBidUC(repo, wallet).Handle(context.Background(), WithdrawBidCommand{
		ListingID: uuid.New(),
		BidID:     bidID,
		MemberID:  bidder,
		Now:       now,
	})

	require.Error(t, err)
	assert.Zero(t, wallet.releaseCalls, "a bid still standing keeps its gold")
}

// The release is the part that can fail on its own, and the bid is already cancelled
// by then. Reporting that as a failed withdrawal would invite a retry of a withdrawal
// that already happened; the reconciler picks the hold up instead.
func TestWithdrawBidUC_ReleaseFails_WithdrawalStillSucceeds(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)
	bidder := uuid.New()
	require.NoError(t, l.PlaceBid(bidder, 150, uuid.Nil, now))
	bidID := l.Snapshot().Bids[0].ID
	require.NoError(t, l.ConfirmBid(bidID, now))

	repo := &fakeRepo{listing: l}
	wallet := &fakeWallet{releaseErr: errors.New("wallet unreachable")}

	err := NewWithdrawBidUC(repo, wallet).Handle(context.Background(), WithdrawBidCommand{
		ListingID: uuid.New(),
		BidID:     bidID,
		MemberID:  bidder,
		Now:       now,
	})

	require.NoError(t, err, "the bid is cancelled; the hold is the reconciler's problem now")
	assert.Equal(t, listing.BidStatusCancelled, l.Snapshot().Bids[0].Status)
}
