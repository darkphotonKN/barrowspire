package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// wonListing is the state step 6 finds: frozen at 0a, its winner marked WON at
// 1a. It returns the WON bid's bidder and amount for the assertions.
func wonListing(t *testing.T) (*listing.Listing, uuid.UUID, int) {
	t.Helper()

	now := time.Now()
	l := activeListing(t, 100)
	buyer, amount := uuid.New(), 250

	require.NoError(t, l.PlaceBid(buyer, amount, uuid.Nil, now))
	bids := l.Snapshot().Bids
	winner := bids[len(bids)-1].ID
	require.NoError(t, l.ConfirmBid(winner, now))
	require.NoError(t, l.Freeze(now))
	require.NoError(t, l.SetWinningBid(winner, now))

	return l, buyer, amount
}

// Counting Update calls proves step 6 took the row-locked path rather than an
// unlocked read-then-write.
func TestMarkSoldListingUC_WonListing_IsSoldUnderTheLock(t *testing.T) {
	l, buyer, amount := wonListing(t)
	repo := &fakeRepo{listing: l}

	err := NewMarkSoldListingUC(repo).Handle(context.Background(), MarkSoldListingCommand{
		ID:  l.Snapshot().ID,
		Now: time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, 1, repo.updateCall)

	snap := l.Snapshot()
	assert.Equal(t, listing.StatusSold, snap.Status)
	require.NotNil(t, snap.BuyerID)
	require.NotNil(t, snap.SoldPrice)
	assert.Equal(t, buyer, *snap.BuyerID)
	assert.Equal(t, amount, *snap.SoldPrice)
}

// Re-running step 6 on a SOLD listing is success (§Req 33, issue AC).
func TestMarkSoldListingUC_AlreadySold_Succeeds(t *testing.T) {
	l, _, _ := wonListing(t)
	repo := &fakeRepo{listing: l}
	uc := NewMarkSoldListingUC(repo)
	cmd := MarkSoldListingCommand{ID: l.Snapshot().ID, Now: time.Now()}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	require.NoError(t, uc.Handle(context.Background(), cmd))

	assert.Equal(t, listing.StatusSold, l.Snapshot().Status)
}

// The activity classifies step 6's failures by kind, so the domain's sentinel
// has to survive the use case's wrapping intact.
func TestMarkSoldListingUC_DomainRefusal_KeepsItsSentinel(t *testing.T) {
	l := activeListing(t, 100)

	err := NewMarkSoldListingUC(&fakeRepo{listing: l}).Handle(context.Background(), MarkSoldListingCommand{
		ID:  l.Snapshot().ID,
		Now: time.Now(),
	})

	assert.ErrorIs(t, err, listing.ErrInvalidListingState)
	assert.Equal(t, listing.StatusActive, l.Snapshot().Status)
}
