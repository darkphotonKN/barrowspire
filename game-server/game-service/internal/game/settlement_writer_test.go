package game

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testRetry retries fast and stops when the test ends, so no retry outlives it.
func testRetry(t *testing.T) SettlementRetry {
	t.Helper()
	return SettlementRetry{
		Lifetime:       t.Context(),
		First:          time.Millisecond,
		Max:            4 * time.Millisecond,
		AttemptTimeout: time.Second,
	}
}

// noRetry is a pod already going away: a failed write is tried once only.
func noRetry() SettlementRetry {
	gone, cancel := context.WithCancel(context.Background())
	cancel()
	return SettlementRetry{Lifetime: gone, First: time.Millisecond, Max: time.Millisecond, AttemptTimeout: time.Second}
}

// downDB is a database that cannot begin a transaction for its first `down`
// attempts, then begins them on next. It records each attempt's context.
type downDB struct {
	next TxBeginner
	down int

	mu        sync.Mutex
	attempts  int
	deadlines []bool
}

func (d *downDB) BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error) {
	d.mu.Lock()
	d.attempts++
	attempt := d.attempts
	_, hasDeadline := ctx.Deadline()
	d.deadlines = append(d.deadlines, hasDeadline)
	d.mu.Unlock()
	if attempt <= d.down {
		return nil, errors.New("db down")
	}
	return d.next.BeginTxx(ctx, opts)
}

func (d *downDB) attemptCount() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.attempts
}

func soloRunEnd(runID uuid.UUID, member string) *types.RawMatchState {
	return &types.RawMatchState{
		SessionID: runID,
		Players:   []types.RawPlayerState{{MemberID: member, Username: "wren"}},
	}
}

// A settlement whose write fails is held and retried until it commits, under the
// same row ids every time. FS-GV8WN §C R8–R9, I-GV8WN-4.
func TestPublishMatchComplete_DatabaseDownThenBack_RetriedUntilRecorded(t *testing.T) {
	db := &downDB{next: committingTxDB(t), down: 2}
	outbox := &capturingOutbox{}
	svc := NewService(db, outbox, noWake{}, testRetry(t))
	run, wren := uuid.New(), uuid.NewString()

	svc.PublishMatchComplete(context.Background(), soloRunEnd(run, wren))
	svc.Drain()

	assert.Equal(t, 3, db.attemptCount(), "two failed attempts, then the one that commits")
	want := newSettlementIDs(run, wren)
	assert.Equal(t, want.ItemsExtracted, outbox.rowID(t, commonconstants.ItemsExtracted))
	assert.Equal(t, want.MatchEnded, outbox.rowID(t, commonconstants.GameMatchEnded))
}

// Every attempt is bounded: none waits on the database forever. FS-GV8WN §C R8.
func TestPublishMatchComplete_EveryAttempt_HasADeadline(t *testing.T) {
	db := &downDB{next: committingTxDB(t), down: 1}
	svc := NewService(db, &capturingOutbox{}, noWake{}, testRetry(t))

	svc.PublishMatchComplete(context.Background(), soloRunEnd(uuid.New(), uuid.NewString()))
	svc.Drain()

	require.Len(t, db.deadlines, 2)
	assert.Equal(t, []bool{true, true}, db.deadlines)
}

// Retrying stops when the pod goes away: the settlement was never recorded, and
// its members' run rolls back. FS-GV8WN §C R10.
func TestPublishMatchComplete_PodGoingAway_StopsRetrying(t *testing.T) {
	db := &downDB{next: committingTxDB(t), down: 1 << 30}
	errs := captureErrors(t)
	svc := NewService(db, &capturingOutbox{}, noWake{}, noRetry())
	run := uuid.New()

	svc.PublishMatchComplete(context.Background(), soloRunEnd(run, uuid.NewString()))
	svc.Drain()

	assert.Equal(t, 1, db.attemptCount(), "tried once, then the pod's end stops the retries")
	assert.True(t, errs.loggedSessionID(run), "the unrecorded settlement is logged with its run")
}

// The first attempt is made before PublishMatchComplete returns, so a database
// that is up records the run's end at once, as before. FS-GV8WN §C R8.
func TestPublishMatchComplete_DatabaseUp_RecordedBeforeReturning(t *testing.T) {
	outbox := &capturingOutbox{}
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t))
	run, wren := uuid.New(), uuid.NewString()

	svc.PublishMatchComplete(context.Background(), soloRunEnd(run, wren))

	assert.Equal(t, newSettlementIDs(run, wren).ItemsExtracted, outbox.rowID(t, commonconstants.ItemsExtracted))
}

// recordingWaits stands in for the writer's timer: it records each wait it is
// asked for and lets the retry go at once.
type recordingWaits struct {
	mu    sync.Mutex
	waits []time.Duration
}

func (r *recordingWaits) after(d time.Duration) <-chan time.Time {
	r.mu.Lock()
	r.waits = append(r.waits, d)
	r.mu.Unlock()
	fired := make(chan time.Time, 1)
	fired <- time.Now()
	return fired
}

// failingRecord fails its first `failures` calls and records what each call wrote.
type failingRecord struct {
	failures int

	mu    sync.Mutex
	calls []recordCall
}

type recordCall struct {
	data *types.FormattedMatchData
	ids  settlementIDs
}

func (f *failingRecord) record(_ context.Context, data *types.FormattedMatchData, ids settlementIDs) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, recordCall{data: data, ids: ids})
	if len(f.calls) <= f.failures {
		return errors.New("db down")
	}
	return nil
}

func settleThrough(t *testing.T, retry SettlementRetry, failures int) (*failingRecord, *recordingWaits) {
	t.Helper()
	rec := &failingRecord{failures: failures}
	waits := &recordingWaits{}
	w := newSettlementWriter(rec.record, retry)
	w.after = waits.after
	w.settle(uuid.New(), &types.FormattedMatchData{}, newSettlementIDs(uuid.New(), uuid.NewString()))
	w.drain()
	return rec, waits
}

// Waits double from First up to Max, each jittered into [half, whole] so held
// settlements don't all retry at the same moment. FS-GV8WN §C R8.
func TestSettlementWriter_Waits_DoubleJitteredAndCapped(t *testing.T) {
	retry := SettlementRetry{Lifetime: t.Context(), First: 100 * time.Millisecond, Max: 400 * time.Millisecond, AttemptTimeout: time.Second}

	_, waits := settleThrough(t, retry, 5)

	bases := []time.Duration{100, 200, 400, 400, 400}
	require.Len(t, waits.waits, len(bases))
	for i, base := range bases {
		base *= time.Millisecond
		assert.GreaterOrEqual(t, waits.waits[i], base/2, "wait %d", i)
		assert.LessOrEqual(t, waits.waits[i], base, "wait %d", i)
	}
}

// A retry policy with no waits set never retries back to back.
func TestSettlementWriter_ZeroWaits_NeverSpin(t *testing.T) {
	retry := SettlementRetry{Lifetime: t.Context(), AttemptTimeout: time.Second}

	_, waits := settleThrough(t, retry, 3)

	require.Len(t, waits.waits, 3)
	for i, wait := range waits.waits {
		assert.Positive(t, wait, "wait %d", i)
	}
}

// Every attempt writes the same pair under the same ids. FS-GV8WN §C R8.
func TestSettlementWriter_EveryAttempt_SamePairSameIDs(t *testing.T) {
	rec, _ := settleThrough(t, testRetry(t), 2)

	require.Len(t, rec.calls, 3)
	for _, call := range rec.calls[1:] {
		assert.Same(t, rec.calls[0].data, call.data)
		assert.Equal(t, rec.calls[0].ids, call.ids)
	}
}

// A long outage logs ERROR once when a settlement is first held, and again only
// if it is given up; the retries between are warnings. FS-GV8WN §C R8.
func TestSettlementWriter_Retries_ErrorOnlyWhenHeldAndWhenGivenUp(t *testing.T) {
	t.Run("recorded after retrying: one error", func(t *testing.T) {
		errs := captureErrors(t)
		settleThrough(t, testRetry(t), 3)
		assert.Len(t, errs.records, 1)
	})
	t.Run("given up: held and given up", func(t *testing.T) {
		errs := captureErrors(t)
		settleThrough(t, noRetry(), 1)
		assert.Len(t, errs.records, 2)
	})
}

// Once draining has begun, the pod is going away: a settlement handed over
// after it is refused and rolls back, never racing the drain's wait.
// FS-GV8WN §C R10.
func TestSettlementWriter_AfterDrainBegins_RefusesNewSettlements(t *testing.T) {
	errs := captureErrors(t)
	rec := &failingRecord{}
	w := newSettlementWriter(rec.record, testRetry(t))
	w.drain()

	w.settleLater(uuid.New(), &types.FormattedMatchData{}, newSettlementIDs(uuid.New(), uuid.NewString()))
	w.settle(uuid.New(), &types.FormattedMatchData{}, newSettlementIDs(uuid.New(), uuid.NewString()))
	w.drain()

	assert.Empty(t, rec.calls, "nothing is written once the pod is going away")
	assert.Len(t, errs.records, 2, "each refused settlement is logged")
}
