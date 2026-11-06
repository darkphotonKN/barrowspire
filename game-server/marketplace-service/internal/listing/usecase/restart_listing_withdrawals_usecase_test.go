package usecase

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// pagedCancelledFinder serves unstarted cancelled listings a page at a time, the
// way the query does: ordered by (updated_at, id), strictly after the cursor.
type pagedCancelledFinder struct {
	listings []dto.CancelledListing
	err      error
	pages    int
}

func (f *pagedCancelledFinder) UnstartedCancelledListings(ctx context.Context, after *dto.CancelledListing, limit int) ([]dto.CancelledListing, error) {
	f.pages++
	if f.err != nil {
		return nil, f.err
	}
	start := 0
	if after != nil {
		for i, l := range f.listings {
			if l.ID == after.ID {
				start = i + 1
			}
		}
	}
	end := min(start+limit, len(f.listings))
	return f.listings[start:end], nil
}

// recordingWithdrawalStarter keeps every start, and can refuse chosen listings.
type recordingWithdrawalStarter struct {
	started   []dto.CancelledListing
	failFor   map[uuid.UUID]error
	deadlines []time.Duration
	// cancelAt, when set, ends the pass's context at the first start, the way
	// the tick's deadline passes mid-walk; that start then fails with it.
	cancelAt context.CancelFunc
}

func (s *recordingWithdrawalStarter) StartListingWithdrawal(ctx context.Context, listingID, itemID uuid.UUID, bidIDs []uuid.UUID) error {
	s.started = append(s.started, dto.CancelledListing{ID: listingID, ItemID: itemID, BidIDs: bidIDs})
	if d, ok := ctx.Deadline(); ok {
		s.deadlines = append(s.deadlines, time.Until(d))
	}
	if s.cancelAt != nil {
		s.cancelAt()
		return ctx.Err()
	}
	return s.failFor[listingID]
}

func cancelledListings(n int, now time.Time) []dto.CancelledListing {
	out := make([]dto.CancelledListing, n)
	for i := range out {
		out[i] = dto.CancelledListing{
			ID:        uuid.New(),
			ItemID:    uuid.New(),
			BidIDs:    []uuid.UUID{uuid.New(), uuid.New()},
			UpdatedAt: now.Add(-time.Duration(n-i) * time.Minute),
		}
	}
	return out
}

func startedIDs(s []dto.CancelledListing) []uuid.UUID {
	out := make([]uuid.UUID, len(s))
	for i, l := range s {
		out[i] = l.ID
	}
	return out
}

// FS-V7A5S Req 8 backstop (amended 2026-11-05): every withdrawal not yet marked
// started gets its workflow started with its item and every bid, and is marked
// once the start lands, so the next tick does not select it again.
func TestRestartListingWithdrawals_StartsAndMarksEachUnstartedWithdrawal(t *testing.T) {
	now := time.Now()
	listings := cancelledListings(2, now)
	finder, starter, marker := &pagedCancelledFinder{listings: listings}, &recordingWithdrawalStarter{}, &fakeWithdrawalMarker{}

	err := NewRestartListingWithdrawalsUC(finder, starter, marker).Handle(context.Background())

	require.NoError(t, err)
	require.Len(t, starter.started, 2)
	for i, l := range listings {
		assert.Equal(t, l.ID, starter.started[i].ID)
		assert.Equal(t, l.ItemID, starter.started[i].ItemID)
		assert.Equal(t, l.BidIDs, starter.started[i].BidIDs)
	}
	assert.Equal(t, startedIDs(listings), marker.marked, "each marked after its start")
	assert.True(t, marker.gotDL, "the mark is bounded")
}

// Every page is walked, not the first: a first-page-only pass would leave the
// later ones for the next tick, a backlog after an outage for many ticks.
func TestRestartListingWithdrawals_WalksEveryPage(t *testing.T) {
	now := time.Now()
	listings := cancelledListings(withdrawalBackstopPage*2+3, now)
	finder, starter := &pagedCancelledFinder{listings: listings}, &recordingWithdrawalStarter{}

	err := NewRestartListingWithdrawalsUC(finder, starter, &fakeWithdrawalMarker{}).Handle(context.Background())

	require.NoError(t, err)
	assert.Equal(t, startedIDs(listings), startedIDs(starter.started))
	assert.Equal(t, 3, finder.pages, "two full pages, then a short one ends the walk")
}

// One failed start (Temporal briefly unreachable) does not hold up the rest, and
// is reported so the tick logs it. It stays unmarked, so the next tick tries it
// again, however long Temporal stays down.
func TestRestartListingWithdrawals_AFailedStartDoesNotStopTheOthers(t *testing.T) {
	now := time.Now()
	listings := cancelledListings(3, now)
	boom := errors.New("temporal unreachable")
	finder := &pagedCancelledFinder{listings: listings}
	starter := &recordingWithdrawalStarter{failFor: map[uuid.UUID]error{listings[0].ID: boom}}
	marker := &fakeWithdrawalMarker{}

	err := NewRestartListingWithdrawalsUC(finder, starter, marker).Handle(context.Background())

	assert.ErrorIs(t, err, boom)
	assert.Equal(t, startedIDs(listings), startedIDs(starter.started))
	assert.Equal(t, []uuid.UUID{listings[1].ID, listings[2].ID}, marker.marked, "the failed start is left unmarked")
}

// A failed mark after a start that landed is reported for the tick to log, and
// the walk goes on; the next tick's start of it is a REJECT_DUPLICATE no-op that
// marks it then.
func TestRestartListingWithdrawals_AFailedMarkDoesNotStopTheOthers(t *testing.T) {
	now := time.Now()
	listings := cancelledListings(2, now)
	boom := errors.New("db down")
	marker := &fakeWithdrawalMarker{err: boom}

	err := NewRestartListingWithdrawalsUC(&pagedCancelledFinder{listings: listings}, &recordingWithdrawalStarter{}, marker).Handle(context.Background())

	assert.ErrorIs(t, err, boom)
	assert.Equal(t, startedIDs(listings), marker.marked, "every started listing is tried")
}

// A failed read starts nothing and is reported.
func TestRestartListingWithdrawals_AFailedReadStartsNothing(t *testing.T) {
	boom := errors.New("db down")
	starter := &recordingWithdrawalStarter{}

	err := NewRestartListingWithdrawalsUC(&pagedCancelledFinder{err: boom}, starter, &fakeWithdrawalMarker{}).Handle(context.Background())

	assert.ErrorIs(t, err, boom)
	assert.Empty(t, starter.started)
}

// Each start runs under its own deadline, so one hung start costs at most that
// long before the next listing.
func TestRestartListingWithdrawals_EachStartHasItsOwnDeadline(t *testing.T) {
	now := time.Now()
	starter := &recordingWithdrawalStarter{}

	err := NewRestartListingWithdrawalsUC(&pagedCancelledFinder{listings: cancelledListings(2, now)}, starter, &fakeWithdrawalMarker{}).Handle(context.Background())

	require.NoError(t, err)
	require.Len(t, starter.deadlines, 2, "every start carries a deadline")
	for _, left := range starter.deadlines {
		assert.LessOrEqual(t, left, workflowStartTimeout)
		assert.Greater(t, left, time.Duration(0))
	}
}

// Once the pass's own deadline is gone, every later start and read would fail
// the same way: the walk stops there and reports the deadline once, rather
// than visiting the rest of the page and joining one deadline error per listing.
func TestRestartListingWithdrawals_StopsOnceThePassContextEnds(t *testing.T) {
	now := time.Now()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	finder := &pagedCancelledFinder{listings: cancelledListings(withdrawalBackstopPage*2, now)}
	starter := &recordingWithdrawalStarter{cancelAt: cancel}
	marker := &fakeWithdrawalMarker{}

	err := NewRestartListingWithdrawalsUC(finder, starter, marker).Handle(ctx)

	require.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, 1, strings.Count(err.Error(), context.Canceled.Error()), "the ended context is reported once: %v", err)
	assert.Equal(t, 1, len(starter.started), "no start is tried after the context ends")
	assert.Equal(t, 1, finder.pages, "no further page is read after the context ends")
	assert.Empty(t, marker.marked, "a start the deadline cut off is not marked")
}
