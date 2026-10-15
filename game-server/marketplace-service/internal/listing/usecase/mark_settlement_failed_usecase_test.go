package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Counting Update calls proves the rollback took the row-locked path rather than
// an unlocked read-then-write.
func TestMarkSettlementFailedUC_FrozenListing_FailsUnderTheLock(t *testing.T) {
	l := frozenListing(t)
	repo := &fakeRepo{listing: l}

	err := NewMarkSettlementFailedUC(repo).Handle(context.Background(), MarkSettlementFailedCommand{
		ListingID: l.Snapshot().ID,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, 1, repo.updateCall)
	assert.Equal(t, listing.StatusSettlementFailed, l.Snapshot().Status)
}

// The rollback is retried without a cap (§Req 12), so a replay must be success.
func TestMarkSettlementFailedUC_Replay_Succeeds(t *testing.T) {
	l := frozenListing(t)
	uc := NewMarkSettlementFailedUC(&fakeRepo{listing: l})
	cmd := MarkSettlementFailedCommand{ListingID: l.Snapshot().ID, Now: time.Now()}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	require.NoError(t, uc.Handle(context.Background(), cmd))

	assert.Equal(t, listing.StatusSettlementFailed, l.Snapshot().Status)
}

// 0a can be impossible because the listing does not exist. There is then nothing
// to fail, and an uncapped rollback that kept erroring would never end.
func TestMarkSettlementFailedUC_MissingListing_IsNothingToDo(t *testing.T) {
	repo := &fakeRepo{updateErr: commonconstants.ErrNotFound}

	err := NewMarkSettlementFailedUC(repo).Handle(context.Background(), MarkSettlementFailedCommand{
		ListingID: uuid.New(),
		Now:       time.Now(),
	})

	assert.NoError(t, err)
}

// Anything else is the database failing, which Temporal retries.
func TestMarkSettlementFailedUC_RepositoryFailure_IsReturned(t *testing.T) {
	dbDown := errors.New("connection refused")
	repo := &fakeRepo{updateErr: dbDown}

	err := NewMarkSettlementFailedUC(repo).Handle(context.Background(), MarkSettlementFailedCommand{
		ListingID: uuid.New(),
		Now:       time.Now(),
	})

	assert.ErrorIs(t, err, dbDown)
}
