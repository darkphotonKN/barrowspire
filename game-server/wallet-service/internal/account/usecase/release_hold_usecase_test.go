package usecase_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The compensating half of PlaceHold: marketplace reserved gold for a bid it then
// failed to record, so the reservation goes back. One bid, not a set — this runs on
// a bidder's request path, not inside settlement.
func TestReleaseHoldUC_ReleasesTheBidsHold(t *testing.T) {
	bidID := uuid.New()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{bidID: accountHolding(t, bidID)}}

	err := usecase.NewReleaseHoldUC(repo).Handle(context.Background(), &usecase.ReleaseHoldCommand{
		BidID: bidID,
		Now:   time.Now(),
	})

	require.NoError(t, err)
	snap := repo.byBid[bidID].Snapshot()
	assert.Equal(t, account.StatusReleased, snap.WalletHolds[0].Status)
	assert.Equal(t, 1000, snap.Gold, "a release moves no gold")
}

// Both callers retry: PlaceBid's compensation runs again on its next attempt, and
// the reconciler re-runs every sweep. Releasing twice must be the same as once.
func TestReleaseHoldUC_AlreadyReleased_Succeeds(t *testing.T) {
	bidID := uuid.New()
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{bidID: accountHolding(t, bidID)}}
	uc := usecase.NewReleaseHoldUC(repo)
	cmd := &usecase.ReleaseHoldCommand{BidID: bidID, Now: time.Now()}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	require.NoError(t, uc.Handle(context.Background(), cmd))

	assert.Equal(t, account.StatusReleased, repo.byBid[bidID].Snapshot().WalletHolds[0].Status)
}

// A bid that never had gold held has nothing to give back. PlaceBid compensates
// blind — it does not know whether PlaceHold landed before the failure — so this has
// to be success, not an error the caller would log as a fault.
func TestReleaseHoldUC_NoHoldForTheBid_IsNothingToRelease(t *testing.T) {
	repo := &multiAccountRepo{byBid: map[uuid.UUID]*account.Account{}}

	err := usecase.NewReleaseHoldUC(repo).Handle(context.Background(), &usecase.ReleaseHoldCommand{
		BidID: uuid.New(),
		Now:   time.Now(),
	})

	assert.NoError(t, err)
}
