package gameserver

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/settling"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* The settling mark (FS-QPDKN §Requirements 32–36): a released escapee whose run has
* not settled yet. Their plunder lands in their bag when it does (items-service
* storeExtractedPlayerItems), so until then no pod lets them into a world that
* checks that bag out.
*
* This pod marks the escapees its runs release, writes the marks again every
* RefreshEvery while each run lives, and lets a run's marks go once its
* settlement events are written. Every pod reads them before an entry. A read
* that fails lets the entry go ahead (R35); a write that fails is left to the
* TTL. One player is in one world at a time, so only one run ever marks them.
**/

// settlingMarks is the settling marks in Redis, as this pod writes and reads them.
type settlingMarks interface {
	Mark(ctx context.Context, runID uuid.UUID, playerIDs ...uuid.UUID) error
	Clear(ctx context.Context, playerIDs ...uuid.UUID) error
	Settling(ctx context.Context, playerIDs ...uuid.UUID) (bool, error)
}

// settlingCallTimeout bounds each mark, refresh and clear.
const settlingCallTimeout = 2 * time.Second

// WithSettling marks this pod's released escapees settling and checks every entry against the
// marks, the pod's Redis in production. Without it nobody is marked and nothing is refused.
// FS-QPDKN R32, R33.
func WithSettling(marks settlingMarks) Option {
	return func(o *bootOptions) { o.settling = marks }
}

// withSettlingTicks refreshes the marks when the test sends on ticks, instead of every 30 s.
func withSettlingTicks(ticks <-chan time.Time) Option {
	return func(o *bootOptions) { o.settlingTicks = ticks }
}

type settlingKeeper struct {
	// nil: nobody is marked and nothing is refused
	marks settlingMarks
	// whether a run still lives on this pod
	live func(runID uuid.UUID) bool

	// held across each write, so a refresh never writes again a mark the run's end has just let
	// go, and a release never marks for a run whose end has already let its marks go.
	//
	// That holds it over Redis. The worst case is a Redis that stalls: each write waits out its
	// settlingCallTimeout (2 s), so a refresh holds it up to ~2 s per live run with released
	// escapees, and a release's mark and a run end's settle wait behind the whole sweep. Reads
	// (settling) never take it, so no entry waits on it.
	mu sync.Mutex
	// each live run's released escapees, by run
	released map[uuid.UUID][]uuid.UUID
}

func newSettlingKeeper(marks settlingMarks, live func(runID uuid.UUID) bool) *settlingKeeper {
	return &settlingKeeper{marks: marks, live: live, released: make(map[uuid.UUID][]uuid.UUID)}
}

// start refreshes the marks on every tick until ctx ends; a refresh every RefreshEvery when ticks
// is nil.
func (k *settlingKeeper) start(ctx context.Context, ticks <-chan time.Time) {
	if k.marks == nil {
		return
	}
	if ticks == nil {
		ticker := time.NewTicker(settling.RefreshEvery)
		go func() { <-ctx.Done(); ticker.Stop() }()
		ticks = ticker.C
	}
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticks:
				k.refresh(ctx)
			}
		}
	}()
}

// mark marks an escapee runID has just released (R32). A run that has already ended marks
// nobody: its end has let its marks go and nothing would ever delete this one. A write that fails
// is logged and blocks nothing.
func (k *settlingKeeper) mark(ctx context.Context, runID, playerID uuid.UUID) {
	if k.marks == nil {
		return
	}
	k.mu.Lock()
	defer k.mu.Unlock()

	if !k.live(runID) {
		slog.Info("Escapee released as their run ended, not marked settling", "player_id", playerID, "run_id", runID)
		return
	}
	k.released[runID] = append(k.released[runID], playerID)

	callCtx, cancel := context.WithTimeout(ctx, settlingCallTimeout)
	defer cancel()
	if err := k.marks.Mark(callCtx, runID, playerID); err != nil {
		slog.Warn("settling mark not written, the escapee is not held back", "player_id", playerID, "run_id", runID, "error", err)
		return
	}
	slog.Info("Released escapee marked settling", "player_id", playerID, "run_id", runID)
}

// refresh writes every live run's marks again. A run no longer registered is ending: its end
// lets its marks go once the settlement is written, so they are not written again meanwhile.
func (k *settlingKeeper) refresh(ctx context.Context) {
	k.mu.Lock()
	defer k.mu.Unlock()

	for runID, playerIDs := range k.released {
		if !k.live(runID) {
			continue
		}
		callCtx, cancel := context.WithTimeout(ctx, settlingCallTimeout)
		err := k.marks.Mark(callCtx, runID, playerIDs...)
		cancel()
		if err != nil {
			slog.Warn("settling marks not refreshed", "run_id", runID, "players", len(playerIDs), "error", err)
		}
	}
}

// settled lets runID's marks go: its settlement events are written (R32, R34). A delete that fails
// is left to the TTL.
func (k *settlingKeeper) settled(ctx context.Context, runID uuid.UUID) {
	if k.marks == nil {
		return
	}
	k.mu.Lock()
	defer k.mu.Unlock()

	playerIDs, marked := k.released[runID]
	if !marked {
		return
	}
	delete(k.released, runID)

	callCtx, cancel := context.WithTimeout(ctx, settlingCallTimeout)
	defer cancel()
	if err := k.marks.Clear(callCtx, playerIDs...); err != nil {
		slog.Warn("settling marks not deleted, left to lapse", "run_id", runID, "players", len(playerIDs), "error", err)
		return
	}
	slog.Info("Run settled, its escapees' settling marks deleted", "run_id", runID, "players", len(playerIDs))
}

// settling reports whether any of these players is settling. A mark that cannot be read is no
// mark: the entry goes ahead (R35). It blocks on Redis, so callers run it off the hub's loop.
func (k *settlingKeeper) settling(ctx context.Context, playerIDs ...uuid.UUID) bool {
	if k.marks == nil {
		return false
	}
	settlingNow, err := k.marks.Settling(ctx, playerIDs...)
	if err != nil {
		slog.Warn("settling mark unreadable, entry let through", "players", playerIDs, "error", err)
		return false
	}
	return settlingNow
}

// settledRunEmitter writes a run's end as the pod's emitter does, then lets the run's settling
// marks go: only once its settlement events are written (FS-QPDKN R32).
type settledRunEmitter struct {
	game.EventEmitter
	settling *settlingKeeper
}

func (e settledRunEmitter) PublishMatchComplete(ctx context.Context, data *types.RawMatchState) {
	e.EventEmitter.PublishMatchComplete(ctx, data)
	e.settling.settled(ctx, data.SessionID)
}

// Settling reports whether any of these players is settling, as every pod reads it before an entry
// that checks out gear (FS-QPDKN R33). Unreadable is no (R35). It blocks on Redis.
func (s *Server) Settling(ctx context.Context, playerIDs ...uuid.UUID) bool {
	return s.settling.settling(ctx, playerIDs...)
}

// runLives reports whether the run is still registered on this pod.
func (s *Server) runLives(runID uuid.UUID) bool {
	_, exists := s.GetGameSession(runID)
	return exists
}
