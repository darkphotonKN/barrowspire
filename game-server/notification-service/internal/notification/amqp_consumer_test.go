package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

const testMessageID = "0b7c8a3e-6f1d-4c2a-9a55-1f0e2d3c4b5a"

// fakeConsumerService records what the consumer handed the service.
type fakeConsumerService struct {
	gameEndedErr   error
	gameEndedCalls int
	gameEndedID    uuid.UUID
	gameEndedEvent *pb.MatchEndedEvent

	verificationErr     error
	verificationPayload *commonconstants.MemberVerificationRequestedEventPayload
}

func (f *fakeConsumerService) ProcessVerificationRequested(ctx context.Context, payload *commonconstants.MemberVerificationRequestedEventPayload) error {
	f.verificationPayload = payload
	return f.verificationErr
}

func (f *fakeConsumerService) ProcessMemberSignedUp(ctx context.Context, payload *commonconstants.MemberSignedUpEventPayload) error {
	return nil
}

func (f *fakeConsumerService) ProcessItemCreated(ctx context.Context, payload *pb.ItemCreatedEvent) error {
	return nil
}

func (f *fakeConsumerService) ProcessGameEnded(ctx context.Context, eventID uuid.UUID, payload *pb.MatchEndedEvent) error {
	f.gameEndedCalls++
	f.gameEndedID = eventID
	f.gameEndedEvent = payload
	return f.gameEndedErr
}

// fakeAcknowledger records how a delivery was settled.
type fakeAcknowledger struct {
	acks     int
	nacks    int
	requeued bool
}

func (f *fakeAcknowledger) Ack(tag uint64, multiple bool) error { f.acks++; return nil }

func (f *fakeAcknowledger) Nack(tag uint64, multiple, requeue bool) error {
	f.nacks++
	f.requeued = f.requeued || requeue
	return nil
}

func (f *fakeAcknowledger) Reject(tag uint64, requeue bool) error {
	return f.Nack(tag, false, requeue)
}

type publishedCopy struct {
	exchange   string
	routingKey string
	msg        amqp.Publishing
}

// fakeRetryPublisher records every copy the consumer sends to the retry exchange.
type fakeRetryPublisher struct {
	published []publishedCopy
}

func (f *fakeRetryPublisher) Publish(exchange, key string, mandatory, immediate bool, msg amqp.Publishing) error {
	f.published = append(f.published, publishedCopy{exchange: exchange, routingKey: key, msg: msg})
	return nil
}

func gameEndedDelivery(t *testing.T, acker *fakeAcknowledger, messageID string) amqp.Delivery {
	t.Helper()
	body, err := proto.Marshal(&pb.MatchEndedEvent{
		SessionId: uuid.NewString(),
		WorldType: commonconstants.WorldTypeField, // the MessageId check comes before the field-visit check
		Players:   []*pb.PlayerMatchResult{{MemberId: uuid.NewString(), Username: "wren"}},
	})
	require.NoError(t, err)
	return amqp.Delivery{
		Acknowledger: acker,
		MessageId:    messageID,
		RoutingKey:   commonconstants.GameMatchEnded,
		ContentType:  "application/x-protobuf",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	}
}

// captureErrorLogs routes slog to a buffer for the test and reports whether
// anything was logged at error level.
func captureErrorLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

// A game.ended delivery is deduplicated on its MessageId. One without a usable
// MessageId is a producer bug: it is dead-lettered and logged at error level
// before the service (and so any transaction) is reached, field visit or not.
// A usable one is handed to the service as the event id and settled by the
// result. FS-PJPNA Req 1, 3, 6, 7.
func TestHandleGameEnded_MessageID(t *testing.T) {
	tests := []struct {
		name        string
		messageID   string
		serviceErr  error
		wantCalled  bool
		wantAcks    int
		wantNacks   int
		wantErrLog  bool
		wantRetries int
	}{
		{"missing MessageId: dead-lettered, service not called", "", nil, false, 0, 1, true, 0},
		{"non-UUID MessageId: dead-lettered, service not called", "outbox-row-7", nil, false, 0, 1, true, 0},
		{"valid MessageId: processed and acked", testMessageID, nil, true, 1, 0, false, 0},
		{"valid MessageId, duplicate: acked", testMessageID, commonconstants.ErrAlreadyProcessed, true, 1, 0, false, 0},
		{"valid MessageId, transient failure: retried with delay", testMessageID, fmt.Errorf("mark event processed: %w", commonconstants.ErrTransient), true, 1, 0, false, 1},
		{"valid MessageId, permanent failure: dead-lettered", testMessageID, errors.New("boom"), true, 0, 1, true, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureErrorLogs(t)
			acker := &fakeAcknowledger{}
			svc := &fakeConsumerService{gameEndedErr: tt.serviceErr}
			pub := &fakeRetryPublisher{}
			c := &Consumer{service: svc, publisher: pub}

			c.handleGameEnded(gameEndedDelivery(t, acker, tt.messageID))

			assert.Equal(t, tt.wantCalled, svc.gameEndedCalls == 1, "service called")
			if tt.wantCalled {
				assert.Equal(t, uuid.MustParse(testMessageID), svc.gameEndedID, "event id is the MessageId")
			}
			assert.Equal(t, tt.wantAcks, acker.acks, "acks")
			assert.Equal(t, tt.wantNacks, acker.nacks, "nacks")
			assert.False(t, acker.requeued, "never nacked with requeue")
			assert.Len(t, pub.published, tt.wantRetries, "retry copies")
			assert.Equal(t, tt.wantErrLog, bytes.Contains(logs.Bytes(), []byte("level=ERROR")), "error-level log")
		})
	}
}

// The copy parked in a delay queue keeps the original MessageId, or the
// retried game.ended would come back without its dedup key and be
// dead-lettered. FS-PJPNA Req 4.
func TestRequeueWithRetry_KeepsMessageID(t *testing.T) {
	pub := &fakeRetryPublisher{}
	c := &Consumer{publisher: pub}
	original := gameEndedDelivery(t, &fakeAcknowledger{}, testMessageID)

	err := c.requeueWithRetry(original, 1)

	require.NoError(t, err)
	require.Len(t, pub.published, 1)
	got := pub.published[0]
	assert.Equal(t, commonconstants.RetryExchange, got.exchange)
	assert.Equal(t, RetryLevels[0].Level+"."+commonconstants.GameMatchEnded, got.routingKey)
	assert.Equal(t, original.MessageId, got.msg.MessageId)
	assert.Equal(t, original.Body, got.msg.Body)
	assert.Equal(t, int32(1), got.msg.Headers["x-retry-count"])
}

func verificationRequestedDelivery(t *testing.T, acker *fakeAcknowledger, body []byte) amqp.Delivery {
	t.Helper()
	return amqp.Delivery{
		Acknowledger: acker,
		MessageId:    testMessageID,
		RoutingKey:   commonconstants.MemberVerificationRequestedEvent,
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	}
}

// FS-V6SFK R24, R27: a member.verification_requested delivery is handed to the
// service and settled by its result under the existing retry policy: sent or
// duplicate is acked, a failed send is retried with delay, an unreadable body
// is dead-lettered. No log line, at any level, carries the code.
func TestHandleVerificationRequested(t *testing.T) {
	payload := verificationRequested(uuid.NewString())
	body, err := json.Marshal(payload)
	require.NoError(t, err)

	tests := []struct {
		name        string
		body        []byte
		serviceErr  error
		wantCalled  bool
		wantAcks    int
		wantNacks   int
		wantRetries int
	}{
		{"sent: acked", body, nil, true, 1, 0, 0},
		{"duplicate: acked, nothing sent", body, commonconstants.ErrAlreadyProcessed, true, 1, 0, 0},
		{"send failed: retried with delay", body, fmt.Errorf("send verification mail: %w", commonconstants.ErrTransient), true, 1, 0, 1},
		{"unreadable body: dead-lettered", []byte("{"), nil, false, 0, 1, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureErrorLogs(t)
			acker := &fakeAcknowledger{}
			svc := &fakeConsumerService{verificationErr: tt.serviceErr}
			pub := &fakeRetryPublisher{}
			c := &Consumer{service: svc, publisher: pub}

			c.handleVerificationRequested(verificationRequestedDelivery(t, acker, tt.body))

			assert.Equal(t, tt.wantCalled, svc.verificationPayload != nil, "service called")
			if tt.wantCalled {
				assert.Equal(t, payload.Code, svc.verificationPayload.Code)
				assert.Equal(t, payload.Email, svc.verificationPayload.Email)
			}
			assert.Equal(t, tt.wantAcks, acker.acks, "acks")
			assert.Equal(t, tt.wantNacks, acker.nacks, "nacks")
			assert.Len(t, pub.published, tt.wantRetries, "retry copies")
			assert.NotContains(t, logs.String(), testCode, "the code is in no log line")
		})
	}
}

// The verification queue is declared, bound and given retry queues like every
// other event this service consumes.
func TestEventRetryConfigs_IncludeVerificationRequested(t *testing.T) {
	var found *EventRetryConfig
	for _, cfg := range GetEventRetryConfigs() {
		if cfg.RoutingKey == commonconstants.MemberVerificationRequestedEvent {
			found = &cfg
		}
	}

	require.NotNil(t, found)
	assert.Equal(t, commonconstants.AuthEventsExchange, found.Exchange)
	assert.Equal(t, commonconstants.NotificationMemberVerificationRequestedQueue, found.WorkQueue)
	assert.Equal(t, commonconstants.NotificationMemberVerificationRequestedFailed, found.DLQKey)
}

// fakeLetterRequests records the letter requests the consumer handed the
// mailbox.
type fakeLetterRequests struct {
	err   error
	calls []*pb.LetterRequested
}

func (f *fakeLetterRequests) ProcessLetterRequested(ctx context.Context, evt *pb.LetterRequested) error {
	f.calls = append(f.calls, evt)
	return f.err
}

func letterRequestedDelivery(acker *fakeAcknowledger, body []byte) amqp.Delivery {
	return amqp.Delivery{
		Acknowledger: acker,
		RoutingKey:   commonconstants.MailLetterRequestedEvent,
		ContentType:  "application/x-protobuf",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	}
}

// FS-1GZGD R12: a mail.letter.requested delivery is handed to the mailbox and
// settled by its result: stored, duplicate and invalid (marked processed by
// the mailbox, which answers nil) are acked; items down is retried with delay;
// an unreadable body or any other failure is dead-lettered.
func TestHandleLetterRequested(t *testing.T) {
	evt := &pb.LetterRequested{
		EventId:   uuid.NewString(),
		Recipient: &pb.LetterRequested_MemberId{MemberId: uuid.NewString()},
		Title:     "A Debt Repaid",
		Body:      "The Wardens return what the barrow took.",
		Source:    "test.compensation",
	}
	body, err := proto.Marshal(evt)
	require.NoError(t, err)

	tests := []struct {
		name        string
		body        []byte
		mailboxErr  error
		wantCalled  bool
		wantAcks    int
		wantNacks   int
		wantRetries int
	}{
		{"stored or invalid: acked", body, nil, true, 1, 0, 0},
		{"duplicate: acked", body, commonconstants.ErrAlreadyProcessed, true, 1, 0, 0},
		{"items down: retried with delay", body, fmt.Errorf("prepare requested letter: %w", commonconstants.ErrTransient), true, 1, 0, 1},
		{"permanent failure: dead-lettered", body, errors.New("event id is not a uuid"), true, 0, 1, 0},
		{"unreadable body: dead-lettered", []byte{0xff, 0xff}, nil, false, 0, 1, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acker := &fakeAcknowledger{}
			letters := &fakeLetterRequests{err: tt.mailboxErr}
			pub := &fakeRetryPublisher{}
			c := &Consumer{letters: letters, publisher: pub}

			c.handleLetterRequested(letterRequestedDelivery(acker, tt.body))

			require.Equal(t, tt.wantCalled, len(letters.calls) == 1, "mailbox called")
			if tt.wantCalled {
				assert.True(t, proto.Equal(evt, letters.calls[0]), "the event as published")
			}
			assert.Equal(t, tt.wantAcks, acker.acks, "acks")
			assert.Equal(t, tt.wantNacks, acker.nacks, "nacks")
			assert.False(t, acker.requeued, "never nacked with requeue")
			assert.Len(t, pub.published, tt.wantRetries, "retry copies")
		})
	}
}

// The letter request queue is declared, bound and given retry queues like
// every other event this service consumes.
func TestEventRetryConfigs_IncludeLetterRequested(t *testing.T) {
	var found *EventRetryConfig
	for _, cfg := range GetEventRetryConfigs() {
		if cfg.RoutingKey == commonconstants.MailLetterRequestedEvent {
			found = &cfg
		}
	}

	require.NotNil(t, found)
	assert.Equal(t, commonconstants.MailboxEventsExchange, found.Exchange)
	assert.Equal(t, commonconstants.NotificationMailLetterRequestedQueue, found.WorkQueue)
	assert.Equal(t, commonconstants.NotificationMailLetterRequestedFailed, found.DLQKey)
}
