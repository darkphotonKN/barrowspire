package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func freeze(t *testing.T, repo *fakeRepo) *dto.FreezeListingDto {
	t.Helper()

	out, err := NewFreezeListingUC(repo).Handle(context.Background(), FreezelistingCommand{
		ListingID: repo.listing.Snapshot().ID,
	})
	require.NoError(t, err)

	return out
}

// Step 0a freezes the listing under the lock and names the confirmed leader as
// the winner settlement will act on.
func TestFreezeListingUC_WithLeader_FreezesAndReturnsWinner(t *testing.T) {
	l, bidID := listingWithLeader(t)
	repo := &fakeRepo{listing: l}

	out := freeze(t, repo)

	assert.Equal(t, 1, repo.updateCall)
	assert.Equal(t, listing.StatusPendingSettlement, l.Snapshot().Status)
	require.NotNil(t, out.Winner)
	assert.Equal(t, bidID, out.Winner.WinnerBidID)
	assert.Equal(t, 150, out.Winner.Amount)
}

// The activity is retried, so a re-run against a listing 0a already froze must
// return the same answer instead of failing on the FSM's ACTIVE-only guard.
func TestFreezeListingUC_AlreadyFrozen_ReturnsSameOutput(t *testing.T) {
	l, _ := listingWithLeader(t)
	repo := &fakeRepo{listing: l}

	first := freeze(t, repo)
	frozenAt := l.Snapshot().UpdatedAt

	second := freeze(t, repo)

	assert.Equal(t, first, second)
	assert.Equal(t, listing.StatusPendingSettlement, l.Snapshot().Status)
	assert.Equal(t, frozenAt, l.Snapshot().UpdatedAt, "a re-run must not freeze again")
}

// No confirmed leader is a normal ending (no bids, or all withdrawn / failed),
// reported as a nil Winner rather than an error.
func TestFreezeListingUC_NoWinner_ReturnsNilWinner(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}

	out := freeze(t, repo)

	assert.Nil(t, out.Winner)
	assert.Equal(t, l.Snapshot().ID, out.ListingID)
	assert.Equal(t, listing.StatusPendingSettlement, l.Snapshot().Status)
}

// A pending bid whose hold never landed is not a winner, and must not turn the
// freeze into a corrupt-state failure.
func TestFreezeListingUC_OnlyUnconfirmedBids_ReturnsNilWinner(t *testing.T) {
	l := activeListing(t, 100)
	require.NoError(t, l.PlaceBid(uuid.New(), 150, uuid.Nil, time.Now()))
	repo := &fakeRepo{listing: l}

	out := freeze(t, repo)

	assert.Nil(t, out.Winner)
}
