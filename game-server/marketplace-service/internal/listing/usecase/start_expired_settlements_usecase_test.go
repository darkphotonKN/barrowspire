package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// pagedFinder serves expired listings a page at a time, the way the query does:
// ordered by (ends_at, id), strictly after the cursor.
type pagedFinder struct {
	listings []dto.ExpiredListing
	err      error
	gotNow   []time.Time
	pages    int
}

func (f *pagedFinder) ExpiredActiveListings(ctx context.Context, now time.Time, after *dto.ExpiredListing, limit int) ([]dto.ExpiredListing, error) {
	f.pages++
	f.gotNow = append(f.gotNow, now)
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

// recordingStarter keeps every start, and can refuse chosen listings.
type recordingStarter struct {
	started   []uuid.UUID
	triggers  []TriggerKind
	failFor   map[uuid.UUID]error
	deadlines []time.Duration
}

func (s *recordingStarter) StartSettlement(ctx context.Context, listingID uuid.UUID, trigger TriggerKind) error {
	s.started = append(s.started, listingID)
	s.triggers = append(s.triggers, trigger)
	if d, ok := ctx.Deadline(); ok {
		s.deadlines = append(s.deadlines, time.Until(d))
	}
	return s.failFor[listingID]
}

func expiredListings(n int, now time.Time) []dto.ExpiredListing {
	out := make([]dto.ExpiredListing, n)
	for i := range out {
		out[i] = dto.ExpiredListing{ID: uuid.New(), EndsAt: now.Add(-time.Duration(n-i) * time.Minute)}
	}
	return out
}

// FS-NXP1W §Req 2: every ACTIVE listing past expiry gets a settlement started,
// under the EXPIRY trigger.
func TestStartExpiredSettlements_StartsEachExpiredListingWithTheExpiryTrigger(t *testing.T) {
	now := time.Now()
	listings := expiredListings(2, now)
	finder, starter := &pagedFinder{listings: listings}, &recordingStarter{}

	err := NewStartExpiredSettlementsUC(finder, starter).Handle(context.Background(), now)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{listings[0].ID, listings[1].ID}, starter.started)
	assert.Equal(t, []TriggerKind{TriggerExpiry, TriggerExpiry}, starter.triggers)
}

// A listing whose settlement parked before 0a froze it stays ACTIVE, so it is
// selected again every tick. Starting only the first page would let such listings
// crowd out every later one forever; every page is walked instead.
func TestStartExpiredSettlements_WalksEveryPageSoStuckListingsCannotStarveLaterOnes(t *testing.T) {
	now := time.Now()
	listings := expiredListings(expiryPollPage*2+3, now)
	finder, starter := &pagedFinder{listings: listings}, &recordingStarter{}

	err := NewStartExpiredSettlementsUC(finder, starter).Handle(context.Background(), now)

	require.NoError(t, err)
	assert.Len(t, starter.started, len(listings))
	assert.Equal(t, listings[len(listings)-1].ID, starter.started[len(starter.started)-1])
	assert.Equal(t, 3, finder.pages, "two full pages, then a short one ends the walk")
	for _, got := range finder.gotNow {
		assert.True(t, got.Equal(now), "every page is read against the same now")
	}
}

// One listing whose start fails (Temporal briefly unreachable) must not hold up
// the rest: every other listing is still started, and the tick reports the failure
// so it is logged. The next tick retries it, since it is still ACTIVE and expired.
func TestStartExpiredSettlements_AFailedStartDoesNotStopTheOthers(t *testing.T) {
	now := time.Now()
	listings := expiredListings(3, now)
	boom := errors.New("temporal unreachable")
	finder := &pagedFinder{listings: listings}
	starter := &recordingStarter{failFor: map[uuid.UUID]error{listings[0].ID: boom}}

	err := NewStartExpiredSettlementsUC(finder, starter).Handle(context.Background(), now)

	assert.ErrorIs(t, err, boom)
	assert.Equal(t, []uuid.UUID{listings[0].ID, listings[1].ID, listings[2].ID}, starter.started)
}

// A failed read starts nothing and is reported; the next tick reads again.
func TestStartExpiredSettlements_AFailedReadStartsNothing(t *testing.T) {
	boom := errors.New("db down")
	starter := &recordingStarter{}

	err := NewStartExpiredSettlementsUC(&pagedFinder{err: boom}, starter).Handle(context.Background(), time.Now())

	assert.ErrorIs(t, err, boom)
	assert.Empty(t, starter.started)
}

// Nothing expired is a quiet tick.
func TestStartExpiredSettlements_NothingExpired_StartsNothing(t *testing.T) {
	starter := &recordingStarter{}

	err := NewStartExpiredSettlementsUC(&pagedFinder{}, starter).Handle(context.Background(), time.Now())

	require.NoError(t, err)
	assert.Empty(t, starter.started)
}

// A slow Temporal must not stall the whole tick: each start runs under its own
// deadline, so one hung start costs at most that long before the next listing.
func TestStartExpiredSettlements_EachStartHasItsOwnDeadline(t *testing.T) {
	now := time.Now()
	listings := expiredListings(2, now)
	starter := &recordingStarter{}

	err := NewStartExpiredSettlementsUC(&pagedFinder{listings: listings}, starter).Handle(context.Background(), now)

	require.NoError(t, err)
	require.Len(t, starter.deadlines, 2, "every start carries a deadline")
	for _, left := range starter.deadlines {
		assert.LessOrEqual(t, left, expiryStartTimeout)
		assert.Greater(t, left, time.Duration(0))
	}
}
