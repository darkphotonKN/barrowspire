package usecase

import (
	"context"
	"fmt"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// leadWith has member place and confirm a bid of amount on l, so they lead it.
func leadWith(t *testing.T, l *listing.Listing, member uuid.UUID, amount int, now time.Time) {
	t.Helper()
	bidID := uuid.New()
	require.NoError(t, l.PlaceBidWithID(bidID, member, amount, uuid.Nil, now))
	require.NoError(t, l.ConfirmBid(bidID, now))
}

// FS-72KT8 Req 6: a leading member's bid is refused on the unlocked read, before
// the hold, so it freezes no gold and starts no release.
func TestPlaceBidUC_WhileLeading_HoldsNoGold(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	l := activeListing(t, 100)
	leadWith(t, l, member, 150, now)
	repo, wallet, release := &fakeRepo{listing: l}, &fakeWallet{}, &fakeReleaser{}

	err := NewPlaceBidUC(repo, wallet, release).Handle(context.Background(), PlaceBidCommand{
		ListingID: l.Snapshot().ID, MemberID: member, Amount: 200, IdempotencyKey: uuid.New(), Now: now,
	})

	assert.ErrorIs(t, err, listing.ErrAlreadyLeading)
	assert.Zero(t, wallet.calls, "no gold may be held for a leader's bid")
	assert.Zero(t, release.calls)
	assert.Zero(t, repo.updateCall)
	assert.Len(t, l.Snapshot().Bids, 1)
}

// FS-72KT8 Req 4, 6: a keyed resend of the member's recorded leading bid is a
// replay: success, and no second hold.
func TestPlaceBidUC_ResendOfTheLeadingBid_IsAReplay(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	l := activeListing(t, 100)
	wallet, release := &fakeWallet{}, &fakeReleaser{}
	uc := NewPlaceBidUC(&fakeRepo{listing: l}, wallet, release)
	cmd := PlaceBidCommand{
		ListingID: l.Snapshot().ID, MemberID: member, Amount: 150, IdempotencyKey: uuid.New(), Now: now,
	}
	require.NoError(t, uc.Handle(context.Background(), cmd))
	require.ErrorIs(t, l.NotLeading(member), listing.ErrAlreadyLeading)

	err := uc.Handle(context.Background(), cmd)

	assert.NoError(t, err, "a replay of the leading bid is still a success")
	assert.Equal(t, 1, wallet.calls, "only the first attempt holds gold")
	assert.Zero(t, release.calls)
	assert.Len(t, l.Snapshot().Bids, 1)
}

// FS-72KT8 Req 5: the advisory read saw the member not leading; their own first
// bid landed before the lock. The leading refusal found under the lock is a
// definite rejection: the hold goes back at once, the write is not retried, and
// the bidder hears the refusal, not a 503 (ADR-0049).
func TestPlaceBidUC_LeadFoundUnderTheLock_ReleasesTheHold(t *testing.T) {
	now := time.Now()
	member := uuid.New()
	stale, locked := activeListing(t, 100), activeListing(t, 100)
	leadWith(t, locked, member, 150, now)
	repo, wallet, release := &fakeRepo{found: stale, listing: locked}, &fakeWallet{}, &fakeReleaser{}

	err := NewPlaceBidUC(repo, wallet, release).Handle(context.Background(), PlaceBidCommand{
		ListingID: locked.Snapshot().ID, MemberID: member, Amount: 200, IdempotencyKey: uuid.New(), Now: now,
	})

	assert.ErrorIs(t, err, listing.ErrAlreadyLeading)
	assert.NotErrorIs(t, err, commonconstants.ErrTransient)
	assert.Equal(t, 1, wallet.calls)
	assert.Equal(t, 1, repo.updateCall, "a rejection is not retried")
	assert.Equal(t, 1, release.calls, "the hold goes back at once")
	assert.Equal(t, wallet.gotBidID, release.gotBidID)
	assert.Len(t, locked.Snapshot().Bids, 1)
}

// FS-72KT8 Req 5: bidRejected lists ErrAlreadyLeading, wrapped or not.
func TestBidRejected_AlreadyLeading(t *testing.T) {
	assert.True(t, bidRejected(listing.ErrAlreadyLeading))
	assert.True(t, bidRejected(fmt.Errorf("place bid: %w", listing.ErrAlreadyLeading)))
}
