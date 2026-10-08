package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeHoldReconciler struct {
	stale      []uuid.UUID
	listErr    error
	releaseErr error

	gotBefore time.Time
	released  []uuid.UUID
}

func (f *fakeHoldReconciler) ListStaleReservedHolds(ctx context.Context, createdBefore time.Time) ([]uuid.UUID, error) {
	f.gotBefore = createdBefore
	return f.stale, f.listErr
}

func (f *fakeHoldReconciler) ReleaseHold(ctx context.Context, bidID uuid.UUID) error {
	f.released = append(f.released, bidID)
	return f.releaseErr
}

type fakeBidReader struct {
	known map[uuid.UUID]bool
	err   error
}

func (f *fakeBidReader) HasBidHoldingGold(ctx context.Context, bidID uuid.UUID) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	return f.known[bidID], nil
}

// The orphan case: gold reserved for a bid that was never recorded. Nothing in
// settlement will free it — settlement works from a listing's bids, and this one is
// not among them — so the reconciler is the only thing that will.
func TestReconcileHoldsUC_HoldWithNoBid_IsReleased(t *testing.T) {
	orphan, real := uuid.New(), uuid.New()
	wallet := &fakeHoldReconciler{stale: []uuid.UUID{orphan, real}}
	bids := &fakeBidReader{known: map[uuid.UUID]bool{real: true}}

	require.NoError(t, NewReconcileHoldsUC(bids, wallet).Handle(context.Background()))

	assert.Equal(t, []uuid.UUID{orphan}, wallet.released,
		"only the hold whose bid was never recorded goes back")
}

// A bid that exists is backing its hold legitimately, however long it has been held:
// the auction may simply still be running. Releasing it would leave a live bid with
// no gold behind it.
func TestReconcileHoldsUC_HoldWithALiveBid_IsLeftAlone(t *testing.T) {
	bidID := uuid.New()
	wallet := &fakeHoldReconciler{stale: []uuid.UUID{bidID}}
	bids := &fakeBidReader{known: map[uuid.UUID]bool{bidID: true}}

	require.NoError(t, NewReconcileHoldsUC(bids, wallet).Handle(context.Background()))

	assert.Empty(t, wallet.released)
}

// The cutoff is what makes this safe to run at all. Without it the reconciler races
// PlaceBid: a hold placed moments ago belongs to a request that may still be writing
// its bid, and releasing it manufactures the exact state the hold-before-bid ordering
// exists to prevent.
func TestReconcileHoldsUC_AsksOnlyForHoldsOlderThanTheGrace(t *testing.T) {
	wallet := &fakeHoldReconciler{}

	require.NoError(t, NewReconcileHoldsUC(&fakeBidReader{}, wallet).Handle(context.Background()))

	assert.False(t, wallet.gotBefore.IsZero(), "a cutoff must be sent")
	assert.WithinDuration(t, time.Now().Add(-reconcileHoldGrace), wallet.gotBefore, time.Minute)
	assert.GreaterOrEqual(t, reconcileHoldGrace, 10*time.Minute,
		"the grace must comfortably exceed one PlaceBid round trip")
}

// One unreadable bid must not stop the sweep: the rest of the batch is still worth
// reconciling, and this one comes round again next tick.
func TestReconcileHoldsUC_BidLookupFails_SkipsThatOneAndContinues(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	wallet := &fakeHoldReconciler{stale: []uuid.UUID{a, b}}
	bids := &fakeBidReader{err: errors.New("database down")}

	require.NoError(t, NewReconcileHoldsUC(bids, wallet).Handle(context.Background()))

	assert.Empty(t, wallet.released, "a hold is never released on a failed lookup")
}

// A withdrawn bid is the case neither the reconciler nor settlement used to cover.
// WithdrawBid releases the hold itself, but that release can fail — and a CANCELLED
// bid is in no settlement set, because it left the auction. So the reconciler has to
// treat it as it treats a bid that was never written: the gold belongs to nobody.
//
// The distinction the query draws is not "does a row exist" but "is anyone still
// accounting for this gold".
func TestReconcileHoldsUC_CancelledBid_IsTreatedAsUnclaimed(t *testing.T) {
	withdrawn := uuid.New()
	wallet := &fakeHoldReconciler{stale: []uuid.UUID{withdrawn}}
	// the query reports false for a cancelled bid: the row exists, but no path will
	// ever release its hold
	bids := &fakeBidReader{known: map[uuid.UUID]bool{}}

	require.NoError(t, NewReconcileHoldsUC(bids, wallet).Handle(context.Background()))

	assert.Equal(t, []uuid.UUID{withdrawn}, wallet.released)
}
