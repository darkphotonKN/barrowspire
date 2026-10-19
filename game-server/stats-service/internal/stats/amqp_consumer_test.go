package stats

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
	"github.com/google/uuid"
	"github.com/lib/pq"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/protobuf/proto"
)

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

func newFakeTopology() *fakeTopology {
	return &fakeTopology{queues: map[string]declaredQueue{}, bindings: map[string]string{}}
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

// The .v2 work queue dead-letters to its DLQ, is bound to match.ended on
// game.events, and each delay queue dead-letters back into it after its TTL
// through the default exchange, never game.events, so no other subscriber sees
// a retry. The arg-less legacy queue is neither declared nor bound: a durable
// queue's arguments cannot change in place, and the PRECONDITION_FAILED would
// close the channel the service also publishes on.
func TestDeclareMatchEndedTopology(t *testing.T) {
	topo := newFakeTopology()

	if err := declareMatchEndedTopology(topo); err != nil {
		t.Fatalf("declare: %v", err)
	}

	if matchEndedQueue != "stats.game.match.ended.v2" {
		t.Fatalf("work queue %q, want stats.game.match.ended.v2", matchEndedQueue)
	}
	if _, ok := topo.queues[commonconstants.StatsGameMatchEndedQueue]; ok {
		t.Fatalf("declared the legacy queue %q", commonconstants.StatsGameMatchEndedQueue)
	}
	if _, ok := topo.bindings[commonconstants.StatsGameMatchEndedQueue]; ok {
		t.Fatalf("bound the legacy queue %q", commonconstants.StatsGameMatchEndedQueue)
	}

	if len(topo.exchanges) != 1 || topo.exchanges[0] != commonconstants.GameEventsExchange {
		t.Fatalf("declared exchanges %v, want only %q", topo.exchanges, commonconstants.GameEventsExchange)
	}

	work, ok := topo.queues[matchEndedQueue]
	if !ok || !work.durable {
		t.Fatalf("work queue %q not declared durable: %+v", matchEndedQueue, topo.queues)
	}
	if work.args["x-dead-letter-exchange"] != "" || work.args["x-dead-letter-routing-key"] != matchEndedDLQ {
		t.Fatalf("work queue args %v, want dead-lettering to %q", work.args, matchEndedDLQ)
	}
	if matchEndedDLQ != matchEndedQueue+".dlq" {
		t.Fatalf("DLQ %q, want %q", matchEndedDLQ, matchEndedQueue+".dlq")
	}
	if want := commonconstants.GameEventsExchange + "/" + commonconstants.GameMatchEnded; topo.bindings[matchEndedQueue] != want {
		t.Fatalf("work queue bound to %q, want %q", topo.bindings[matchEndedQueue], want)
	}
	if dlq, ok := topo.queues[matchEndedDLQ]; !ok || !dlq.durable {
		t.Fatalf("DLQ %q not declared durable", matchEndedDLQ)
	}

	wantDelays := []time.Duration{5 * time.Second, 30 * time.Second, 2 * time.Minute}
	if len(retryDelays) != len(wantDelays) {
		t.Fatalf("retry delays %v, want %v", retryDelays, wantDelays)
	}
	for step, delay := range wantDelays {
		name := retryQueueName(step)
		if want := matchEndedQueue + ".retry-" + string(rune('1'+step)); name != want {
			t.Fatalf("retry queue %d named %q, want %q", step, name, want)
		}
		q, ok := topo.queues[name]
		if !ok || !q.durable {
			t.Fatalf("retry queue %q not declared durable", name)
		}
		if q.args["x-message-ttl"] != int32(delay/time.Millisecond) ||
			q.args["x-dead-letter-exchange"] != "" ||
			q.args["x-dead-letter-routing-key"] != matchEndedQueue {
			t.Fatalf("retry queue %q args %v, want ttl %v back to %q", name, q.args, delay, matchEndedQueue)
		}
		if _, bound := topo.bindings[name]; bound {
			t.Fatalf("retry queue %q is bound to an exchange", name)
		}
	}
}

// fakeMatchService stands in for the stats service behind the consumer.
type fakeMatchService struct {
	err       error
	calls     int
	eventID   uuid.UUID
	eventType string
}

func (f *fakeMatchService) ProcessMatchCompleted(ctx context.Context, eventID uuid.UUID, eventType string, req *pb.MatchEndedEvent) error {
	f.calls++
	f.eventID, f.eventType = eventID, eventType
	return f.err
}

func (f *fakeMatchService) UpdatePlayerRankings(ctx context.Context, updateData *pb.MemberProfileUpdatedEvent) error {
	return nil
}

func matchEndedBody(t *testing.T) []byte {
	t.Helper()
	body, err := proto.Marshal(&pb.MatchEndedEvent{SessionId: "550e8400-e29b-41d4-a716-446655440000"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return body
}

// A failure is classified, not retried blindly. A malformed event or one the
// store refuses is dead-lettered at once. A reference that is not there yet (a
// foreign key, a missing row) retries a bounded number of times. Anything else
// is the infrastructure's fault, not the event's, and retries without end.
func TestHandleMatchEnded_Classifies(t *testing.T) {
	refused := &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
	tests := []struct {
		name       string
		body       []byte
		processErr error
		want       disposition
		wantReason string
	}{
		{name: "processed", want: ack},
		{name: "already processed", processErr: fmt.Errorf("tx: %w", commonconstants.ErrAlreadyProcessed), want: ack},
		{name: "unreadable event", body: []byte{0xff, 0xff, 0xff}, want: reject, wantReason: dlqReasonMalformed},
		{name: "bad uuid", processErr: fmt.Errorf("member: %w", commonconstants.ErrUUIDCouldNotBeParsed), want: reject, wantReason: dlqReasonMalformed},
		{name: "constraint violation", processErr: fmt.Errorf("store: %w", commonconstants.ErrConstraintViolation), want: reject, wantReason: dlqReasonMalformed},
		{name: "invalid input", processErr: fmt.Errorf("store: %w", commonconstants.ErrInvalidInput), want: reject, wantReason: dlqReasonMalformed},
		{name: "foreign key violation 23503", processErr: fmt.Errorf("store: %w: %w", commonconstants.ErrConstraintViolation, &pq.Error{Code: "23503"}), want: retryBounded},
		{name: "missing reference", processErr: fmt.Errorf("store: %w", commonconstants.ErrNotFound), want: retryBounded},
		{name: "transient", processErr: fmt.Errorf("store: %w", commonconstants.ErrTransient), want: retry},
		{name: "deadlock 40P01", processErr: fmt.Errorf("store: %w", &pq.Error{Code: "40P01"}), want: retry},
		{name: "serialization 40001", processErr: fmt.Errorf("store: %w", &pq.Error{Code: "40001"}), want: retry},
		{name: "row lock timeout", processErr: fmt.Errorf("store: %w", commonconstants.ErrLockUnavailable), want: retry},
		{name: "connection refused", processErr: fmt.Errorf("store: %w", refused), want: retry},
		{name: "unclassified", processErr: errors.New("boom"), want: retry},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := tt.body
			if body == nil {
				body = matchEndedBody(t)
			}
			c := &Consumer{service: &fakeMatchService{err: tt.processErr}}
			msg := amqp.Delivery{MessageId: testMessageID, Body: body}

			got := c.handleMatchEnded(context.Background(), msg)

			if got.disposition != tt.want {
				t.Fatalf("disposition = %v, want %v", got.disposition, tt.want)
			}
			if got.dlqReason != tt.wantReason {
				t.Fatalf("dlq reason = %q, want %q", got.dlqReason, tt.wantReason)
			}
			if tt.want != ack && got.cause == nil {
				t.Fatal("a failed outcome carries no cause")
			}
		})
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

// fakePublisher records every copy the consumer republishes; err is what the
// republisher reports when the copy is not confirmed.
type fakePublisher struct {
	sent []published
	err  error
}

func (f *fakePublisher) Republish(ctx context.Context, queue string, msg amqp.Publishing) error {
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, published{"", queue, msg})
	return nil
}

const testMessageID = "0b7c8a3e-6f1d-4c2a-9a55-1f0e2d3c4b5a"

func delivery(acker *fakeAcknowledger, headers amqp.Table) amqp.Delivery {
	return amqp.Delivery{
		Acknowledger:  acker,
		Headers:       headers,
		Body:          []byte("match"),
		DeliveryTag:   7,
		MessageId:     testMessageID,
		ContentType:   "application/x-protobuf",
		CorrelationId: "corr-1",
		Type:          "match.ended",
		AppId:         "game-service",
		Timestamp:     time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC),
	}
}

// assertCopyOf checks a forwarded message is the original event: same body,
// MessageId (the dedup key, FS-BVM9H Req 5), properties and headers, persistent.
func assertCopyOf(t *testing.T, got amqp.Publishing, original amqp.Delivery) {
	t.Helper()
	if string(got.Body) != string(original.Body) || got.DeliveryMode != amqp.Persistent {
		t.Fatalf("forwarded %+v, want the same body, persistent", got)
	}
	if got.MessageId != original.MessageId {
		t.Fatalf("forwarded MessageId %q, want %q preserved", got.MessageId, original.MessageId)
	}
	if got.ContentType != original.ContentType || got.CorrelationId != original.CorrelationId ||
		got.Type != original.Type || got.AppId != original.AppId || !got.Timestamp.Equal(original.Timestamp) {
		t.Fatalf("forwarded properties %+v, want those of %+v", got, original)
	}
	for k, v := range original.Headers {
		if k == retryCountHeader || k == boundedAttemptsHeader {
			continue
		}
		if got.Headers[k] != v {
			t.Fatalf("header %q = %v, want %v preserved", k, got.Headers[k], v)
		}
	}
}

// A processed event is acked exactly once and nothing is published.
func TestSettle_Ack(t *testing.T) {
	pub := &fakePublisher{}
	c := &Consumer{broker: pub}
	acker := &fakeAcknowledger{}

	c.settle(context.Background(), delivery(acker, nil), outcome{disposition: ack})

	if acker.acks != 1 || acker.nacks != 0 || len(pub.sent) != 0 {
		t.Fatalf("settled %+v, published %v, want one ack and nothing published", acker, pub.sent)
	}
}

// A retry never requeues in place: the event waits out a delay in the next
// delay queue, whose TTL dead-letters it back to the work queue, and the delay
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
		{"second failure", amqp.Table{retryCountHeader: int32(1), "trace": "abc"}, retryQueueName(1), 2},
		{"past the last step stays at it", amqp.Table{retryCountHeader: int64(last + 5)}, retryQueueName(last), int32(last + 6)},
		{"far past every bounded cap still retries", amqp.Table{retryCountHeader: int32(500)}, retryQueueName(last), 501},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pub := &fakePublisher{}
			c := &Consumer{broker: pub}
			acker := &fakeAcknowledger{}
			msg := delivery(acker, tt.headers)

			c.settle(context.Background(), msg, outcome{disposition: retry, cause: commonconstants.ErrTransient})

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
			assertCopyOf(t, got.msg, msg)
			if acker.acks != 1 || acker.nacks != 0 {
				t.Fatalf("original settled %+v, want acked once after the forward", acker)
			}
		})
	}
}

// If the copy cannot be published the broker is in trouble; the original goes
// back to its queue rather than being lost.
func TestSettle_PublishFails_ReturnsToQueue(t *testing.T) {
	for _, d := range []disposition{retry, retryBounded} {
		t.Run(d.String(), func(t *testing.T) {
			c := &Consumer{broker: &fakePublisher{err: errors.New("channel closed")}}
			acker := &fakeAcknowledger{}

			c.settle(context.Background(), delivery(acker, nil), outcome{disposition: d, cause: errors.New("boom")})

			if acker.acks != 0 || acker.nacks != 1 || !acker.requeued {
				t.Fatalf("settled %+v, want one nack with requeue", acker)
			}
		})
	}
}

// A rejected event is dead-lettered with a reason: the consumer publishes the
// copy to the DLQ itself (a plain nack cannot add headers), then acks.
func TestSettle_Reject_DeadLettersWithReason(t *testing.T) {
	pub := &fakePublisher{}
	c := &Consumer{broker: pub}
	acker := &fakeAcknowledger{}
	msg := delivery(acker, amqp.Table{retryCountHeader: int32(2), boundedAttemptsHeader: int32(1), "trace": "abc"})

	c.settle(context.Background(), msg, rejected(dlqReasonMalformed, errors.New("bad member id")))

	if len(pub.sent) != 1 {
		t.Fatalf("published %d messages, want 1", len(pub.sent))
	}
	got := pub.sent[0]
	if got.exchange != "" || got.key != matchEndedDLQ {
		t.Fatalf("dead-lettered to %q/%q, want default exchange/%q", got.exchange, got.key, matchEndedDLQ)
	}
	assertCopyOf(t, got.msg, msg)
	if got.msg.Headers[retryCountHeader] != int32(2) ||
		got.msg.Headers[boundedAttemptsHeader] != int32(1) ||
		got.msg.Headers[dlqReasonHeader] != dlqReasonMalformed ||
		got.msg.Headers[lastErrorHeader] != "bad member id" {
		t.Fatalf("dead-letter headers %v, want count 2, bounded attempts 1, reason %q, last error", got.msg.Headers, dlqReasonMalformed)
	}
	if acker.acks != 1 || acker.nacks != 0 {
		t.Fatalf("original settled %+v, want acked once after dead-lettering", acker)
	}
}

// If the DLQ copy cannot be published the original is nacked without requeue,
// so the work queue's own dead-letter exchange still parks it in the DLQ.
func TestSettle_Reject_PublishFails_FallsBackToDeadLetterExchange(t *testing.T) {
	c := &Consumer{broker: &fakePublisher{err: errors.New("channel closed")}}
	acker := &fakeAcknowledger{}

	c.settle(context.Background(), delivery(acker, nil), rejected(dlqReasonMalformed, errors.New("bad")))

	if acker.acks != 0 || acker.nacks != 1 || acker.requeued {
		t.Fatalf("settled %+v, want one nack without requeue", acker)
	}
}

// A bounded retry retries like any other until its own attempts run out, then
// is dead-lettered as retries_exhausted with the last error and both counts.
// Only bounded failures count toward the cap: retries spent waiting out an
// outage (x-retry-count) never use up an event's attempts at a missing
// reference, though they still pick the delay step.
func TestSettle_RetryBounded(t *testing.T) {
	last := len(retryDelays) - 1
	tests := []struct {
		name              string
		retriesDone       int32 // x-retry-count on the delivery
		boundedDone       int32 // x-bounded-attempts on the delivery
		wantmatchEndedDLQ bool
		wantRetries       int32 // x-retry-count on the published copy
		wantAttempts      int32 // x-bounded-attempts on the published copy
	}{
		{"first failure retries", 0, 0, false, 1, 1},
		{"second to last attempt retries", int32(maxBoundedAttempts - 2), int32(maxBoundedAttempts - 2), false, int32(maxBoundedAttempts - 1), int32(maxBoundedAttempts - 1)},
		{"nine outage retries then a first missing reference retries", 9, 0, false, 10, 1},
		{"tenth bounded attempt dead-letters", 9, int32(maxBoundedAttempts - 1), true, 9, int32(maxBoundedAttempts)},
		{"tenth bounded attempt after a long outage dead-letters", 40, int32(maxBoundedAttempts - 1), true, 40, int32(maxBoundedAttempts)},
		{"past the cap dead-letters", int32(maxBoundedAttempts + 3), int32(maxBoundedAttempts + 3), true, int32(maxBoundedAttempts + 3), int32(maxBoundedAttempts + 4)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pub := &fakePublisher{}
			c := &Consumer{broker: pub}
			acker := &fakeAcknowledger{}
			headers := amqp.Table{retryCountHeader: tt.retriesDone, "trace": "abc"}
			if tt.boundedDone > 0 {
				headers[boundedAttemptsHeader] = tt.boundedDone
			}
			msg := delivery(acker, headers)

			c.settle(context.Background(), msg, outcome{disposition: retryBounded, cause: errors.New("fk player")})

			if len(pub.sent) != 1 || acker.acks != 1 || acker.nacks != 0 {
				t.Fatalf("published %d, settled %+v, want one copy then one ack", len(pub.sent), acker)
			}
			got := pub.sent[0]
			assertCopyOf(t, got.msg, msg)
			if got.msg.Headers[retryCountHeader] != tt.wantRetries {
				t.Fatalf("retry count %v, want %d", got.msg.Headers[retryCountHeader], tt.wantRetries)
			}
			if got.msg.Headers[boundedAttemptsHeader] != tt.wantAttempts {
				t.Fatalf("bounded attempts %v, want %d", got.msg.Headers[boundedAttemptsHeader], tt.wantAttempts)
			}
			if !tt.wantmatchEndedDLQ {
				if want := retryQueueName(min(int(tt.retriesDone), last)); got.key != want {
					t.Fatalf("forwarded to %q, want %q", got.key, want)
				}
				return
			}
			if got.key != matchEndedDLQ {
				t.Fatalf("published to %q, want the DLQ %q", got.key, matchEndedDLQ)
			}
			if got.msg.Headers[dlqReasonHeader] != dlqReasonRetriesExhausted ||
				got.msg.Headers[lastErrorHeader] != "fk player" {
				t.Fatalf("dead-letter headers %v, want retries_exhausted with the last error", got.msg.Headers)
			}
		})
	}
}

// An unbounded retry leaves the bounded attempts alone: waiting out an outage
// spends none of them.
func TestSettle_Retry_KeepsBoundedAttempts(t *testing.T) {
	pub := &fakePublisher{}
	c := &Consumer{broker: pub}
	acker := &fakeAcknowledger{}
	msg := delivery(acker, amqp.Table{retryCountHeader: int32(4), boundedAttemptsHeader: int32(3)})

	c.settle(context.Background(), msg, outcome{disposition: retry, cause: commonconstants.ErrTransient})

	if len(pub.sent) != 1 {
		t.Fatalf("published %d messages, want 1", len(pub.sent))
	}
	got := pub.sent[0].msg.Headers
	if got[retryCountHeader] != int32(5) || got[boundedAttemptsHeader] != int32(3) {
		t.Fatalf("headers %v, want retry count 5 and bounded attempts still 3", got)
	}
}

// A bounded retry gets ten attempts in all.
func TestMaxBoundedAttempts(t *testing.T) {
	if maxBoundedAttempts != 10 {
		t.Fatalf("maxBoundedAttempts = %d, want 10", maxBoundedAttempts)
	}
}

// The dedup key is the delivery's MessageId, and the event type is the routing
// key the work queue is bound to, never the delivery's: a copy coming back from
// a delay queue carries the work-queue name as its routing key.
func TestHandleMatchEnded_PassesMessageIDAndEventType(t *testing.T) {
	for _, routingKey := range []string{commonconstants.GameMatchEnded, matchEndedQueue} {
		t.Run(routingKey, func(t *testing.T) {
			svc := &fakeMatchService{}
			c := &Consumer{service: svc}
			msg := amqp.Delivery{MessageId: testMessageID, RoutingKey: routingKey, Body: matchEndedBody(t)}

			got := c.handleMatchEnded(context.Background(), msg)

			if got.disposition != ack || svc.calls != 1 {
				t.Fatalf("disposition %v after %d calls, want ack after 1", got.disposition, svc.calls)
			}
			if svc.eventID != uuid.MustParse(testMessageID) {
				t.Fatalf("event id %s, want %s", svc.eventID, testMessageID)
			}
			if svc.eventType != commonconstants.GameMatchEnded {
				t.Fatalf("event type %q, want %q", svc.eventType, commonconstants.GameMatchEnded)
			}
		})
	}
}

// A delivery with no MessageId, or one that is not a UUID, cannot be
// deduplicated, so it is dead-lettered before the service, and so the
// database, is touched. Each case carries its own reason, the same set
// items-service uses.
func TestHandleMatchEnded_BadMessageID_RejectedWithoutProcessing(t *testing.T) {
	tests := []struct {
		id          string
		wantReason  string
		wantUUIDErr bool
	}{
		{id: "", wantReason: dlqReasonMissingMessageID},
		{id: "not-a-uuid", wantReason: dlqReasonInvalidMessageID, wantUUIDErr: true},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("%q", tt.id), func(t *testing.T) {
			svc := &fakeMatchService{}
			c := &Consumer{service: svc}

			got := c.handleMatchEnded(context.Background(), amqp.Delivery{MessageId: tt.id, Body: matchEndedBody(t)})

			if got.disposition != reject || got.dlqReason != tt.wantReason || got.cause == nil {
				t.Fatalf("outcome %+v, want reject %q with a cause", got, tt.wantReason)
			}
			if tt.wantUUIDErr && !errors.Is(got.cause, commonconstants.ErrUUIDCouldNotBeParsed) {
				t.Fatalf("cause %v, want it to wrap ErrUUIDCouldNotBeParsed", got.cause)
			}
			if svc.calls != 0 {
				t.Fatalf("service called %d times, want 0", svc.calls)
			}
		})
	}
}

// The DLQ reasons match items-service's set.
func TestDLQReasons(t *testing.T) {
	want := map[string]string{
		"malformed":          dlqReasonMalformed,
		"retries_exhausted":  dlqReasonRetriesExhausted,
		"missing_message_id": dlqReasonMissingMessageID,
		"invalid_message_id": dlqReasonInvalidMessageID,
	}
	for value, got := range want {
		if got != value {
			t.Fatalf("reason %q, want %q", got, value)
		}
	}
}

// Settled end to end, a missing MessageId lands in the DLQ with its reason and
// the original is acked; nothing is requeued.
func TestConsumeMatchEnded_MissingMessageID_DeadLettered(t *testing.T) {
	pub := &fakePublisher{}
	c := &Consumer{service: &fakeMatchService{}, broker: pub}
	acker := &fakeAcknowledger{}
	msg := delivery(acker, nil)
	msg.MessageId = ""

	c.settle(context.Background(), msg, c.handleMatchEnded(context.Background(), msg))

	if len(pub.sent) != 1 || pub.sent[0].key != matchEndedDLQ || pub.sent[0].msg.Headers[dlqReasonHeader] != dlqReasonMissingMessageID {
		t.Fatalf("published %+v, want one DLQ copy with reason %q", pub.sent, dlqReasonMissingMessageID)
	}
	if acker.acks != 1 || acker.requeued {
		t.Fatalf("settled %+v, want acked once, never requeued", acker)
	}
}

// The original is acked only once its copy is confirmed. A copy that is not
// (a publish error, a broker nack, a confirm that never comes, an unroutable
// return) leaves the original unacked: a retry goes back to its queue, a dead
// letter is nacked to the work queue's own dead-letter exchange, so neither is
// lost (FS-BVM9H Req 5).
func TestSettle_AcksOnlyAfterConfirm(t *testing.T) {
	notConfirmed := []struct {
		name string
		err  error
	}{
		{"publish error", fmt.Errorf("publish copy: %w", amqp.ErrClosed)},
		{"nacked", fmt.Errorf("publish copy: %w", errNacked)},
		{"confirm timed out", fmt.Errorf("await confirm: %w", context.DeadlineExceeded)},
		{"returned unroutable", fmt.Errorf("publish copy: %w", errUnroutable)},
	}
	settlements := []struct {
		name        string
		outcome     outcome
		headers     amqp.Table
		wantRequeue bool
	}{
		{"retry", outcome{disposition: retry, cause: commonconstants.ErrTransient}, nil, true},
		{"bounded retry", outcome{disposition: retryBounded, cause: commonconstants.ErrNotFound}, nil, true},
		{"reject", rejected(dlqReasonMalformed, errors.New("bad")), nil, false},
		{"bounded retries exhausted", outcome{disposition: retryBounded, cause: commonconstants.ErrNotFound},
			amqp.Table{boundedAttemptsHeader: int32(maxBoundedAttempts - 1)}, false},
	}
	for _, st := range settlements {
		t.Run(st.name+"/confirmed", func(t *testing.T) {
			acker := &fakeAcknowledger{}
			c := &Consumer{broker: &fakePublisher{}}

			c.settle(context.Background(), delivery(acker, st.headers), st.outcome)

			if acker.acks != 1 || acker.nacks != 0 {
				t.Fatalf("settled %+v, want one ack after the confirm", acker)
			}
		})
		for _, nc := range notConfirmed {
			t.Run(st.name+"/"+nc.name, func(t *testing.T) {
				acker := &fakeAcknowledger{}
				c := &Consumer{broker: &fakePublisher{err: nc.err}}

				c.settle(context.Background(), delivery(acker, st.headers), st.outcome)

				if acker.acks != 0 || acker.nacks != 1 || acker.requeued != st.wantRequeue {
					t.Fatalf("settled %+v, want one nack, requeue %v, and no ack", acker, st.wantRequeue)
				}
			})
		}
	}
}
