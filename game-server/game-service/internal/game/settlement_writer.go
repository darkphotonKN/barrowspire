package game

import (
	"context"
	"log/slog"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// SettlementRetry is how a settlement write that failed is tried again until it
// commits (FS-GV8WN §C R8). Retrying stops only when Lifetime ends: the pod is
// going away, and a settlement not yet recorded rolls back for its members
// (R10).
type SettlementRetry struct {
	Lifetime       context.Context
	First          time.Duration // the wait before the first retry
	Max            time.Duration // the longest wait between retries
	AttemptTimeout time.Duration // how long one attempt may take
}

// DefaultSettlementRetry retries after 0.5 s, doubling to 30 s, each attempt
// bounded at 5 s, for as long as lifetime lasts.
func DefaultSettlementRetry(lifetime context.Context) SettlementRetry {
	return SettlementRetry{
		Lifetime:       lifetime,
		First:          500 * time.Millisecond,
		Max:            30 * time.Second,
		AttemptTimeout: 5 * time.Second,
	}
}

// minSettlementWait floors the waits of a retry policy that set none, so a
// held settlement never retries back to back.
const minSettlementWait = 100 * time.Millisecond

// recordSettlement writes one settlement's outbox pair, in one transaction.
type recordSettlement func(ctx context.Context, data *types.FormattedMatchData, ids settlementIDs) error

// settlementWriter holds each settlement handed to it until its outbox write
// commits. The session that settled it may already be torn down: the
// formatted pair is all a retry needs, so the writer, not the session, keeps it
// (FS-GV8WN §C R9 as amended, D1).
type settlementWriter struct {
	record recordSettlement
	retry  SettlementRetry
	after  func(time.Duration) <-chan time.Time
	held   sync.WaitGroup

	// draining is set once the pod is going away: from then on nothing more is
	// held, so held.Add never races drain's Wait (sync.WaitGroup's contract)
	mu       sync.Mutex
	draining bool
}

func newSettlementWriter(record recordSettlement, retry SettlementRetry) *settlementWriter {
	if retry.Lifetime == nil {
		retry.Lifetime = context.Background()
	}
	if retry.First <= 0 {
		retry.First = minSettlementWait
	}
	retry.Max = max(retry.Max, retry.First)
	return &settlementWriter{record: record, retry: retry, after: time.After}
}

// settle makes the first attempt before returning, so a database that is up
// records the settlement at once, and holds a failed one, retrying it off the
// caller's goroutine. The first attempt can take up to AttemptTimeout: a caller
// on the tick must not call settle itself.
func (w *settlementWriter) settle(runID uuid.UUID, data *types.FormattedMatchData, ids settlementIDs) {
	if !w.admit(runID) {
		return
	}

	err := w.attempt(data, ids)
	if err == nil {
		w.held.Done()
		return
	}
	slog.Error("Settlement not recorded, it is held and retried",
		"session_id", runID,
		"error", err,
	)

	go func() {
		defer w.held.Done()
		w.retryUntilRecorded(runID, data, ids)
	}()
}

// settleLater is settle without the wait: every attempt, the first included,
// runs off the caller's goroutine, so a caller on the tick never waits on the
// database (FS-GV8WN R8, I-GV8WN-5).
func (w *settlementWriter) settleLater(runID uuid.UUID, data *types.FormattedMatchData, ids settlementIDs) {
	if !w.admit(runID) {
		return
	}
	go func() {
		defer w.held.Done()
		err := w.attempt(data, ids)
		if err == nil {
			return
		}
		slog.Error("Settlement not recorded, it is held and retried",
			"session_id", runID,
			"error", err,
		)
		w.retryUntilRecorded(runID, data, ids)
	}()
}

// attempt is one bounded write. Its context is deliberately not the pod's: an
// attempt under way runs to its deadline rather than being cut off by shutdown,
// so it may still commit.
func (w *settlementWriter) attempt(data *types.FormattedMatchData, ids settlementIDs) error {
	ctx, cancel := context.WithTimeout(context.Background(), w.retry.AttemptTimeout)
	defer cancel()
	return w.record(ctx, data, ids)
}

func (w *settlementWriter) retryUntilRecorded(runID uuid.UUID, data *types.FormattedMatchData, ids settlementIDs) {
	base := w.retry.First
	for attempt := 2; ; attempt++ {
		// checked first: with the wait also over, select would pick either at
		// random, and a pod going away must not start another attempt
		if w.retry.Lifetime.Err() == nil {
			select {
			case <-w.retry.Lifetime.Done():
			case <-w.after(jittered(base)):
			}
		}
		if w.retry.Lifetime.Err() != nil {
			slog.Error("Settlement never recorded: the pod is going away, and the run rolls back for its members",
				"session_id", runID,
			)
			return
		}

		err := w.attempt(data, ids)
		if err == nil {
			slog.Info("Settlement recorded after retrying", "session_id", runID, "attempt", attempt)
			return
		}
		slog.Warn("Settlement still not recorded, retrying",
			"session_id", runID,
			"attempt", attempt,
			"error", err,
		)
		base = min(base*2, w.retry.Max)
	}
}

// jittered spreads a wait over [base/2, base], so settlements held through the
// same outage don't all retry at the same moment.
func jittered(base time.Duration) time.Duration {
	half := base / 2
	return half + rand.N(base-half+1)
}

// admit holds a settlement unless the pod is going away. One refused then is
// never written: it rolls back for its member, as a pod's death would
// (FS-GV8WN §C R10).
func (w *settlementWriter) admit(runID uuid.UUID) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.draining {
		slog.Error("Settlement refused: the pod is going away, and the run rolls back for its member",
			"session_id", runID,
		)
		return false
	}
	w.held.Add(1)
	return true
}

// drain stops holding anything new and waits until every settlement held is
// recorded or given up.
func (w *settlementWriter) drain() {
	w.mu.Lock()
	w.draining = true
	w.mu.Unlock()
	w.held.Wait()
}
