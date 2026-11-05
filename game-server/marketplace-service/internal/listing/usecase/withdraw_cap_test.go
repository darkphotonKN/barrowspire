package usecase

import (
	"context"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// withdrawBids has member place, confirm and withdraw n bids on l, the loop
// ADR-0052 bounds. Each bid tops the current contender so the domain takes it.
func withdrawBids(t *testing.T, l *listing.Listing, member uuid.UUID, n int, now time.Time) {
	t.Helper()
	for i := 0; i < n; i++ {
		bidID := uuid.New()
		require.NoError(t, l.PlaceBidWithID(bidID, member, 500+i, uuid.Nil, now))
		require.NoError(t, l.ConfirmBid(bidID, now))
		require.NoError(t, l.WithdrawBid(bidID, member, now))
	}
}

// FS-ZE43K Req 6: a capped member's bid is refused on the unlocked read, before
// the hold, so it freezes no gold and starts no release.
func TestPlaceBidUC_AtTheBidWithdrawalCap_HoldsNoGold(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	l := activeListing(t, 100)
	withdrawBids(t, l, member, 3, now)
	repo, wallet, release := &fakeRepo{listing: l}, &fakeWallet{}, &fakeReleaser{}

	err := NewPlaceBidUC(repo, wallet, release).Handle(context.Background(), PlaceBidCommand{
		ListingID: l.Snapshot().ID, MemberID: member, Amount: 600, IdempotencyKey: uuid.New(), Now: now,
	})

	assert.ErrorIs(t, err, listing.ErrBidWithdrawLimitReached)
	assert.Zero(t, wallet.calls, "no gold may be held for a capped bid")
	assert.Zero(t, release.calls)
	assert.Zero(t, repo.updateCall)
}

// FS-ZE43K Req 5-6: a keyed resend of a bid recorded before the member reached
// the cap is a replay: success, and no second hold.
func TestPlaceBidUC_ResendOfARecordedBidAtTheCap_IsAReplay(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	l := activeListing(t, 100)
	wallet, release := &fakeWallet{}, &fakeReleaser{}
	uc := NewPlaceBidUC(&fakeRepo{listing: l}, wallet, release)
	cmd := PlaceBidCommand{
		ListingID: l.Snapshot().ID, MemberID: member, Amount: 150, IdempotencyKey: uuid.New(), Now: now,
	}
	require.NoError(t, uc.Handle(context.Background(), cmd))
	// another member outbids it, so the member is free to bid again (ADR-0054)
	leadWith(t, l, uuid.New(), 160, now)
	withdrawBids(t, l, member, 3, now)
	require.ErrorIs(t, l.WithinBidWithdrawalCap(member), listing.ErrBidWithdrawLimitReached)
	bids := len(l.Snapshot().Bids)

	err := uc.Handle(context.Background(), cmd)

	assert.NoError(t, err, "a replay is still a success at the cap")
	assert.Equal(t, 1, wallet.calls, "only the first attempt holds gold")
	assert.Zero(t, release.calls)
	assert.Len(t, l.Snapshot().Bids, bids)
}

// FS-ZE43K Req 7: the advisory read saw two withdrawals, the third landed before
// the lock. The cap found under the lock is a definite rejection: the hold goes
// back at once, the write is not retried, and the bidder hears the refusal, not
// a 503.
func TestPlaceBidUC_CapFoundUnderTheLock_ReleasesTheHold(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	stale, locked := activeListing(t, 100), activeListing(t, 100)
	withdrawBids(t, stale, member, 2, now)
	withdrawBids(t, locked, member, 3, now)
	repo, wallet, release := &fakeRepo{found: stale, listing: locked}, &fakeWallet{}, &fakeReleaser{}

	err := NewPlaceBidUC(repo, wallet, release).Handle(context.Background(), PlaceBidCommand{
		ListingID: locked.Snapshot().ID, MemberID: member, Amount: 600, IdempotencyKey: uuid.New(), Now: now,
	})

	assert.ErrorIs(t, err, listing.ErrBidWithdrawLimitReached)
	assert.NotErrorIs(t, err, commonconstants.ErrTransient)
	assert.Equal(t, 1, wallet.calls)
	assert.Equal(t, 1, repo.updateCall, "a rejection is not retried")
	assert.Equal(t, 1, release.calls, "the hold goes back at once")
	assert.Equal(t, wallet.gotBidID, release.gotBidID)
}
