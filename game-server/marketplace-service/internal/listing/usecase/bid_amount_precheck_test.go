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

func activeListingWithBuyout(t *testing.T, startPrice, buyout int) *listing.Listing {
	t.Helper()
	now := time.Now()
	l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), startPrice, &buyout, now, now.Add(time.Hour))
	require.NoError(t, err)
	return l
}

// A bid the unlocked read already shows is priced wrong is refused before the
// hold: no gold is held, no release starts, and the listing is never locked.
func TestPlaceBidUC_AmountRefusedOnTheRead_HoldsNoGold(t *testing.T) {
	tests := []struct {
		name    string
		amount  int
		wantErr error
	}{
		{"not above the leader", 150, listing.ErrBidTooLow},
		{"below the leader", 120, listing.ErrBidTooLow},
		{"at the buyout", 500, listing.ErrBidAtOrAboveBuyout},
		{"above the buyout", 900, listing.ErrBidAtOrAboveBuyout},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			l := activeListingWithBuyout(t, 100, 500)
			leadWith(t, l, uuid.New(), 150, now)
			repo, wallet, release := &fakeRepo{listing: l}, &fakeWallet{}, &fakeReleaser{}

			err := NewPlaceBidUC(repo, wallet, release).Handle(context.Background(), PlaceBidCommand{
				ListingID: l.Snapshot().ID, MemberID: uuid.New(), Amount: tt.amount, IdempotencyKey: uuid.New(), Now: now,
			})

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Zero(t, wallet.calls, "no gold may be held for a bid the read already refuses")
			assert.Zero(t, release.calls)
			assert.Zero(t, repo.updateCall)
			assert.Len(t, l.Snapshot().Bids, 1)
		})
	}
}

// Below the starting price with nobody bidding is refused on the read too.
func TestPlaceBidUC_BelowTheStartingPrice_HoldsNoGold(t *testing.T) {
	l := activeListing(t, 100)
	repo, wallet, release := &fakeRepo{listing: l}, &fakeWallet{}, &fakeReleaser{}

	err := NewPlaceBidUC(repo, wallet, release).Handle(context.Background(), PlaceBidCommand{
		ListingID: l.Snapshot().ID, MemberID: uuid.New(), Amount: 99, IdempotencyKey: uuid.New(), Now: time.Now(),
	})

	assert.ErrorIs(t, err, listing.ErrBidTooLow)
	assert.Zero(t, wallet.calls)
	assert.Zero(t, release.calls)
}

// The read is advisory. When another bid lands between it and the lock, the
// price is decided again under the lock: the hold goes back at once and the
// bidder hears the price refusal, not a 503 (ADR-0049).
func TestPlaceBidUC_OutbidBetweenTheReadAndTheLock_ReleasesTheHold(t *testing.T) {
	now := time.Now()
	stale, locked := activeListing(t, 100), activeListing(t, 100)
	leadWith(t, locked, uuid.New(), 200, now)
	repo, wallet, release := &fakeRepo{found: stale, listing: locked}, &fakeWallet{}, &fakeReleaser{}

	err := NewPlaceBidUC(repo, wallet, release).Handle(context.Background(), PlaceBidCommand{
		ListingID: locked.Snapshot().ID, MemberID: uuid.New(), Amount: 150, IdempotencyKey: uuid.New(), Now: now,
	})

	assert.ErrorIs(t, err, listing.ErrBidTooLow)
	assert.NotErrorIs(t, err, commonconstants.ErrTransient)
	assert.Equal(t, 1, wallet.calls)
	assert.Equal(t, 1, repo.updateCall, "a rejection is not retried")
	assert.Equal(t, 1, release.calls, "the hold goes back at once")
	assert.Len(t, locked.Snapshot().Bids, 1)
}

// The price check comes after the replay shortcut: a keyed resend of a bid that
// already landed is that bid, even after someone has outbid it since.
func TestPlaceBidUC_ResendOfALandedBidSinceOutbid_IsAReplay(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)
	member := uuid.New()
	wallet, release := &fakeWallet{}, &fakeReleaser{}
	uc := NewPlaceBidUC(&fakeRepo{listing: l}, wallet, release)
	cmd := PlaceBidCommand{
		ListingID: l.Snapshot().ID, MemberID: member, Amount: 150, IdempotencyKey: uuid.New(), Now: now,
	}
	require.NoError(t, uc.Handle(context.Background(), cmd))
	leadWith(t, l, uuid.New(), 200, now)

	err := uc.Handle(context.Background(), cmd)

	assert.NoError(t, err)
	assert.Equal(t, 1, wallet.calls, "only the first attempt holds gold")
	assert.Zero(t, release.calls)
	assert.Len(t, l.Snapshot().Bids, 2)
}

// The same for a bid recorded under a random ID before IDs were derived
// (ADR-0027): HasBid misses it, so the price check must not refuse a resend
// whose key is already on the listing. Under the lock its key replay answers
// first, as it did before this check existed.
func TestPlaceBidUC_LegacyResendSinceOutbid_IsStillAReplay(t *testing.T) {
	now := time.Now()
	l := activeListing(t, 100)
	member, key, legacy := uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, l.PlaceBidWithID(legacy, member, 150, key, now))
	require.NoError(t, l.ConfirmBid(legacy, now))
	leadWith(t, l, uuid.New(), 200, now)
	wallet, release := &fakeWallet{}, &fakeReleaser{}

	err := NewPlaceBidUC(&fakeRepo{listing: l}, wallet, release).Handle(context.Background(), PlaceBidCommand{
		ListingID: l.Snapshot().ID, MemberID: member, Amount: 150, IdempotencyKey: key, Now: now,
	})

	require.NoError(t, err)
	assert.Len(t, l.Snapshot().Bids, 2)
	assert.Equal(t, 1, release.calls, "the resend's own hold goes back")
}

// Order: a capped member and a leader keep hearing about the cap and the lead,
// whatever amount they send.
func TestPlaceBidUC_LeaderSendingATooLowAmount_HearsTheyLead(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	l := activeListing(t, 100)
	leadWith(t, l, member, 150, now)
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(&fakeRepo{listing: l}, wallet, &fakeReleaser{}).Handle(context.Background(), PlaceBidCommand{
		ListingID: l.Snapshot().ID, MemberID: member, Amount: 50, IdempotencyKey: uuid.New(), Now: now,
	})

	assert.ErrorIs(t, err, listing.ErrAlreadyLeading)
	assert.Zero(t, wallet.calls)
}
