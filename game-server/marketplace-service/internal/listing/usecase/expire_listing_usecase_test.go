package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// frozenListing is the state 0a leaves for the no-bids arm: PENDING_SETTLEMENT,
// nobody bidding.
func frozenListing(t *testing.T) *listing.Listing {
	t.Helper()

	l := activeListing(t, 100)
	require.NoError(t, l.Freeze(time.Now()))

	return l
}

// Counting Update calls proves NB2 took the row-locked path rather than an
// unlocked read-then-write.
func TestExpireListingUC_FrozenListing_IsExpiredUnderTheLock(t *testing.T) {
	l := frozenListing(t)
	repo := &fakeRepo{listing: l}

	err := NewExpireListingUC(repo).Handle(context.Background(), ExpireListingCommand{
		ListingID: l.Snapshot().ID,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, 1, repo.updateCall)
	assert.Equal(t, listing.StatusExpired, l.Snapshot().Status)
}

// Re-running NB2 on an EXPIRED listing is success (§Req 34b, issue AC).
func TestExpireListingUC_AlreadyExpired_Succeeds(t *testing.T) {
	l := frozenListing(t)
	repo := &fakeRepo{listing: l}
	uc := NewExpireListingUC(repo)
	cmd := ExpireListingCommand{ListingID: l.Snapshot().ID, Now: time.Now()}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	require.NoError(t, uc.Handle(context.Background(), cmd))

	assert.Equal(t, listing.StatusExpired, l.Snapshot().Status)
}

// The activity classifies NB2's failures by kind, so the domain's sentinel has to
// survive the use case's wrapping intact.
func TestExpireListingUC_DomainRefusal_KeepsItsSentinel(t *testing.T) {
	l := activeListing(t, 100)

	err := NewExpireListingUC(&fakeRepo{listing: l}).Handle(context.Background(), ExpireListingCommand{
		ListingID: l.Snapshot().ID,
		Now:       time.Now(),
	})

	assert.ErrorIs(t, err, listing.ErrInvalidListingState)
	assert.Equal(t, listing.StatusActive, l.Snapshot().Status)
}
