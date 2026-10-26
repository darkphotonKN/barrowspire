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
type fakeRetriever struct {
	rows []*OutboxEvent
}

func (r *fakeRetriever) GetPendingOutboxItems(_ context.Context, _ *int) ([]*OutboxEvent, error) {
	return r.rows, nil
}

func (r *fakeRetriever) UpdateOutboxToPublished(_ context.Context, _ uuid.UUID) error {
	return nil
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
