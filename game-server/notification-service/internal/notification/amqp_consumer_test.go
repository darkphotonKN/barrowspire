package notification

import (
	"bytes"
	"context"
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
