package game

import (
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// closeRecorder is the host, recording which worlds were removed from it.
type closeRecorder struct {
	mockSessionCloser
	mu     sync.Mutex
	closed []uuid.UUID
}

func (c *closeRecorder) CloseSession(id uuid.UUID) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.closed = append(c.closed, id)
	return nil
}

func (c *closeRecorder) closedIDs() []uuid.UUID {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]uuid.UUID(nil), c.closed...)
}

// pendingRun is a run built but not ticking, expecting n handoff players, as
// if its loops were running so Shutdown has something to stop.
func pendingRun(t *testing.T, closer SessionCloser, n int) (*Session, []*types.Player) {
	t.Helper()

	s := newSession(closer, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, RunBounds())
	s.isRunning = true

	expected := make([]*types.Player, n)
	for i := range expected {
		expected[i] = &types.Player{ID: uuid.New()}
	}
	s.AddPlayersToPendingConnection(expected)

	return s, expected
}

func pendingCount(s *Session) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.playersPendingConnection)
}

// A run's seat deadline is 15s after it is built. FS-K2HKP §Requirements 25.
func TestNewSession_SeatDeadlineIsFifteenSecondsOut(t *testing.T) {
	before := time.Now()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, RunBounds())

	assert.Equal(t, 15*time.Second, SeatReleaseAfter)
	assert.False(t, s.seatDeadline.Before(before.Add(SeatReleaseAfter)), "deadline is SeatReleaseAfter from build")
	assert.False(t, s.seatDeadline.After(time.Now().Add(SeatReleaseAfter)))
}

// Seats are kept until the deadline and released at it: nobody is expected
// any more, so a later arrival is refused. FS-K2HKP §Requirements 25.
func TestReleaseUnclaimedSeats_ReleasesOnlyPastTheDeadline(t *testing.T) {
	closer := &closeRecorder{}
	s, _ := pendingRun(t, closer, 2)
	// someone is seated, so the run carries on
	s.AddPlayer(uuid.New(), types.CharacterInPlay{ID: uuid.New(), Class: "warrior", Level: 1}, "")

	assert.False(t, s.releaseUnclaimedSeats(s.seatDeadline.Add(-time.Millisecond)))
	assert.Equal(t, 2, pendingCount(s), "seats are kept before the deadline")

	assert.False(t, s.releaseUnclaimedSeats(s.seatDeadline.Add(time.Millisecond)), "a run with someone seated is not shut down")
	assert.Equal(t, 0, pendingCount(s), "every unclaimed seat is released")
	assert.False(t, s.Ended(), "the run carries on with whoever arrived")
	assert.Empty(t, closer.closedIDs())
}

// Release happens once: an expected player added after it is not released by
// a later tick. FS-K2HKP §Requirements 25.
func TestReleaseUnclaimedSeats_HappensOnce(t *testing.T) {
	s, _ := pendingRun(t, &closeRecorder{}, 1)
	s.AddPlayer(uuid.New(), types.CharacterInPlay{ID: uuid.New(), Class: "warrior", Level: 1}, "")

	past := s.seatDeadline.Add(time.Second)
	s.releaseUnclaimedSeats(past)
	s.AddPlayersToPendingConnection([]*types.Player{{ID: uuid.New()}})

	s.releaseUnclaimedSeats(past.Add(time.Second))
	assert.Equal(t, 1, pendingCount(s), "a second pass releases nothing")
}

// A run nobody reached is shut down at the deadline, through the same close
// an emptied run takes. FS-K2HKP §Requirements 26.
func TestReleaseUnclaimedSeats_NobodySeated_ShutsTheRunDown(t *testing.T) {
	closer := &closeRecorder{}
	s, _ := pendingRun(t, closer, 2)

	assert.True(t, s.releaseUnclaimedSeats(s.seatDeadline.Add(time.Millisecond)))

	assert.True(t, s.Ended(), "the run is shut down")
	assert.Equal(t, []uuid.UUID{s.ID}, closer.closedIDs(), "and removed from the host")
	assert.Equal(t, 0, pendingCount(s))
}

// The hub expects nobody and never ends, however empty. FS-29KSH §Requirements 1.
func TestReleaseUnclaimedSeats_TheHubIsNeverShutDown(t *testing.T) {
	closer := &closeRecorder{}
	hub := newSession(closer, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
	hub.isRunning = true

	assert.False(t, hub.releaseUnclaimedSeats(hub.seatDeadline.Add(time.Hour)))
	assert.False(t, hub.Ended())
	assert.Empty(t, closer.closedIDs())
}

// Ended reports a world that has been shut down.
func TestSession_Ended(t *testing.T) {
	s, _ := pendingRun(t, &closeRecorder{}, 0)
	require.False(t, s.Ended())

	s.Shutdown()
	assert.True(t, s.Ended())
}

// The release reads the pending set the connection goroutine seats from, so
// it is taken under the world's lock. Run under -race.
func TestReleaseUnclaimedSeats_DoesNotRaceArrivals(t *testing.T) {
	s, _ := pendingRun(t, &closeRecorder{}, 1)
	s.AddPlayer(uuid.New(), types.CharacterInPlay{ID: uuid.New(), Class: "warrior", Level: 1}, "")

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for range 100 {
			s.AddPlayersToPendingConnection([]*types.Player{{ID: uuid.New()}})
			_ = pendingCount(s)
		}
	}()

	s.releaseUnclaimedSeats(s.seatDeadline.Add(time.Second))
	wg.Wait()
}
