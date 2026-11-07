package outbox

import (
	"context"
	"errors"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type publishedMessage struct {
	exchange string
	key      string
	msg      commonbroker.Message
}

// fakePublisher records every publish attempt and fails for row ids listed in failFor.
type fakePublisher struct {
	mu       sync.Mutex
	failFor  map[string]bool
	attempts []publishedMessage
}

func (p *fakePublisher) PublishWithContext(_ context.Context, exchange, key string, msg commonbroker.Message) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.attempts = append(p.attempts, publishedMessage{exchange: exchange, key: key, msg: msg})
	if p.failFor[msg.MessageId] {
		return errors.New("broker unavailable")
	}
	return nil
}

func (p *fakePublisher) messageIds() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	ids := make([]string, 0, len(p.attempts))
	for _, a := range p.attempts {
		ids = append(ids, a.msg.MessageId)
	}
	return ids
}

// fakeRetriever hands the same pending rows to every batch and records the ids
// the batch reports as sent as marked, so successive ticks see the same rows
// (as when a commit failed). A mark on a done ctx fails like a real db call
// would. Each batch's time left before its deadline is recorded.
type fakeRetriever struct {
	rows []*OutboxEvent

	mu       sync.Mutex
	marked   map[uuid.UUID]bool
	timeLeft []time.Duration
	batchCtx context.Context
	backlogs []backlogRead
}

// backlogRead is what a backlog read saw: whether its own ctx was live, and
// whether the batch before it had already ended.
type backlogRead struct {
	ownCtxLive   bool
	batchCtxDone bool
}

func (r *fakeRetriever) RelayPendingBatch(ctx context.Context, _ *int, handle BatchHandler) (int, error) {
	r.mu.Lock()
	r.batchCtx = ctx
	if deadline, ok := ctx.Deadline(); ok {
		r.timeLeft = append(r.timeLeft, time.Until(deadline))
	} else {
		r.timeLeft = append(r.timeLeft, 0)
	}
	r.mu.Unlock()

	if len(r.rows) == 0 {
		return 0, nil
	}
	sent := handle(ctx, r.rows)
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.marked == nil {
		r.marked = map[uuid.UUID]bool{}
	}
	for _, id := range sent {
		r.marked[id] = true
	}
	return len(sent), nil
}

func (r *fakeRetriever) GetBacklog(ctx context.Context) (Backlog, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	read := backlogRead{ownCtxLive: ctx.Err() == nil}
	if r.batchCtx != nil {
		read.batchCtxDone = r.batchCtx.Err() != nil
	}
	r.backlogs = append(r.backlogs, read)
	return Backlog{Rows: len(r.rows)}, nil
}

func (r *fakeRetriever) backlogReads() []backlogRead {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]backlogRead(nil), r.backlogs...)
}

func (r *fakeRetriever) isMarked(id uuid.UUID) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.marked[id]
}

func (r *fakeRetriever) batchTimeLeft() []time.Duration {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]time.Duration(nil), r.timeLeft...)
}

func newRow(key string) *OutboxEvent {
	return &OutboxEvent{
		ID:         uuid.New(),
		RoutingKey: key,
		Exchange:   "game.events",
		Payload:    []byte(key + "-payload"),
		CreatedAt:  time.Now(),
	}
}

// Every row is published under its own id as MessageId. A failed publish ends
// the batch at that row: the rows after it are not attempted (ADR-0069
// §Decision 3).
func TestPublishOutboxEvents_StampsMessageIdWithRowId(t *testing.T) {
	tests := []struct {
		name         string
		rows         []*OutboxEvent
		failRows     []int // indexes of rows whose publish fails
		wantAttempts int
	}{
		{name: "one row", rows: []*OutboxEvent{newRow("items.extracted")}, wantAttempts: 1},
		{name: "several rows", rows: []*OutboxEvent{newRow("items.extracted"), newRow("game.match.ended"), newRow("other")}, wantAttempts: 3},
		{
			name:         "publish error on one row stops the batch there, earlier ids intact",
			rows:         []*OutboxEvent{newRow("items.extracted"), newRow("game.match.ended"), newRow("other")},
			failRows:     []int{1},
			wantAttempts: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pub := &fakePublisher{failFor: map[string]bool{}}
			for _, i := range tt.failRows {
				pub.failFor[tt.rows[i].ID.String()] = true
			}
			w := NewOutboxWorker(time.Second, 20, &fakeRetriever{rows: tt.rows}, pub, &sync.WaitGroup{})

			if err := w.PublishOutboxEvents(context.Background()); err != nil {
				t.Fatalf("PublishOutboxEvents() error = %v", err)
			}

			if len(pub.attempts) != tt.wantAttempts {
				t.Fatalf("publish attempts = %d, want %d", len(pub.attempts), tt.wantAttempts)
			}
			for i, row := range tt.rows[:tt.wantAttempts] {
				got := pub.attempts[i]
				if got.msg.MessageId != row.ID.String() {
					t.Errorf("row %d MessageId = %q, want %q", i, got.msg.MessageId, row.ID.String())
				}
				if got.key != row.RoutingKey || got.exchange != row.Exchange || string(got.msg.Body) != string(row.Payload) {
					t.Errorf("row %d published to %s/%s with body %q, want %s/%s with %q",
						i, got.exchange, got.key, got.msg.Body, row.Exchange, row.RoutingKey, row.Payload)
				}
			}
		})
	}
}

func TestPublishOutboxEvents_SameRowOnTwoTicks_SameMessageId(t *testing.T) {
	row := newRow("items.extracted")
	pub := &fakePublisher{failFor: map[string]bool{}}
	w := NewOutboxWorker(time.Second, 20, &fakeRetriever{rows: []*OutboxEvent{row}}, pub, &sync.WaitGroup{})

	for tick := 0; tick < 2; tick++ {
		if err := w.PublishOutboxEvents(context.Background()); err != nil {
			t.Fatalf("tick %d: PublishOutboxEvents() error = %v", tick, err)
		}
	}

	ids := pub.messageIds()
	if len(ids) != 2 {
		t.Fatalf("publish attempts = %d, want 2", len(ids))
	}
	if ids[0] != row.ID.String() || ids[1] != ids[0] {
		t.Errorf("MessageIds across ticks = %v, want both %q", ids, row.ID.String())
	}
}

func TestPublishOutboxEvents_MarksPublishedBeforeCallerCancels(t *testing.T) {
	tests := []struct {
		name     string
		rows     []*OutboxEvent
		failRows []int // indexes of rows whose publish fails
	}{
		{name: "one row", rows: []*OutboxEvent{newRow("account.created")}},
		{name: "several rows", rows: []*OutboxEvent{newRow("account.created"), newRow("items.extracted"), newRow("other")}},
		{
			name:     "a failed publish and the rows after it are not marked",
			rows:     []*OutboxEvent{newRow("account.created"), newRow("items.extracted"), newRow("other")},
			failRows: []int{1},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			failed := map[int]bool{}
			pub := &fakePublisher{failFor: map[string]bool{}}
			for _, i := range tt.failRows {
				pub.failFor[tt.rows[i].ID.String()] = true
				for j := i; j < len(tt.rows); j++ {
					failed[j] = true
				}
			}
			ret := &fakeRetriever{rows: tt.rows}
			w := NewOutboxWorker(time.Second, 20, ret, pub, &sync.WaitGroup{})

			// mirror Run: a per-cycle ctx that is cancelled as soon as the cycle returns
			ctx, cancel := context.WithTimeout(context.Background(), batchTimeout)
			if err := w.PublishOutboxEvents(ctx); err != nil {
				cancel()
				t.Fatalf("PublishOutboxEvents() error = %v", err)
			}
			cancel()

			for i, row := range tt.rows {
				if got, want := ret.isMarked(row.ID), !failed[i]; got != want {
					t.Errorf("row %d marked published = %v, want %v", i, got, want)
				}
			}
		})
	}
}

// A wake drains the outbox at once, without waiting for the next tick: the
// cycle here is an hour, so only the wake can have published the row.
func TestRun_Wake_PublishesWithoutWaitingForTheTick(t *testing.T) {
	row := newRow("items.extracted")
	pub := &fakePublisher{failFor: map[string]bool{}}
	ret := &fakeRetriever{rows: []*OutboxEvent{row}}
	wg := &sync.WaitGroup{}
	wg.Add(1)
	w := NewOutboxWorker(time.Hour, 20, ret, pub, wg)

	ctx, cancel := context.WithCancel(context.Background())
	go w.Run(ctx)
	t.Cleanup(func() {
		cancel()
		wg.Wait()
	})

	w.Wake()

	deadline := time.After(2 * time.Second)
	for !ret.isMarked(row.ID) {
		select {
		case <-deadline:
			t.Fatalf("row not published within 2s of a wake; attempts = %v", pub.messageIds())
		case <-time.After(5 * time.Millisecond):
		}
	}
}

// Run gives every batch a 5 s deadline, so a stalled broker holds a pooled
// connection and the batch's row locks for about 5 s at most. ADR-0069
// §Decision 4, I-ADR0069-1.
func TestRun_EachBatch_HasAFiveSecondDeadline(t *testing.T) {
	ret := &fakeRetriever{rows: []*OutboxEvent{newRow("items.extracted")}}
	wg := &sync.WaitGroup{}
	wg.Add(1)
	w := NewOutboxWorker(time.Hour, 20, ret, &fakePublisher{failFor: map[string]bool{}}, wg)

	ctx, cancel := context.WithCancel(context.Background())
	go w.Run(ctx)
	t.Cleanup(func() {
		cancel()
		wg.Wait()
	})
	w.Wake()

	deadline := time.After(2 * time.Second)
	for len(ret.batchTimeLeft()) == 0 {
		select {
		case <-deadline:
			t.Fatal("no batch ran within 2s of a wake")
		case <-time.After(5 * time.Millisecond):
		}
	}
	left := ret.batchTimeLeft()[0]
	if left <= 4*time.Second || left > 5*time.Second {
		t.Errorf("batch deadline = %s from the start of the batch, want 5s", left)
	}
}

// The backlog is read under a context of its own once the batch has ended, so
// a batch that used up its deadline does not leave the gauges stale.
func TestRun_Backlog_ReadUnderItsOwnContextAfterTheBatch(t *testing.T) {
	ret := &fakeRetriever{rows: []*OutboxEvent{newRow("items.extracted")}}
	wg := &sync.WaitGroup{}
	wg.Add(1)
	w := NewOutboxWorker(time.Hour, 20, ret, &fakePublisher{failFor: map[string]bool{}}, wg)

	ctx, cancel := context.WithCancel(context.Background())
	go w.Run(ctx)
	t.Cleanup(func() {
		cancel()
		wg.Wait()
	})
	w.Wake()

	deadline := time.After(2 * time.Second)
	for len(ret.backlogReads()) == 0 {
		select {
		case <-deadline:
			t.Fatal("no backlog read within 2s of a wake")
		case <-time.After(5 * time.Millisecond):
		}
	}
	read := ret.backlogReads()[0]
	if !read.ownCtxLive || !read.batchCtxDone {
		t.Errorf("backlog read = %+v, want its own live ctx after the batch ctx ended", read)
	}
}

// A batch never starts a publish once its time is nearly up: with less than
// the commit margin left, or the context already done, it stops and keeps
// what it sent. The default margin is 1 s of the 5 s batch. ADR-0069
// §Decision 4.
func TestPublishOutboxEvents_TooLittleTimeLeft_PublishesNothingMore(t *testing.T) {
	if got := NewOutboxWorker(time.Second, 20, &fakeRetriever{}, &fakePublisher{}, &sync.WaitGroup{}).commitMargin; got != time.Second {
		t.Fatalf("default commit margin = %s, want 1s", got)
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	nearlyUp, cancelNearlyUp := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancelNearlyUp()

	tests := []struct {
		name string
		ctx  context.Context
	}{
		{"context already done", cancelled},
		{"less than the margin left", nearlyUp},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows := []*OutboxEvent{newRow("a"), newRow("b")}
			pub := &fakePublisher{failFor: map[string]bool{}}
			w := NewOutboxWorker(time.Second, 20, &fakeRetriever{rows: rows}, pub, &sync.WaitGroup{})

			_ = w.PublishOutboxEvents(tt.ctx)

			if n := len(pub.messageIds()); n != 0 {
				t.Errorf("publishes = %d, want 0", n)
			}
		})
	}
}

// slowPublisher is a broker that is slow, not stalled: every publish returns,
// after d. Sends are counted per row id.
type slowPublisher struct {
	d     time.Duration
	mu    sync.Mutex
	sends map[string]int
}

func (p *slowPublisher) PublishWithContext(_ context.Context, _, _ string, msg commonbroker.Message) error {
	time.Sleep(p.d)
	p.mu.Lock()
	defer p.mu.Unlock()
	p.sends[msg.MessageId]++
	return nil
}

// A slow broker still drains the outbox: each batch stops publishing with
// the commit margin left and commits what it sent, so every tick makes
// progress and no committed row is sent again. Scaled 1:5 from production
// (5 s batch, 1 s margin, 300 ms a publish). Before the margin, every batch
// overran its deadline, rolled back and resent the same rows forever.
// ADR-0069 §Decision 4, fix round 1 HIGH-1.
func TestPublishOutboxEvents_SlowBroker_EveryBatchCommitsAndTheOutboxDrains(t *testing.T) {
	const (
		batchDeadline = time.Second
		margin        = 200 * time.Millisecond
		perPublish    = 60 * time.Millisecond
		rows          = 40
		batchSize     = 20
		maxTicks      = 10
	)
	db := outboxDB(t)
	ids := seedRows(t, db, rows)
	pub := &slowPublisher{d: perPublish, sends: map[string]int{}}
	w := NewOutboxWorker(time.Second, batchSize, NewService(NewRepo(db)), pub, &sync.WaitGroup{})
	w.commitMargin = margin

	pending := rows
	for tick := 1; pending > 0; tick++ {
		require.LessOrEqual(t, tick, maxTicks, "the outbox did not drain in %d ticks", maxTicks)
		ctx, cancel := context.WithTimeout(context.Background(), batchDeadline)
		start := time.Now()
		err := w.PublishOutboxEvents(ctx)
		took := time.Since(start)
		cancel()
		require.NoError(t, err, "tick %d", tick)

		now := len(pendingRows(t, db))
		t.Logf("tick %d: took %s, committed %d, pending %d", tick, took.Round(time.Millisecond), pending-now, now)
		require.Less(t, now, pending, "tick %d commits rows", tick)
		require.Less(t, took, batchDeadline, "tick %d ends before its deadline", tick)
		pending = now
	}

	total := 0
	for _, id := range ids {
		require.Equal(t, 1, pub.sends[id.String()], "row %s sent once", id)
		total += pub.sends[id.String()]
	}
	t.Logf("%d rows drained with %d sends", rows, total)
}

// Wake never blocks its caller, whether the worker is running or not: rings
// past the first one waiting are folded into it.
func TestWake_NeverBlocks(t *testing.T) {
	w := NewOutboxWorker(time.Hour, 20, &fakeRetriever{}, &fakePublisher{}, &sync.WaitGroup{})

	done := make(chan struct{})
	go func() {
		for range 100 {
			w.Wake()
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Wake blocked with no worker running")
	}
}

// countingPublisher counts every publish of a row id across all the workers
// that share it, and which worker sent it. Each publish yields so the two
// workers' batches interleave the way two replicas' do.
type countingPublisher struct {
	mu       sync.Mutex
	sends    map[string]int
	byWorker map[int]int
}

func newCountingPublisher() *countingPublisher {
	return &countingPublisher{sends: map[string]int{}, byWorker: map[int]int{}}
}

func (p *countingPublisher) forWorker(worker int) commonbroker.Publisher {
	return workerPublisher{p: p, worker: worker}
}

type workerPublisher struct {
	p      *countingPublisher
	worker int
}

func (w workerPublisher) PublishWithContext(_ context.Context, _, _ string, msg commonbroker.Message) error {
	w.p.mu.Lock()
	w.p.sends[msg.MessageId]++
	w.p.byWorker[w.worker]++
	w.p.mu.Unlock()
	runtime.Gosched()
	return nil
}

// Two relays on one outbox, each with its own 2-connection pool (two replicas
// of a service, as postgres sees them), drain the same rows at the same time
// over many rounds. No row is published twice, every row is marked, and both
// relays took rows, so the race was run rather than avoided. ADR-0069
// §Decision 2, I-ADR0069-2.
func TestPublishOutboxEvents_TwoWorkersOneOutbox_NeverPublishTheSameRow(t *testing.T) {
	const (
		workers      = 2
		rounds       = 50
		rowsPerRound = 200
		batchSize    = 20 // what the services run with
	)
	dsn := outboxDSN(t)
	seeder := openPool(t, dsn, 1)

	pub := newCountingPublisher()
	relays := make([]*OutboxWorker, workers)
	for i := range relays {
		relays[i] = NewOutboxWorker(time.Second, batchSize, NewService(NewRepo(openPool(t, dsn, 2))), pub.forWorker(i), &sync.WaitGroup{})
	}

	// a relay that makes no progress must fail the test, not spin it forever:
	// draining a round takes about rowsPerRound/batchSize batches between them
	const maxBatchesPerRound = 10 * rowsPerRound / batchSize
	var stuck atomic.Int32

	var seeded []uuid.UUID
	sharedRounds := 0
	start := time.Now()
	for round := 0; round < rounds; round++ {
		seeded = append(seeded, seedRows(t, seeder, rowsPerRound)...)
		before := map[int]int{}
		pub.mu.Lock()
		for k, v := range pub.byWorker {
			before[k] = v
		}
		pub.mu.Unlock()

		var wg sync.WaitGroup
		go_ := make(chan struct{})
		for _, relay := range relays {
			wg.Add(1)
			go func(relay *OutboxWorker) {
				defer wg.Done()
				<-go_
				// no require here: FailNow must run on the test goroutine
				for batches := 0; ; batches++ {
					if batches == maxBatchesPerRound {
						stuck.Add(1)
						return
					}
					var pending int
					if err := seeder.Get(&pending, `SELECT count(*) FROM outbox WHERE published_at IS NULL`); err != nil || pending == 0 {
						return
					}
					_ = relay.PublishOutboxEvents(context.Background())
				}
			}(relay)
		}
		close(go_)
		wg.Wait()
		require.Zero(t, stuck.Load(), "round %d: a relay ran %d batches without draining the outbox", round, maxBatchesPerRound)

		pub.mu.Lock()
		if pub.byWorker[0] > before[0] && pub.byWorker[1] > before[1] {
			sharedRounds++
		}
		pub.mu.Unlock()
	}
	elapsed := time.Since(start)

	duplicates, dupSends := 0, 0
	for _, n := range pub.sends {
		if n > 1 {
			duplicates++
			dupSends += n - 1
		}
	}
	t.Logf("%d rounds x %d rows = %d rows, %d relays, batch %d: sends per relay %v, rows sent more than once %d (extra sends %d), rounds both relays took rows %d/%d, %s",
		rounds, rowsPerRound, len(seeded), workers, batchSize, pub.byWorker, duplicates, dupSends, sharedRounds, rounds, elapsed.Round(time.Millisecond))

	require.Len(t, pub.sends, len(seeded), "every row is published")
	for _, id := range seeded {
		require.Equal(t, 1, pub.sends[id.String()], "row %s published once", id)
	}
	assert.Empty(t, pendingRows(t, seeder), "every row is marked published")
	for i := 0; i < workers; i++ {
		assert.Positive(t, pub.byWorker[i], "relay %d took rows", i)
	}
}
