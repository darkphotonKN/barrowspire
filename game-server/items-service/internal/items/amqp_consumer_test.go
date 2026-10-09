package items

import (
	"context"
	"errors"
	"fmt"
	"net"
	"syscall"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/lib/pq"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/protobuf/proto"
)

type fakeExtractor struct {
	err   error
	calls int
}

func (f *fakeExtractor) ProcessItemsExtracted(ctx context.Context, req *pb.ItemsExtractedEvent) error {
	f.calls++
	return f.err
}

// fakeDedup holds dedup keys in memory, as the redis lock does.
type fakeDedup struct {
	held       map[string]string
	acquireErr error
}

func (d *fakeDedup) AcquireLock(ctx context.Context, key string, ttl time.Duration) (string, bool, error) {
	if d.acquireErr != nil {
		return "", false, d.acquireErr
	}
	if _, ok := d.held[key]; ok {
		return "", false, nil
	}
	id := fmt.Sprintf("lock-%d", len(d.held))
	d.held[key] = id
	return id, true, nil
}

func (d *fakeDedup) ReleaseLock(ctx context.Context, key, lockID string) error {
	if d.held[key] != lockID {
		return errors.New("lock not held")
	}
	delete(d.held, key)
	return nil
}

func extractedBody(t *testing.T) []byte {
	t.Helper()
	body, err := proto.Marshal(&pb.ItemsExtractedEvent{EventId: "evt-1"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return body
}

// Only a stored (or already stored) event is acked. A failure that is not the
// event's own fault — a transient or unclassified store failure, a held row
// lock, the dedup store down — retries it after a delay; only a malformed event
// or one the store refuses is rejected to the DLQ (FS-4R9M9 R49).
func TestHandleItemsExtracted_Settles(t *testing.T) {
	refused := &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
	tests := []struct {
		name       string
		body       []byte
		processErr error
		acquireErr error
		want       disposition
	}{
		{name: "stored", want: ack},
		{name: "transient store failure", processErr: fmt.Errorf("store: %w", commonconstants.ErrTransient), want: retry},
		{name: "row lock held elsewhere", processErr: fmt.Errorf("store: %w", commonconstants.ErrLockUnavailable), want: retry},
		{name: "connection refused", processErr: fmt.Errorf("store: %w", refused), want: retry},
		{name: "admin shutdown 57P01", processErr: fmt.Errorf("store: %w", &pq.Error{Code: "57P01"}), want: retry},
		{name: "unclassified", processErr: errors.New("boom"), want: retry},
		{name: "dedup store down", acquireErr: errors.New("redis down"), want: retry},
		{name: "store refused the batch", processErr: fmt.Errorf("store: %w", commonconstants.ErrConstraintViolation), want: reject},
		{name: "malformed member id", processErr: fmt.Errorf("member: %w", commonconstants.ErrUUIDCouldNotBeParsed), want: reject},
		{name: "invalid input", processErr: fmt.Errorf("store: %w", commonconstants.ErrInvalidInput), want: reject},
		{name: "unreadable event", body: []byte{0xff, 0xff, 0xff}, want: reject},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := tt.body
			if body == nil {
				body = extractedBody(t)
			}
			c := &Consumer{
				service: &fakeExtractor{err: tt.processErr},
				dedup:   &fakeDedup{held: map[string]string{}, acquireErr: tt.acquireErr},
			}
			if got := c.handleItemsExtracted(context.Background(), body); got != tt.want {
				t.Errorf("disposition = %v, want %v", got, tt.want)
			}
		})
	}
}

// A retried event is processed again when it comes back, not acked as a
// duplicate; a stored one is.
func TestHandleItemsExtracted_RedeliveryAfterFailureIsProcessed(t *testing.T) {
	extractor := &fakeExtractor{err: commonconstants.ErrTransient}
	c := &Consumer{service: extractor, dedup: &fakeDedup{held: map[string]string{}}}
	body := extractedBody(t)

	if got := c.handleItemsExtracted(context.Background(), body); got != retry {
		t.Fatalf("first delivery = %v, want retry", got)
	}
	extractor.err = nil
	if got := c.handleItemsExtracted(context.Background(), body); got != ack {
		t.Fatalf("redelivery = %v, want ack", got)
	}
	if extractor.calls != 2 {
		t.Errorf("processed %d times, want 2", extractor.calls)
	}
	if got := c.handleItemsExtracted(context.Background(), body); got != ack || extractor.calls != 2 {
		t.Errorf("duplicate after success = %v with %d calls, want ack without processing", got, extractor.calls)
	}
}

// A rejected event leaves no dedup mark behind, so replaying it from the DLQ
// after a fix stores it instead of skipping it as a duplicate.
func TestHandleItemsExtracted_RejectReleasesDedupMark(t *testing.T) {
	dedup := &fakeDedup{held: map[string]string{}}
	c := &Consumer{service: &fakeExtractor{err: commonconstants.ErrConstraintViolation}, dedup: dedup}

	if got := c.handleItemsExtracted(context.Background(), extractedBody(t)); got != reject {
		t.Fatalf("disposition = %v, want reject", got)
	}
	if len(dedup.held) != 0 {
		t.Fatalf("dedup marks %v left behind after a rejected event", dedup.held)
	}
}

// fakeAcknowledger records how a delivery was settled.
type fakeAcknowledger struct {
	acks, nacks int
	requeued    bool
}

func (f *fakeAcknowledger) Ack(tag uint64, multiple bool) error { f.acks++; return nil }
func (f *fakeAcknowledger) Nack(tag uint64, multiple, requeue bool) error {
	f.nacks++
	f.requeued = requeue
	return nil
}
func (f *fakeAcknowledger) Reject(tag uint64, requeue bool) error {
	f.nacks++
	f.requeued = requeue
	return nil
}

type published struct {
	exchange, key string
	msg           amqp.Publishing
}

// fakePublisher records every message forwarded to a retry queue.
type fakePublisher struct {
	sent []published
	err  error
}

func (f *fakePublisher) PublishWithContext(ctx context.Context, exchange, key string, mandatory, immediate bool, msg amqp.Publishing) error {
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, published{exchange, key, msg})
	return nil
}

func delivery(ack *fakeAcknowledger, headers amqp.Table) amqp.Delivery {
	return amqp.Delivery{Acknowledger: ack, Headers: headers, Body: []byte("loot"), DeliveryTag: 7}
}

// A stored event is acked exactly once; a rejected one is nacked without
// requeue, so the queue's dead-letter exchange parks it in the DLQ rather than
// discarding every player's loot.
func TestSettle_AckAndReject(t *testing.T) {
	tests := []struct {
		name      string
		d         disposition
		wantAcks  int
		wantNacks int
	}{
		{"stored acked once", ack, 1, 0},
		{"rejected dead-lettered", reject, 0, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pub := &fakePublisher{}
			c := &Consumer{retries: pub}
			acker := &fakeAcknowledger{}

			c.settle(context.Background(), delivery(acker, nil), tt.d)

			if acker.acks != tt.wantAcks || acker.nacks != tt.wantNacks || acker.requeued {
				t.Fatalf("settled %+v, want %d acks %d nacks never requeued", acker, tt.wantAcks, tt.wantNacks)
			}
			if len(pub.sent) != 0 {
				t.Fatalf("forwarded %v, want nothing", pub.sent)
			}
		})
	}
}

// A retry never requeues in place: the event waits out a delay in the next
// retry queue, whose TTL dead-letters it back to the work queue, and the delay
// stops growing at the last step, so an outage of any length is waited out
// without a hot loop.
func TestSettle_Retry_ForwardsWithBackoff(t *testing.T) {
	last := len(retryDelays) - 1
	tests := []struct {
		name      string
		headers   amqp.Table
		wantQueue string
		wantCount int32
	}{
		{"first failure", nil, retryQueueName(0), 1},
		{"second failure", amqp.Table{retryCountHeader: int32(1)}, retryQueueName(1), 2},
		{"past the last step stays at it", amqp.Table{retryCountHeader: int64(last + 5)}, retryQueueName(last), int32(last + 6)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pub := &fakePublisher{}
			c := &Consumer{retries: pub}
			acker := &fakeAcknowledger{}

			c.settle(context.Background(), delivery(acker, tt.headers), retry)

			if len(pub.sent) != 1 {
				t.Fatalf("forwarded %d messages, want 1", len(pub.sent))
			}
			got := pub.sent[0]
			if got.exchange != "" || got.key != tt.wantQueue {
				t.Fatalf("forwarded to %q/%q, want default exchange/%q", got.exchange, got.key, tt.wantQueue)
			}
			if got.msg.Headers[retryCountHeader] != tt.wantCount {
				t.Fatalf("retry count %v, want %d", got.msg.Headers[retryCountHeader], tt.wantCount)
			}
			if string(got.msg.Body) != "loot" || got.msg.DeliveryMode != amqp.Persistent {
				t.Fatalf("forwarded %+v, want the same body, persistent", got.msg)
			}
			if acker.acks != 1 || acker.nacks != 0 {
				t.Fatalf("original settled %+v, want acked once after the forward", acker)
			}
		})
	}
}

// If the retry cannot be forwarded the broker is in trouble; the original goes
// back to its queue rather than being lost.
func TestSettle_Retry_ForwardFails_ReturnsToQueue(t *testing.T) {
	c := &Consumer{retries: &fakePublisher{err: errors.New("channel closed")}}
	acker := &fakeAcknowledger{}

	c.settle(context.Background(), delivery(acker, nil), retry)

	if acker.acks != 0 || acker.nacks != 1 || !acker.requeued {
		t.Fatalf("settled %+v, want one nack with requeue", acker)
	}
}

// Every retry delay is bounded and grows.
func TestRetryDelays_BoundedAndIncreasing(t *testing.T) {
	if len(retryDelays) == 0 {
		t.Fatal("no retry delays")
	}
	for i, d := range retryDelays {
		if d <= 0 || d > 10*time.Minute {
			t.Fatalf("delay %d = %v, want within (0, 10m]", i, d)
		}
		if i > 0 && d <= retryDelays[i-1] {
			t.Fatalf("delay %d = %v does not grow past %v", i, d, retryDelays[i-1])
		}
	}
}

type declaredQueue struct {
	durable bool
	args    amqp.Table
}

// fakeTopology records what the consumer declares on the broker.
type fakeTopology struct {
	exchanges []string
	queues    map[string]declaredQueue
	bindings  map[string]string // queue -> exchange/key
}

func (f *fakeTopology) ExchangeDeclare(name, kind string, durable, autoDelete, internal, noWait bool, args amqp.Table) error {
	f.exchanges = append(f.exchanges, name)
	return nil
}

func (f *fakeTopology) QueueDeclare(name string, durable, autoDelete, exclusive, noWait bool, args amqp.Table) (amqp.Queue, error) {
	f.queues[name] = declaredQueue{durable: durable, args: args}
	return amqp.Queue{Name: name}, nil
}

func (f *fakeTopology) QueueBind(name, key, exchange string, noWait bool, args amqp.Table) error {
	f.bindings[name] = exchange + "/" + key
	return nil
}

// The work queue dead-letters rejects to its DLQ, is bound to items.extracted,
// and each delay queue dead-letters back into it after its TTL — straight
// through the default exchange, never game.events, so no other subscriber sees
// a retry. The arg-less legacy queue is never redeclared: a durable queue's
// arguments cannot change in place, and the PRECONDITION_FAILED would close the
// channel the service also publishes on.
func TestDeclareExtractedTopology(t *testing.T) {
	topo := &fakeTopology{queues: map[string]declaredQueue{}, bindings: map[string]string{}}

	if err := declareExtractedTopology(topo); err != nil {
		t.Fatalf("declare: %v", err)
	}

	if extractedQueue == commonconstants.ItemsGameItemsExtractedQueue {
		t.Fatalf("work queue reuses the legacy arg-less queue name %q", extractedQueue)
	}
	if _, ok := topo.queues[commonconstants.ItemsGameItemsExtractedQueue]; ok {
		t.Fatalf("redeclared the legacy queue %q", commonconstants.ItemsGameItemsExtractedQueue)
	}

	work, ok := topo.queues[extractedQueue]
	if !ok || !work.durable {
		t.Fatalf("work queue %q not declared durable: %+v", extractedQueue, topo.queues)
	}
	if work.args["x-dead-letter-exchange"] != "" || work.args["x-dead-letter-routing-key"] != deadLetterQueue {
		t.Fatalf("work queue args %v, want dead-lettering to %q", work.args, deadLetterQueue)
	}
	if want := commonconstants.GameEventsExchange + "/" + commonconstants.ItemsExtracted; topo.bindings[extractedQueue] != want {
		t.Fatalf("work queue bound to %q, want %q", topo.bindings[extractedQueue], want)
	}
	if dlq, ok := topo.queues[deadLetterQueue]; !ok || !dlq.durable {
		t.Fatalf("DLQ %q not declared durable", deadLetterQueue)
	}

	for step, delay := range retryDelays {
		q, ok := topo.queues[retryQueueName(step)]
		if !ok || !q.durable {
			t.Fatalf("retry queue %q not declared durable", retryQueueName(step))
		}
		if q.args["x-message-ttl"] != int32(delay/time.Millisecond) ||
			q.args["x-dead-letter-exchange"] != "" ||
			q.args["x-dead-letter-routing-key"] != extractedQueue {
			t.Fatalf("retry queue %q args %v, want ttl %v back to %q", retryQueueName(step), q.args, delay, extractedQueue)
		}
		if _, bound := topo.bindings[retryQueueName(step)]; bound {
			t.Fatalf("retry queue %q is bound to an exchange", retryQueueName(step))
		}
	}
}
