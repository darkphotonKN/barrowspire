package game

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	pbevents "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"

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
	svc := NewService(db, outbox, noWake{}, testRetry(t), nil)
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
	svc := NewService(db, &capturingOutbox{}, noWake{}, testRetry(t), nil)

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
	svc := NewService(db, &capturingOutbox{}, noWake{}, noRetry(), nil)
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
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t), nil)
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
	w := newSettlementWriter(rec.record, nil, retry)
	w.after = waits.after
	w.settle(uuid.New(), &types.FormattedMatchData{}, newSettlementIDs(uuid.New(), uuid.NewString()), nil)
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
	w := newSettlementWriter(rec.record, nil, testRetry(t))
	w.drain()

	w.settleLater(uuid.New(), &types.FormattedMatchData{}, newSettlementIDs(uuid.New(), uuid.NewString()), nil)
	w.settle(uuid.New(), &types.FormattedMatchData{}, newSettlementIDs(uuid.New(), uuid.NewString()), nil)
	w.drain()

	assert.Empty(t, rec.calls, "nothing is written once the pod is going away")
	assert.Len(t, errs.records, 2, "each refused settlement is logged")
}

// recordingApplier stands in for items-service's ApplySettlement: it fails its
// first `failures` calls as unavailable (or with `refusal`, when set) and
// records each request.
type recordingApplier struct {
	failures int
	refusal  error

	mu    sync.Mutex
	calls []*pbitems.ApplySettlementRequest
}

func (a *recordingApplier) ApplySettlement(_ context.Context, req *pbitems.ApplySettlementRequest) (*pbitems.ApplySettlementResponse, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.calls = append(a.calls, req)
	if len(a.calls) <= a.failures {
		if a.refusal != nil {
			return nil, a.refusal
		}
		return nil, status.Error(codes.Unavailable, "items down")
	}
	return &pbitems.ApplySettlementResponse{}, nil
}

func (a *recordingApplier) requests() []*pbitems.ApplySettlementRequest {
	a.mu.Lock()
	defer a.mu.Unlock()
	return slices.Clone(a.calls)
}

// After a settlement commits it is applied in items-service at once, under its
// items.extracted row id and with the payload committed, and confirmed once
// that succeeds; a failed apply is retried. FS-GV8WN §D R13, I-GV8WN-8.
func TestSettlementWriter_Committed_AppliedUnderItsRowIDThenConfirmed(t *testing.T) {
	event := &pbevents.ItemsExtractedEvent{SessionId: uuid.NewString(), Partial: true}
	payload, err := proto.Marshal(event)
	require.NoError(t, err)
	ids := newSettlementIDs(uuid.New(), uuid.NewString())
	applier := &recordingApplier{failures: 1}
	w := newSettlementWriter((&failingRecord{}).record, applier, testRetry(t))
	w.after = (&recordingWaits{}).after

	var confirmed atomic.Int32
	w.settleLater(uuid.New(), &types.FormattedMatchData{ItemsExtractedEvent: payload}, ids, func() { confirmed.Add(1) })
	w.drain()

	requests := applier.requests()
	require.Len(t, requests, 2, "a failed apply is tried again")
	assert.Equal(t, ids.ItemsExtracted.String(), requests[1].GetEventId(), "the row id, which consumers dedup on")
	assert.True(t, proto.Equal(event, requests[1].GetEvent()), "the committed payload")
	assert.EqualValues(t, 1, confirmed.Load(), "confirmed once applied")
}

// A settlement whose write never commits is never applied nor confirmed.
func TestSettlementWriter_NeverRecorded_NeitherAppliedNorConfirmed(t *testing.T) {
	applier := &recordingApplier{}
	w := newSettlementWriter((&failingRecord{failures: 1 << 30}).record, applier, noRetry())

	confirmed := false
	w.settleLater(uuid.New(), &types.FormattedMatchData{}, newSettlementIDs(uuid.New(), uuid.NewString()), func() { confirmed = true })
	w.drain()

	assert.Empty(t, applier.requests())
	assert.False(t, confirmed)
}

// A settlement items-service refuses for good (a malformed request) is not
// asked again, and never confirmed: its recorded copy lands it. FS-GV8WN R11.
func TestSettlementWriter_ApplyRefused_NotRetriedNorConfirmed(t *testing.T) {
	payload, err := proto.Marshal(&pbevents.ItemsExtractedEvent{SessionId: uuid.NewString()})
	require.NoError(t, err)
	applier := &recordingApplier{failures: 1 << 30, refusal: status.Error(codes.InvalidArgument, "malformed")}
	w := newSettlementWriter((&failingRecord{}).record, applier, testRetry(t))
	w.after = (&recordingWaits{}).after

	confirmed := false
	w.settleLater(uuid.New(), &types.FormattedMatchData{ItemsExtractedEvent: payload}, newSettlementIDs(uuid.New(), uuid.NewString()), func() { confirmed = true })
	w.drain()

	assert.Len(t, applier.requests(), 1, "asked once")
	assert.False(t, confirmed)
}
