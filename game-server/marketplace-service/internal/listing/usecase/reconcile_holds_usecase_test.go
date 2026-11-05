package usecase

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// holdsPage is one answer of wallet's stale-holds read.
type holdsPage struct {
	bidIDs []uuid.UUID
	next   string
	err    error
}

// fakeHoldReconciler answers pages by the position asked for; a position with no
// page answers an empty last page. It records every position and deadline it was
// asked under, and every release.
type fakeHoldReconciler struct {
	pages      map[string]holdsPage
	releaseErr map[uuid.UUID]error
	// onRelease runs after each release is recorded, so a test can end the pass
	// context mid-page
	onRelease func()
	// duringRelease runs inside the release, before it answers; a pass context
	// ended by then cuts the call short with its error
	duringRelease func()

	// gotBefore holds the cutoff each page was asked with, in page order
	gotBefore    []time.Time
	gotAfter     []string
	gotDeadlines []time.Time
	released     []uuid.UUID
}

func (f *fakeHoldReconciler) ListStaleReservedHolds(ctx context.Context, createdBefore time.Time, after string) ([]uuid.UUID, string, error) {
	f.gotBefore = append(f.gotBefore, createdBefore)
	f.gotAfter = append(f.gotAfter, after)
	deadline, _ := ctx.Deadline()
	f.gotDeadlines = append(f.gotDeadlines, deadline)
	p := f.pages[after]
	return p.bidIDs, p.next, p.err
}

func (f *fakeHoldReconciler) ReleaseHold(ctx context.Context, bidID uuid.UUID) error {
	if err := cutShort(ctx, f.duringRelease); err != nil {
		return err
	}
	f.released = append(f.released, bidID)
	if f.onRelease != nil {
		f.onRelease()
	}
	return f.releaseErr[bidID]
}

// onePageOf is wallet answering a single last page.
func onePageOf(ids ...uuid.UUID) map[string]holdsPage {
	return map[string]holdsPage{"": {bidIDs: ids}}
}

// fakeBidReader answers which bids claim gold from a fixed set, and records the
// ids of every claim query. errOnCall fails the n-th query (1-based).
type fakeBidReader struct {
	claimed   map[uuid.UUID]bool
	errOnCall map[int]error
	// during runs inside the query, before it answers
	during func()

	calls [][]uuid.UUID
}

func (f *fakeBidReader) BidsHoldingGold(ctx context.Context, bidIDs []uuid.UUID) (map[uuid.UUID]bool, error) {
	f.calls = append(f.calls, append([]uuid.UUID(nil), bidIDs...))
	if err := cutShort(ctx, f.during); err != nil {
		return nil, err
	}
	if err := f.errOnCall[len(f.calls)]; err != nil {
		return nil, err
	}
	answer := map[uuid.UUID]bool{}
	for _, id := range bidIDs {
		if f.claimed[id] {
			answer[id] = true
		}
	}
	return answer, nil
}

func newIDs(n int) []uuid.UUID {
	ids := make([]uuid.UUID, n)
	for i := range ids {
		ids[i] = uuid.New()
	}
	return ids
}

func claimedSet(groups ...[]uuid.UUID) map[uuid.UUID]bool {
	set := map[uuid.UUID]bool{}
	for _, group := range groups {
		for _, id := range group {
			set[id] = true
		}
	}
	return set
}

// The orphan case: gold reserved for a bid that was never recorded. Nothing in
// settlement will free it — settlement works from a listing's bids, and this one is
// not among them — so the reconciler is the only thing that will.
func TestReconcileHoldsUC_HoldWithNoBid_IsReleased(t *testing.T) {
	orphan, real := uuid.New(), uuid.New()
	wallet := &fakeHoldReconciler{pages: onePageOf(orphan, real)}
	bids := &fakeBidReader{claimed: claimedSet([]uuid.UUID{real})}

	require.NoError(t, NewReconcileHoldsUC(bids, wallet).Handle(context.Background()))

	assert.Equal(t, []uuid.UUID{orphan}, wallet.released,
		"only the hold whose bid was never recorded goes back")
}

// A bid that exists is backing its hold legitimately, however long it has been held:
// the auction may simply still be running. Releasing it would leave a live bid with
// no gold behind it.
func TestReconcileHoldsUC_HoldWithALiveBid_IsLeftAlone(t *testing.T) {
	bidID := uuid.New()
	wallet := &fakeHoldReconciler{pages: onePageOf(bidID)}
	bids := &fakeBidReader{claimed: claimedSet([]uuid.UUID{bidID})}

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

	require.Len(t, wallet.gotBefore, 1)
	assert.False(t, wallet.gotBefore[0].IsZero(), "a cutoff must be sent")
	assert.WithinDuration(t, time.Now().Add(-reconcileHoldGrace), wallet.gotBefore[0], time.Minute)
	assert.GreaterOrEqual(t, reconcileHoldGrace, 10*time.Minute,
		"the grace must comfortably exceed one PlaceBid round trip")
}

// A withdrawn bid is the case neither the reconciler nor settlement used to cover.
// WithdrawBid releases the hold itself, but that release can fail — and a CANCELLED
// bid is in no settlement set, because it left the auction. So the reconciler has to
// treat it as it treats a bid that was never written: the gold belongs to nobody.
func TestReconcileHoldsUC_CancelledBid_IsTreatedAsUnclaimed(t *testing.T) {
	withdrawn := uuid.New()
	wallet := &fakeHoldReconciler{pages: onePageOf(withdrawn)}
	// the claim query leaves a cancelled bid out: the row exists, but no path will
	// ever release its hold
	bids := &fakeBidReader{}

	require.NoError(t, NewReconcileHoldsUC(bids, wallet).Handle(context.Background()))

	assert.Equal(t, []uuid.UUID{withdrawn}, wallet.released)
}

// FS-9BJCP Req 11, 15: every live auction's hold older than the grace is a
// candidate on every tick. An orphan behind more than a page of them is still
// reached in the same pass, and the pass asks once per page which bids claim gold.
func TestReconcileHoldsUC_OrphanBehindPagesOfClaimedHolds_IsReleasedWithOneClaimQueryPerPage(t *testing.T) {
	page1, page2 := newIDs(100), newIDs(100)
	orphan := uuid.New()
	page3 := append(newIDs(5), orphan)
	wallet := &fakeHoldReconciler{pages: map[string]holdsPage{
		"":       {bidIDs: page1, next: "page-2"},
		"page-2": {bidIDs: page2, next: "page-3"},
		"page-3": {bidIDs: page3},
	}}
	bids := &fakeBidReader{claimed: claimedSet(page1, page2, page3[:5])}

	require.NoError(t, NewReconcileHoldsUC(bids, wallet).Handle(context.Background()))

	assert.Equal(t, []uuid.UUID{orphan}, wallet.released)
	assert.Equal(t, []string{"", "page-2", "page-3"}, wallet.gotAfter)
	assert.Equal(t, [][]uuid.UUID{page1, page2, page3}, bids.calls, "one claim query per page, over that page's ids")
}

// The cutoff is computed once per pass: every page of it reads the same stale
// set, so a pass that runs long never widens its window midway.
func TestReconcileHoldsUC_EveryPageOfAPass_IsAskedWithTheSameCutoff(t *testing.T) {
	wallet := &fakeHoldReconciler{pages: map[string]holdsPage{
		"":       {bidIDs: newIDs(1), next: "page-2"},
		"page-2": {bidIDs: newIDs(1), next: "page-3"},
		"page-3": {bidIDs: newIDs(1)},
	}}

	require.NoError(t, NewReconcileHoldsUC(&fakeBidReader{}, wallet).Handle(context.Background()))

	require.Len(t, wallet.gotBefore, 3, "one cutoff recorded per page")
	for i, got := range wallet.gotBefore {
		assert.True(t, got.Equal(wallet.gotBefore[0]), "page %d asked with %s, page 1 with %s", i+1, got, wallet.gotBefore[0])
	}
}

// Req 15: not knowing whether a bid exists is not knowing it does not. A failed
// claim query releases nothing on its page, and the pass still reads the next.
func TestReconcileHoldsUC_ClaimQueryFails_ReleasesNothingOnThatPageAndReadsTheNext(t *testing.T) {
	first, second := uuid.New(), uuid.New()
	wallet := &fakeHoldReconciler{pages: map[string]holdsPage{
		"":       {bidIDs: []uuid.UUID{first}, next: "page-2"},
		"page-2": {bidIDs: []uuid.UUID{second}},
	}}
	bids := &fakeBidReader{errOnCall: map[int]error{1: errors.New("database down")}}

	require.NoError(t, NewReconcileHoldsUC(bids, wallet).Handle(context.Background()))

	assert.Equal(t, []uuid.UUID{second}, wallet.released, "page 1 is left alone, page 2 is reconciled")
	assert.Equal(t, []string{"", "page-2"}, wallet.gotAfter)
}

// Req 14: one hold wallet will not release is logged and skipped; the rest of the
// page and the next page are still reconciled.
func TestReconcileHoldsUC_ReleaseFails_SkipsThatOneAndContinues(t *testing.T) {
	a, b, c := uuid.New(), uuid.New(), uuid.New()
	wallet := &fakeHoldReconciler{
		pages: map[string]holdsPage{
			"":       {bidIDs: []uuid.UUID{a, b}, next: "page-2"},
			"page-2": {bidIDs: []uuid.UUID{c}},
		},
		releaseErr: map[uuid.UUID]error{a: errors.New("wallet down")},
	}

	require.NoError(t, NewReconcileHoldsUC(&fakeBidReader{}, wallet).Handle(context.Background()))

	assert.Equal(t, []uuid.UUID{a, b, c}, wallet.released, "every unclaimed hold is attempted")
}

// Req 12: a wallet answering the position it was sent would have the pass ask for
// the same page forever, so the pass stops with an error. The page read is still
// handled.
func TestReconcileHoldsUC_NextEqualsTheCursorSent_StopsWithAnError(t *testing.T) {
	orphan := uuid.New()
	wallet := &fakeHoldReconciler{pages: map[string]holdsPage{
		"":       {next: "page-2"},
		"page-2": {bidIDs: []uuid.UUID{orphan}, next: "page-2"},
	}}

	err := NewReconcileHoldsUC(&fakeBidReader{}, wallet).Handle(context.Background())

	assert.Error(t, err)
	assert.Equal(t, []string{"", "page-2"}, wallet.gotAfter)
	assert.Equal(t, []uuid.UUID{orphan}, wallet.released)
}

// Req 14: a page that cannot be read ends the pass with an error; holds already
// released stay released, and the next tick starts from the first page.
func TestReconcileHoldsUC_PageReadFails_EndsThePassAfterRowsAlreadyHandled(t *testing.T) {
	orphan := uuid.New()
	wallet := &fakeHoldReconciler{pages: map[string]holdsPage{
		"":       {bidIDs: []uuid.UUID{orphan}, next: "page-2"},
		"page-2": {err: errors.New("wallet unavailable")},
	}}

	err := NewReconcileHoldsUC(&fakeBidReader{}, wallet).Handle(context.Background())

	assert.Error(t, err)
	assert.Equal(t, []uuid.UUID{orphan}, wallet.released)
}

// Req 18: an old wallet ignores after and answers no next, so the pass reads one
// page and stops: today's behaviour.
func TestReconcileHoldsUC_NoNext_EndsThePassAfterThatPage(t *testing.T) {
	orphan := uuid.New()
	wallet := &fakeHoldReconciler{pages: onePageOf(orphan)}

	require.NoError(t, NewReconcileHoldsUC(&fakeBidReader{}, wallet).Handle(context.Background()))

	assert.Equal(t, []string{""}, wallet.gotAfter)
	assert.Equal(t, []uuid.UUID{orphan}, wallet.released)
}

// Req 13: the pass runs under its own deadline, well inside the tick, so a wallet
// that keeps answering new pages (or hangs) cannot hold the goroutine past the
// next tick.
func TestReconcileHoldsUC_RunsUnderADeadlineInsideTheTick(t *testing.T) {
	wallet := &fakeHoldReconciler{pages: onePageOf(uuid.New())}
	before := time.Now()

	require.NoError(t, NewReconcileHoldsUC(&fakeBidReader{}, wallet).Handle(context.Background()))

	require.Len(t, wallet.gotDeadlines, 1)
	deadline := wallet.gotDeadlines[0]
	require.False(t, deadline.IsZero(), "wallet is paged under a deadline")
	assert.False(t, deadline.After(before.Add(reconcilePassTimeout).Add(time.Second)))
	assert.Equal(t, 2*time.Minute, reconcilePassTimeout)
}

// Req 13: a pass context already over reads no page and reports why.
func TestReconcileHoldsUC_DeadlinePassed_ReadsNoPage(t *testing.T) {
	wallet := &fakeHoldReconciler{pages: onePageOf(uuid.New())}
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()

	err := NewReconcileHoldsUC(&fakeBidReader{}, wallet).Handle(ctx)

	assert.ErrorIs(t, err, context.DeadlineExceeded)
	assert.Empty(t, wallet.gotAfter)
	assert.Empty(t, wallet.released)
}

// Req 13: a pass context that ends mid-page stops before the next row and before
// the next page, and the pass reports it once.
func TestReconcileHoldsUC_ContextEndsMidPage_StopsBetweenRowsAndPages(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	wallet := &fakeHoldReconciler{
		pages: map[string]holdsPage{
			"":       {bidIDs: []uuid.UUID{a, b}, next: "page-2"},
			"page-2": {bidIDs: newIDs(1)},
		},
		onRelease: cancel,
	}

	err := NewReconcileHoldsUC(&fakeBidReader{}, wallet).Handle(ctx)

	require.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, []uuid.UUID{a}, wallet.released, "b is never attempted")
	assert.Equal(t, []string{""}, wallet.gotAfter, "page 2 is never read")
	assert.Equal(t, 1, strings.Count(err.Error(), context.Canceled.Error()), "reported once")
}

// Req 13: a pass context that ends while the claim query or a release is in flight
// fails that call with the context's error. That is the pass stopping, not the page
// or the hold failing: neither is logged as failed, and the pass reports the stop
// once, even on the last page.
func TestReconcileHoldsUC_PassContextEndsDuringACall_ReportsTheStopOnceAndNoRowFailure(t *testing.T) {
	cases := []struct {
		name string
		arm  func(bids *fakeBidReader, wallet *fakeHoldReconciler, end func())
	}{
		{
			name: "during the claim query",
			arm:  func(bids *fakeBidReader, _ *fakeHoldReconciler, end func()) { bids.during = end },
		},
		{
			name: "during a release",
			arm:  func(_ *fakeBidReader, wallet *fakeHoldReconciler, end func()) { wallet.duringRelease = end },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			logs := captureErrorLogs(t)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			bids := &fakeBidReader{}
			wallet := &fakeHoldReconciler{pages: onePageOf(uuid.New())}
			tc.arm(bids, wallet, cancel)

			err := NewReconcileHoldsUC(bids, wallet).Handle(ctx)

			require.ErrorIs(t, err, context.Canceled, "the pass reports that it was stopped")
			assert.Equal(t, 1, strings.Count(err.Error(), context.Canceled.Error()), "reported once")
			assert.Empty(t, logs.String(), "the call cut short is not logged as a failed page or hold")
			assert.Empty(t, wallet.released)
		})
	}
}
