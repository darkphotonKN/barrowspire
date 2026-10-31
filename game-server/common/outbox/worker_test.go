package outbox

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	"github.com/google/uuid"
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

// fakeRetriever always returns the same pending rows and never marks them published,
// so successive ticks see the same rows (as during a slow mark-published retry).
// marks are recorded, and a mark on a done ctx fails like a real db call would.
type fakeRetriever struct {
	rows []*OutboxEvent

	mu     sync.Mutex
	marked map[uuid.UUID]bool
}

func (r *fakeRetriever) GetPendingOutboxItems(_ context.Context, _ *int) ([]*OutboxEvent, error) {
	return r.rows, nil
}

func (r *fakeRetriever) UpdateOutboxToPublished(ctx context.Context, id uuid.UUID) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.marked == nil {
		r.marked = map[uuid.UUID]bool{}
	}
	r.marked[id] = true
	return nil
}

func (r *fakeRetriever) isMarked(id uuid.UUID) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.marked[id]
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

func TestPublishOutboxEvents_StampsMessageIdWithRowId(t *testing.T) {
	tests := []struct {
		name     string
		rows     []*OutboxEvent
		failRows []int // indexes of rows whose publish fails
	}{
		{name: "one row", rows: []*OutboxEvent{newRow("items.extracted")}},
		{name: "several rows", rows: []*OutboxEvent{newRow("items.extracted"), newRow("game.match.ended"), newRow("other")}},
		{
			name:     "publish error on one row leaves others' ids intact",
			rows:     []*OutboxEvent{newRow("items.extracted"), newRow("game.match.ended"), newRow("other")},
			failRows: []int{1},
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

			if len(pub.attempts) != len(tt.rows) {
				t.Fatalf("publish attempts = %d, want %d", len(pub.attempts), len(tt.rows))
			}
			for i, row := range tt.rows {
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
			name:     "failed publish is not marked",
			rows:     []*OutboxEvent{newRow("account.created"), newRow("items.extracted"), newRow("other")},
			failRows: []int{1},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			failed := map[int]bool{}
			pub := &fakePublisher{failFor: map[string]bool{}}
			for _, i := range tt.failRows {
				failed[i] = true
				pub.failFor[tt.rows[i].ID.String()] = true
			}
			ret := &fakeRetriever{rows: tt.rows}
			w := NewOutboxWorker(time.Second, 20, ret, pub, &sync.WaitGroup{})

			// mirror Run: a per-cycle ctx that is cancelled as soon as the cycle returns
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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
