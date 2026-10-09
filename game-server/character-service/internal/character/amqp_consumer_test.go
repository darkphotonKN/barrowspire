package character

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"strings"
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

// fakeGranter records every grant it is handed and answers each character
// with the error set for it.
type fakeGranter struct {
	granted []ExperienceGrant
	errs    map[uuid.UUID]error
}

func (f *fakeGranter) GrantExperience(ctx context.Context, grant ExperienceGrant) error {
	f.granted = append(f.granted, grant)
	return f.errs[grant.CharacterID]
}

func matchEnded(t *testing.T, sessionID string, players ...*pb.PlayerMatchResult) []byte {
	t.Helper()
	body, err := proto.Marshal(&pb.MatchEndedEvent{SessionId: sessionID, Players: players})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return body
}

func result(member, character uuid.UUID, gained int64) *pb.PlayerMatchResult {
	return &pb.PlayerMatchResult{MemberId: member.String(), CharacterId: character.String(), ExperienceGained: gained}
}

func testConsumer(granter ExperienceGranter) (*consumer, *bytes.Buffer) {
	logs := &bytes.Buffer{}
	return NewConsumer(granter, nil, nil, slog.New(slog.NewTextHandler(logs, nil))), logs
}

// Every character with experience gained gets a grant keyed by the run; a
// character with none is skipped. FS-BDA7X §Requirements 25.
func TestHandleMatchEnded_GrantsEveryGain(t *testing.T) {
	granter := &fakeGranter{}
	c, _ := testConsumer(granter)
	session := uuid.New()
	a, b, idle := uuid.New(), uuid.New(), uuid.New()
	charA, charB, charIdle := uuid.New(), uuid.New(), uuid.New()

	got := c.handleMatchEnded(context.Background(), matchEnded(t, session.String(),
		result(a, charA, 120), result(b, charB, 30), result(idle, charIdle, 0)))

	if got != ack {
		t.Fatalf("disposition = %v, want ack", got)
	}
	want := []ExperienceGrant{
		{SessionID: session, CharacterID: charA, MemberID: a, Amount: 120},
		{SessionID: session, CharacterID: charB, MemberID: b, Amount: 30},
	}
	if fmt.Sprint(granter.granted) != fmt.Sprint(want) {
		t.Fatalf("granted %v, want %v", granter.granted, want)
	}
}

// A redelivered event, a foreign character and a deleted one are all settled:
// acked, never requeued; the drop is logged. FS-BDA7X §Requirements 26–27.
func TestHandleMatchEnded_DuplicateAndForeign_AckedAndLogged(t *testing.T) {
	tests := []struct {
		name    string
		err     error
		wantLog string
	}{
		{"duplicate delivery", fmt.Errorf("grant: %w", commonconstants.ErrAlreadyProcessed), "already applied"},
		{"foreign or deleted character", fmt.Errorf("grant: %w", commonconstants.ErrNotFound), "dropped"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			character, other := uuid.New(), uuid.New()
			granter := &fakeGranter{errs: map[uuid.UUID]error{character: tt.err}}
			c, logs := testConsumer(granter)

			got := c.handleMatchEnded(context.Background(), matchEnded(t, uuid.NewString(),
				result(uuid.New(), character, 50), result(uuid.New(), other, 20)))

			if got != ack {
				t.Fatalf("disposition = %v, want ack", got)
			}
			if len(granter.granted) != 2 {
				t.Fatalf("the rest of the run's grants still apply: %v", granter.granted)
			}
			if !strings.Contains(logs.String(), tt.wantLog) || !strings.Contains(logs.String(), character.String()) {
				t.Fatalf("log %q lacks %q for %s", logs.String(), tt.wantLog, character)
			}
		})
	}
}

// A malformed message is rejected without requeue, and nothing of it is
// applied. FS-BDA7X §Requirements 28.
func TestHandleMatchEnded_Malformed_RejectedNothingApplied(t *testing.T) {
	member, character := uuid.New(), uuid.New()
	tests := []struct {
		name string
		body func(t *testing.T) []byte
	}{
		{"not a match.ended", func(*testing.T) []byte { return []byte{0xff, 0xff, 0xff} }},
		{"bad session id", func(t *testing.T) []byte { return matchEnded(t, "nope", result(member, character, 10)) }},
		{"bad character id", func(t *testing.T) []byte {
			return matchEnded(t, uuid.NewString(), result(member, character, 10),
				&pb.PlayerMatchResult{MemberId: member.String(), CharacterId: "nope", ExperienceGained: 10})
		}},
		{"bad member id", func(t *testing.T) []byte {
			return matchEnded(t, uuid.NewString(), &pb.PlayerMatchResult{MemberId: "", CharacterId: character.String(), ExperienceGained: 10})
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			granter := &fakeGranter{}
			c, _ := testConsumer(granter)

			got := c.handleMatchEnded(context.Background(), tt.body(t))

			if got != reject {
				t.Fatalf("disposition = %v, want reject", got)
			}
			if len(granter.granted) != 0 {
				t.Fatalf("applied %v from a malformed message", granter.granted)
			}
		})
	}
}

// Any failure that is not the message's own fault is retried after a delay —
// a transient database failure, a refused connection or an administrator
// shutdown alike — so a run's experience outlives a character-service database
// outage; the grants already applied are no-ops on redelivery. Only a grant the
// message itself makes invalid is rejected. FS-BDA7X §Requirements 26, 28 and
// Edge State "character-service down".
func TestHandleMatchEnded_Failures(t *testing.T) {
	refused := &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
	tests := []struct {
		name string
		err  error
		want disposition
	}{
		{"transient", fmt.Errorf("grant: %w", commonconstants.ErrTransient), retry},
		{"lock unavailable", fmt.Errorf("grant: %w", commonconstants.ErrLockUnavailable), retry},
		{"connection refused", fmt.Errorf("grant: error occured in character repo during begin experience grant: %w", refused), retry},
		{"admin shutdown 57P01", fmt.Errorf("grant: %w", &pq.Error{Code: "57P01"}), retry},
		{"unclassified", errors.New("boom"), retry},
		{"invalid grant", fmt.Errorf("grant: %w", commonconstants.ErrInvalidInput), reject},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			character := uuid.New()
			c, _ := testConsumer(&fakeGranter{errs: map[uuid.UUID]error{character: tt.err}})

			got := c.handleMatchEnded(context.Background(), matchEnded(t, uuid.NewString(), result(uuid.New(), character, 10)))

			if got != tt.want {
				t.Fatalf("disposition = %v, want %v", got, tt.want)
			}
		})
	}
}

// fakeAcknowledger records how a delivery was settled.
type fakeAcknowledger struct {
	acks, nacks, rejects int
	requeued             bool
}

func (f *fakeAcknowledger) Ack(tag uint64, multiple bool) error { f.acks++; return nil }
func (f *fakeAcknowledger) Nack(tag uint64, multiple, requeue bool) error {
	f.nacks++
	f.requeued = requeue
	return nil
}
func (f *fakeAcknowledger) Reject(tag uint64, requeue bool) error {
	f.rejects++
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
	return amqp.Delivery{Acknowledger: ack, Headers: headers, Body: []byte("run"), DeliveryTag: 7}
}

// A success is acked exactly once; a malformed message is rejected without
// requeue, so the queue's dead-letter exchange parks it in the DLQ.
// FS-BDA7X §Requirements 28.
func TestSettle_AckAndReject(t *testing.T) {
	tests := []struct {
		name      string
		d         disposition
		wantAcks  int
		wantNacks int
	}{
		{"success acked once", ack, 1, 0},
		{"malformed dead-lettered", reject, 0, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := testConsumer(&fakeGranter{})
			pub := &fakePublisher{}
			c.retries = pub
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

// A retry never requeues in place: the message waits out a delay in the next
// retry queue, whose TTL dead-letters it back to the work queue, and the
// delay stops growing at the last step, so an outage of any length is waited
// out without a hot loop. FS-BDA7X Edge State "character-service down".
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
		{"past the last step stays at it", amqp.Table{retryCountHeader: int32(last + 5)}, retryQueueName(last), int32(last + 6)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := testConsumer(&fakeGranter{})
			pub := &fakePublisher{}
			c.retries = pub
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
			if string(got.msg.Body) != "run" || got.msg.DeliveryMode != amqp.Persistent {
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
	c, _ := testConsumer(&fakeGranter{})
	c.retries = &fakePublisher{err: errors.New("channel closed")}
	acker := &fakeAcknowledger{}

	c.settle(context.Background(), delivery(acker, nil), retry)

	if acker.acks != 0 || acker.nacks != 1 || !acker.requeued {
		t.Fatalf("settled %+v, want one nack with requeue", acker)
	}
}

// Every retry delay is bounded and grows; the ladder is what turns a failing
// message from a hot loop into a wait.
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

// fakeChannel records what a listener does on its broker channel. failQueue
// makes declaring that one queue fail with failErr.
type fakeChannel struct {
	exchanges []string
	queues    map[string]declaredQueue
	bindings  map[string]string // queue -> exchange/key
	consumed  []string
	prefetch  int
	failQueue string
	failErr   error
}

func newFakeChannel() *fakeChannel {
	return &fakeChannel{queues: map[string]declaredQueue{}, bindings: map[string]string{}}
}

func (f *fakeChannel) ExchangeDeclare(name, kind string, durable, autoDelete, internal, noWait bool, args amqp.Table) error {
	f.exchanges = append(f.exchanges, name)
	return nil
}

func (f *fakeChannel) QueueDeclare(name string, durable, autoDelete, exclusive, noWait bool, args amqp.Table) (amqp.Queue, error) {
	if name == f.failQueue {
		return amqp.Queue{}, f.failErr
	}
	f.queues[name] = declaredQueue{durable: durable, args: args}
	return amqp.Queue{Name: name}, nil
}

func (f *fakeChannel) QueueBind(name, key, exchange string, noWait bool, args amqp.Table) error {
	f.bindings[name] = exchange + "/" + key
	return nil
}

func (f *fakeChannel) Qos(prefetchCount, prefetchSize int, global bool) error {
	f.prefetch = prefetchCount
	return nil
}

func (f *fakeChannel) Consume(queue, consumer string, autoAck, exclusive, noLocal, noWait bool, args amqp.Table) (<-chan amqp.Delivery, error) {
	f.consumed = append(f.consumed, queue)
	msgs := make(chan amqp.Delivery)
	close(msgs)
	return msgs, nil
}

func (f *fakeChannel) PublishWithContext(ctx context.Context, exchange, key string, mandatory, immediate bool, msg amqp.Publishing) error {
	return nil
}

// The work queue dead-letters rejects to its DLQ and is bound to match.ended;
// each delay queue dead-letters back into it after its TTL — straight through
// the default exchange, never game.events, so no other subscriber sees a retry.
// FS-BDA7X §Requirements 28.
func TestDeclareMatchEndedTopology(t *testing.T) {
	topo := newFakeChannel()
	work := commonconstants.CharacterGameMatchEndedQueue

	if err := declareMatchEndedTopology(topo); err != nil {
		t.Fatalf("declare: %v", err)
	}

	q, ok := topo.queues[work]
	if !ok || !q.durable {
		t.Fatalf("work queue %q not declared durable: %+v", work, topo.queues)
	}
	if q.args["x-dead-letter-exchange"] != "" || q.args["x-dead-letter-routing-key"] != deadLetterQueue {
		t.Fatalf("work queue args %v, want dead-lettering to %q", q.args, deadLetterQueue)
	}
	if want := commonconstants.GameEventsExchange + "/" + commonconstants.GameMatchEnded; topo.bindings[work] != want {
		t.Fatalf("work queue bound to %q, want %q", topo.bindings[work], want)
	}
	if dlq, ok := topo.queues[deadLetterQueue]; !ok || !dlq.durable {
		t.Fatalf("DLQ %q not declared durable", deadLetterQueue)
	}

	if len(retryDelays) != 3 {
		t.Fatalf("%d retry steps, want 3", len(retryDelays))
	}
	for step, delay := range retryDelays {
		name := retryQueueName(step)
		q, ok := topo.queues[name]
		if !ok || !q.durable {
			t.Fatalf("retry queue %q not declared durable", name)
		}
		if q.args["x-message-ttl"] != int32(delay/time.Millisecond) ||
			q.args["x-dead-letter-exchange"] != "" ||
			q.args["x-dead-letter-routing-key"] != work {
			t.Fatalf("retry queue %q args %v, want ttl %v back to %q", name, q.args, delay, work)
		}
		if _, bound := topo.bindings[name]; bound {
			t.Fatalf("retry queue %q is bound to an exchange", name)
		}
	}
}

// A queue the broker already holds with other arguments (the arg-less
// match.ended queue of an earlier build) fails startup with an error naming
// the queue and the one-time fix, rather than leaving a consumer that never
// grants experience. FS-BDA7X §Requirements 28.
func TestListen_TopologyDeclareFails_ReturnsActionableError(t *testing.T) {
	work := commonconstants.CharacterGameMatchEndedQueue
	tests := []struct {
		name     string
		failErr  error
		wantText []string
	}{
		{
			"queue exists with other arguments",
			&amqp.Error{Code: amqp.PreconditionFailed, Reason: "PRECONDITION_FAILED - inequivalent arg 'x-dead-letter-exchange'"},
			[]string{work, "delete queue " + work + " once", "recreated", "PRECONDITION_FAILED"},
		},
		{
			"broker error",
			&amqp.Error{Code: amqp.ChannelError, Reason: "CHANNEL_ERROR"},
			[]string{work, "CHANNEL_ERROR"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			created, matchEnded := newFakeChannel(), newFakeChannel()
			matchEnded.failQueue, matchEnded.failErr = work, tt.failErr
			c := NewConsumer(&fakeGranter{}, created, matchEnded, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))

			err := c.Listen(context.Background())

			if err == nil {
				t.Fatal("Listen succeeded, want the declare failure")
			}
			for _, want := range tt.wantText {
				if !strings.Contains(err.Error(), want) {
					t.Fatalf("error %q lacks %q", err, want)
				}
			}
			if len(matchEnded.consumed) != 0 {
				t.Fatalf("consumed %v after a failed declare", matchEnded.consumed)
			}
		})
	}
}

// Each listener owns its channel: match.ended's topology, prefetch and
// consumer live on one, character.created's on the other, so a failure that
// closes one channel cannot take the other listener down with it.
func TestListen_DedicatedChannels(t *testing.T) {
	created, matchEnded := newFakeChannel(), newFakeChannel()
	c := NewConsumer(&fakeGranter{}, created, matchEnded, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))

	if err := c.Listen(context.Background()); err != nil {
		t.Fatalf("Listen: %v", err)
	}

	work := commonconstants.CharacterGameMatchEndedQueue
	createdQueue := "character." + commonconstants.CharacterCreatedEvent
	if fmt.Sprint(matchEnded.consumed) != fmt.Sprint([]string{work}) || matchEnded.prefetch != matchEndedPrefetch {
		t.Fatalf("match ended channel consumed %v prefetch %d, want [%s] prefetch %d", matchEnded.consumed, matchEnded.prefetch, work, matchEndedPrefetch)
	}
	if fmt.Sprint(created.consumed) != fmt.Sprint([]string{createdQueue}) || created.prefetch != 0 {
		t.Fatalf("created channel consumed %v prefetch %d, want [%s] and no prefetch", created.consumed, created.prefetch, createdQueue)
	}
	if _, ok := created.queues[work]; ok {
		t.Fatalf("match ended topology declared on the character created channel")
	}
	if _, ok := matchEnded.queues[createdQueue]; ok {
		t.Fatalf("character created queue declared on the match ended channel")
	}
}
