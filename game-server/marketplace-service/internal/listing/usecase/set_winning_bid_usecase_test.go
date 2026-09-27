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

// listingWithLeader is an active listing whose only bid is the confirmed leader,
// the state 0a leaves for 1a to act on.
func listingWithLeader(t *testing.T) (*listing.Listing, uuid.UUID) {
	t.Helper()

	l := activeListing(t, 100)
	require.NoError(t, l.PlaceBid(uuid.New(), 150, uuid.Nil, time.Now()))
	bidID := l.Snapshot().Bids[0].ID
	require.NoError(t, l.ConfirmBid(bidID, time.Now()))

	return l, bidID
}

// fakeRepo refuses FindByID and Save, so passing here also proves 1a took the
// row-locked Modify path rather than an unlocked read-then-write.
func TestSetWinningBidUC_WinningBid_IsMarkedWonUnderTheLock(t *testing.T) {
	l, bidID := listingWithLeader(t)
	repo := &fakeRepo{listing: l}

	err := NewSetWinningBidUC(repo).Handle(context.Background(), SetWinningBidCommand{
		ListingID: l.Snapshot().ID,
		BidID:     bidID,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, 1, repo.modifyCall)
	assert.Equal(t, listing.BidStatusWon, l.Snapshot().Bids[0].Status)
}

// Slice 6 classifies 1a's failures by kind, so the domain's sentinel has to
// survive the use case's wrapping intact.
func TestSetWinningBidUC_DomainRefusal_KeepsItsSentinel(t *testing.T) {
	l, _ := listingWithLeader(t)

	err := NewSetWinningBidUC(&fakeRepo{listing: l}).Handle(context.Background(), SetWinningBidCommand{
		ListingID: l.Snapshot().ID,
		BidID:     uuid.New(),
		Now:       time.Now(),
	})

	assert.ErrorIs(t, err, listing.ErrBidNotFound)
}
