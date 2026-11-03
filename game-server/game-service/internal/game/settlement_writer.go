package game

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"sync"
	"time"

	pbevents "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
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

// SettlementApplier is items-service applying a settlement at once, through its
// consumer's own path under the caller's event id (FS-GV8WN §D R11). The
// asynchronous copy that follows is then a duplicate.
type SettlementApplier interface {
	ApplySettlement(ctx context.Context, req *pbitems.ApplySettlementRequest) (*pbitems.ApplySettlementResponse, error)
}

// settlementWriter holds each settlement handed to it until it is recorded in
// the outbox and applied in items-service, retrying each step with backoff,
// then confirms it. The session that settled it may already be torn down: the
// formatted pair is all a retry needs, so the writer, not the session, keeps it
// (FS-GV8WN §C R9 as amended, D1; §D R13).
type settlementWriter struct {
	record  recordSettlement
	applier SettlementApplier // nil applies nothing: the asynchronous copy alone lands it
	retry   SettlementRetry
	after   func(time.Duration) <-chan time.Time
	held    sync.WaitGroup

	// draining is set once the pod is going away: from then on nothing more is
	// held, so held.Add never races drain's Wait (sync.WaitGroup's contract)
	mu       sync.Mutex
	draining bool
}

// newSettlementWriter builds the writer. A nil applier applies nothing, so
// nothing it holds is ever confirmed: every settlement lands through its
// recorded copy alone.
func newSettlementWriter(record recordSettlement, applier SettlementApplier, retry SettlementRetry) *settlementWriter {
	if retry.Lifetime == nil {
		retry.Lifetime = context.Background()
	}
	if retry.First <= 0 {
		retry.First = minSettlementWait
	}
	retry.Max = max(retry.Max, retry.First)
	return &settlementWriter{record: record, applier: applier, retry: retry, after: time.After}
}

// pendingSettlement is one settlement the writer holds: its pair, the ids it is
// written under, and what to do once it is applied.
type pendingSettlement struct {
	runID       uuid.UUID
	data        *types.FormattedMatchData
	ids         settlementIDs
	onConfirmed func() // nil: nobody waits for it
	// extracted is the items.extracted the pair carries, decoded once to apply
	// it; nil when it would not decode, so it is recorded but never applied
	extracted *pbevents.ItemsExtractedEvent
}

// newPendingSettlement holds a settlement's pair, decoding its items.extracted
// once for the apply. A pair that will not decode is the service's own bug: it
// is still recorded, and lands through its recorded copy.
func newPendingSettlement(runID uuid.UUID, data *types.FormattedMatchData, ids settlementIDs, onConfirmed func()) pendingSettlement {
	p := pendingSettlement{runID: runID, data: data, ids: ids, onConfirmed: onConfirmed}
	event := &pbevents.ItemsExtractedEvent{}
	if err := proto.Unmarshal(data.ItemsExtractedEvent, event); err != nil {
		slog.Error("Settlement will not be applied at once: its items.extracted does not decode",
			"session_id", runID, "event_id", ids.ItemsExtracted, "error", err)
		return p
	}
	p.extracted = event
	return p
}

// settle records the settlement before returning, so a database that is up
// records it at once; applying it, and a failed record's retries, run off the
// caller's goroutine. The first attempt can take up to AttemptTimeout: a caller
// on the tick must not call settle itself.
func (w *settlementWriter) settle(runID uuid.UUID, data *types.FormattedMatchData, ids settlementIDs, onConfirmed func()) {
	p := newPendingSettlement(runID, data, ids, onConfirmed)
	if !w.admit(runID) {
		return
	}
	recorded := w.firstRecord(p)
	go func() {
		defer w.held.Done()
		if !recorded && !w.retryUntil(p, "recorded", w.attemptRecord) {
			return
		}
		w.applyAndConfirm(p)
	}()
}

// settleLater is settle without the wait: every attempt, the first included,
// runs off the caller's goroutine, so a caller on the tick never waits on the
// database (FS-GV8WN R8, I-GV8WN-5).
func (w *settlementWriter) settleLater(runID uuid.UUID, data *types.FormattedMatchData, ids settlementIDs, onConfirmed func()) {
	p := newPendingSettlement(runID, data, ids, onConfirmed)
	if !w.admit(runID) {
		return
	}
	go func() {
		defer w.held.Done()
		if !w.firstRecord(p) && !w.retryUntil(p, "recorded", w.attemptRecord) {
			return
		}
		w.applyAndConfirm(p)
	}()
}

// applyAndConfirm applies a recorded settlement in items-service, retrying
// until it lands or the pod goes away, then confirms it. Giving up is safe:
// the recorded copy reaches items-service asynchronously (FS-GV8WN R13).
func (w *settlementWriter) applyAndConfirm(p pendingSettlement) {
	if w.applier == nil || p.extracted == nil {
		return
	}
	if err := w.attemptApply(p); err != nil {
		if errors.Is(err, errSettlementRefused) {
			slog.Error("Settlement refused by items-service, not retried: its recorded copy lands it, never confirmed",
				"session_id", p.runID, "event_id", p.ids.ItemsExtracted, "error", err)
			return
		}
		// its recorded copy still lands it, so a failure here is a warning
		slog.Warn("Settlement not applied yet, retrying", "session_id", p.runID, "event_id", p.ids.ItemsExtracted, "error", err)
		if !w.retryUntil(p, "applied", w.attemptApply) {
			return
		}
	}
	if p.onConfirmed != nil {
		p.onConfirmed()
	}
}

// firstRecord is a settlement's first write; a failure is logged once, as an
// error, since the settlement is now held through an outage.
func (w *settlementWriter) firstRecord(p pendingSettlement) bool {
	err := w.attemptRecord(p)
	if err != nil {
		slog.Error("Settlement not recorded, it is held and retried",
			"session_id", p.runID,
			"error", err,
		)
	}
	return err == nil
}

// attemptRecord is one bounded write. Its context is deliberately not the
// pod's: an attempt under way runs to its deadline rather than being cut off by
// shutdown, so it may still commit.
func (w *settlementWriter) attemptRecord(p pendingSettlement) error {
	ctx, cancel := context.WithTimeout(context.Background(), w.retry.AttemptTimeout)
	defer cancel()
	return w.record(ctx, p.data, p.ids)
}

// errSettlementRefused marks an apply items-service refused for good: asking
// again cannot change the answer.
var errSettlementRefused = errors.New("settlement refused")

// attemptApply is one bounded ApplySettlement call, under the settlement's
// items.extracted row id, the id consumers dedup on. Only an unavailable
// items-service, or the attempt running out of time, is worth asking again
// (FS-GV8WN R11's error seam); any other answer is a refusal.
func (w *settlementWriter) attemptApply(p pendingSettlement) error {
	ctx, cancel := context.WithTimeout(context.Background(), w.retry.AttemptTimeout)
	defer cancel()
	_, err := w.applier.ApplySettlement(ctx, &pbitems.ApplySettlementRequest{
		EventId: p.ids.ItemsExtracted.String(),
		Event:   p.extracted,
	})
	if err == nil {
		return nil
	}
	switch status.Code(err) {
	case codes.Unavailable, codes.DeadlineExceeded:
		return fmt.Errorf("apply settlement %s: %w", p.ids.ItemsExtracted, err)
	default:
		return fmt.Errorf("apply settlement %s: %w: %w", p.ids.ItemsExtracted, errSettlementRefused, err)
	}
}

// retryUntil retries step with jittered, doubling waits until it succeeds or
// the pod goes away, and reports which. Each failed retry is a warning; giving
// up is an error.
func (w *settlementWriter) retryUntil(p pendingSettlement, done string, step func(pendingSettlement) error) bool {
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
			slog.Error("Settlement never "+done+": the pod is going away",
				"session_id", p.runID,
				"event_id", p.ids.ItemsExtracted,
			)
			return false
		}

		err := step(p)
		if err == nil {
			slog.Info("Settlement "+done+" after retrying", "session_id", p.runID, "event_id", p.ids.ItemsExtracted, "attempt", attempt)
			return true
		}
		if errors.Is(err, errSettlementRefused) {
			slog.Error("Settlement refused, not retried", "session_id", p.runID, "event_id", p.ids.ItemsExtracted, "error", err)
			return false
		}
		slog.Warn("Settlement still not "+done+", retrying",
			"session_id", p.runID,
			"event_id", p.ids.ItemsExtracted,
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
// recorded and applied, or given up.
func (w *settlementWriter) drain() {
	w.mu.Lock()
	w.draining = true
	w.mu.Unlock()
	w.held.Wait()
}
