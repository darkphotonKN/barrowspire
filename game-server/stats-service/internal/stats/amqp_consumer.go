package stats

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/lib/pq"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/protobuf/proto"
)

// matchEndedQueue is stats-service's work queue for match.ended. It replaces
// the arg-less legacy StatsGameMatchEndedQueue: a durable queue's arguments
// cannot change in place, and redeclaring the legacy queue with a dead-letter
// exchange fails with PRECONDITION_FAILED, closing the channel the service also
// publishes on.
var matchEndedQueue = commonconstants.StatsGameMatchEndedQueue + ".v2"

// matchEndedDLQ parks dead-lettered match.ended events for inspection and
// replay; nothing is discarded.
var matchEndedDLQ = matchEndedQueue + ".dlq"

// retryDelays is how long a failed match.ended waits before each retry; a
// message's x-retry-count picks the step, and past the last step it keeps
// waiting at the last one.
var retryDelays = []time.Duration{5 * time.Second, 30 * time.Second, 2 * time.Minute}

// retryQueueName is the delay queue for one step. Delay queues dead-letter
// through the default exchange straight back into the work queue:
// republishing to game.events would redeliver the event to every subscriber.
func retryQueueName(step int) string {
	return fmt.Sprintf("%s.retry-%d", matchEndedQueue, step+1)
}

// disposition is how a consumed message is settled.
type disposition int

const (
	ack          disposition = iota
	retry                    // the infrastructure's fault: retry after a delay, without end
	retryBounded             // a reference not there yet: retry after a delay, then dead-letter
	reject                   // malformed or a bug: dead-letter now, never retry
)

func (d disposition) String() string {
	return [...]string{"ack", "retry", "retry_bounded", "reject"}[d]
}

// x-dlq-reason values: why a message was dead-lettered.
const (
	dlqReasonMalformed        = "malformed"
	dlqReasonRetriesExhausted = "retries_exhausted"
	dlqReasonMissingMessageID = "missing_message_id"
	dlqReasonInvalidMessageID = "invalid_message_id"
)

// outcome is what handling one message decided: how to settle it and, for a
// failure, why.
type outcome struct {
	disposition disposition
	dlqReason   string // x-dlq-reason when a reject is dead-lettered
	cause       error  // the failure, recorded as x-last-error
}

func rejected(reason string, cause error) outcome {
	return outcome{disposition: reject, dlqReason: reason, cause: cause}
}

// classify turns a processing failure into how the message is settled. The
// order matters: a foreign-key violation is also reported as a constraint
// violation, but it is a reference that may not exist yet, not a malformed
// event.
func classify(err error) outcome {
	var pqErr *pq.Error
	switch {
	case errors.As(err, &pqErr) && pqErr.Code == foreignKeyViolation,
		errors.Is(err, commonconstants.ErrNotFound):
		return outcome{disposition: retryBounded, cause: err}
	case errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed),
		errors.Is(err, commonconstants.ErrConstraintViolation),
		errors.Is(err, commonconstants.ErrInvalidInput):
		return rejected(dlqReasonMalformed, err)
	}
	return outcome{disposition: retry, cause: err}
}

// Headers the consumer stamps on a copy it forwards.
const (
	retryCountHeader      = "x-retry-count"      // retries already made, of any kind; picks the delay step
	boundedAttemptsHeader = "x-bounded-attempts" // bounded (missing-reference) attempts already failed
	dlqReasonHeader       = "x-dlq-reason"       // why the copy was dead-lettered
	lastErrorHeader       = "x-last-error"       // the failure that sent it there
)

// maxBoundedAttempts is how many times a bounded retry is processed in all
// before it is dead-lettered as retries_exhausted. Only bounded failures count
// toward it: retries spent waiting out an outage are counted in x-retry-count,
// so an event that waited out a long outage still gets its full ten attempts
// at a missing reference.
const maxBoundedAttempts = 10

// settle carries out an outcome. Nothing is ever requeued in place, since an
// immediate redelivery of a failing message is a hot loop: a retry is forwarded
// to the delay queue for its step, a reject to the DLQ, then the original is
// acked.
func (c *Consumer) settle(ctx context.Context, msg amqp.Delivery, o outcome) {
	var err error
	switch o.disposition {
	case ack:
		err = msg.Ack(false)
	case reject:
		err = c.deadLetter(ctx, msg, headersOf(msg), o.dlqReason, o.cause)
	case retryBounded:
		attempts := boundedAttemptsOf(msg) + 1
		headers := headersOf(msg)
		headers[boundedAttemptsHeader] = int32(attempts)
		if attempts >= maxBoundedAttempts {
			err = c.deadLetter(ctx, msg, headers, dlqReasonRetriesExhausted, o.cause)
			break
		}
		err = c.forwardToRetry(ctx, msg, headers, o.cause)
	case retry:
		err = c.forwardToRetry(ctx, msg, headersOf(msg), o.cause)
	}
	if err != nil {
		slog.Error("failed to settle match ended message", "disposition", o.disposition, "error", err)
	}
}

// forwardToRetry publishes a copy, carrying headers, to the delay queue for
// the message's retry count, and acks the original only once the broker has
// confirmed the copy. If the copy is not confirmed (a publish error, a nack, a
// timeout, or an unroutable return), the original is returned to its queue: a
// broker outage or a missing delay queue loses nothing.
func (c *Consumer) forwardToRetry(ctx context.Context, msg amqp.Delivery, headers amqp.Table, cause error) error {
	count := retryCountOf(msg)
	step := min(count, len(retryDelays)-1)
	queue := retryQueueName(step)

	headers[retryCountHeader] = int32(count + 1)

	if err := c.broker.Republish(ctx, queue, copyOf(msg, headers)); err != nil {
		slog.Error("failed to forward match ended to retry, returning it to the queue",
			"queue", queue, "message_id", msg.MessageId, "error", err)
		return msg.Nack(false, true)
	}

	log := slog.With("queue", queue, "message_id", msg.MessageId, "retry", count+1, "delay", retryDelays[step], "cause", cause)
	if count >= len(retryDelays) {
		log.Error("match ended still failing, retrying at the longest delay")
	} else {
		log.Warn("match ended failed, retrying after delay")
	}
	return msg.Ack(false)
}

// deadLetter publishes a copy, carrying headers plus both retry counts and
// why it was dead-lettered, to the DLQ, and acks the original only once the
// broker has confirmed the copy. If the copy is not confirmed the original is
// nacked without requeue, so the work queue's dead-letter exchange still parks
// it in the DLQ, only without the reason.
func (c *Consumer) deadLetter(ctx context.Context, msg amqp.Delivery, headers amqp.Table, reason string, cause error) error {
	headers[retryCountHeader] = int32(retryCountOf(msg))
	if _, ok := headers[boundedAttemptsHeader]; !ok {
		headers[boundedAttemptsHeader] = int32(boundedAttemptsOf(msg))
	}
	headers[dlqReasonHeader] = reason
	if cause != nil {
		headers[lastErrorHeader] = cause.Error()
	}

	if err := c.broker.Republish(ctx, matchEndedDLQ, copyOf(msg, headers)); err != nil {
		slog.Error("failed to dead-letter match ended with a reason, nacking it to the dead-letter exchange",
			"message_id", msg.MessageId, "reason", reason, "error", err)
		return msg.Nack(false, false)
	}

	slog.Error("match ended dead-lettered",
		"queue", matchEndedDLQ, "message_id", msg.MessageId, "reason", reason, "cause", cause)
	return msg.Ack(false)
}

// headersOf copies a delivery's headers so a forwarded copy can add its own.
func headersOf(msg amqp.Delivery) amqp.Table {
	headers := amqp.Table{}
	for k, v := range msg.Headers {
		headers[k] = v
	}
	return headers
}

// copyOf is the delivery republished as the same event: body, MessageId (the
// consumer's dedup key) and properties preserved, persistent. Expiration and
// UserId are left out: a per-message TTL could expire the copy, and the broker
// refuses a UserId that is not the publishing connection's.
func copyOf(msg amqp.Delivery, headers amqp.Table) amqp.Publishing {
	return amqp.Publishing{
		Headers:         headers,
		ContentType:     msg.ContentType,
		ContentEncoding: msg.ContentEncoding,
		DeliveryMode:    amqp.Persistent,
		Priority:        msg.Priority,
		CorrelationId:   msg.CorrelationId,
		ReplyTo:         msg.ReplyTo,
		MessageId:       msg.MessageId,
		Timestamp:       msg.Timestamp,
		Type:            msg.Type,
		AppId:           msg.AppId,
		Body:            msg.Body,
	}
}

func retryCountOf(msg amqp.Delivery) int {
	return intHeader(msg, retryCountHeader)
}

func boundedAttemptsOf(msg amqp.Delivery) int {
	return intHeader(msg, boundedAttemptsHeader)
}

// intHeader reads a count header; the broker may hand an int32 back as int64.
func intHeader(msg amqp.Delivery, name string) int {
	switch n := msg.Headers[name].(type) {
	case int32:
		return int(n)
	case int64:
		return int(n)
	}
	return 0
}

// ConsumerService defines what the consumer needs from the service
type ConsumerService interface {
	ProcessMatchCompleted(ctx context.Context, eventID uuid.UUID, eventType string, req *pb.MatchEndedEvent) error
	UpdatePlayerRankings(ctx context.Context, updateData *pb.MemberProfileUpdatedEvent) error
}

type Consumer struct {
	service ConsumerService
	channel *amqp.Channel
	broker  republisher
}

// republisher is what the consumer needs to park a failed message's copy in a
// delay queue or the DLQ. Republish returns nil only once the broker has
// confirmed the copy reached queue; any error means the copy may be lost, so
// the original must not be acked.
type republisher interface {
	Republish(ctx context.Context, queue string, msg amqp.Publishing) error
}

// NewConsumer consumes from channel and republishes retries and dead letters
// through broker, which must confirm each copy; channel is never published on.
func NewConsumer(service ConsumerService, channel *amqp.Channel, broker republisher) *Consumer {
	return &Consumer{
		service: service,
		channel: channel,
		broker:  broker,
	}
}

// Listen sets the channel's prefetch, then starts consuming the configured
// queues. Both consumers share one channel and a basic.qos applies to the
// consumers started after it, so it is set once here, before either starts,
// rather than raced from inside the consumer goroutines.
func (c *Consumer) Listen() error {
	if err := c.channel.Qos(matchEndedPrefetch, 0, false); err != nil {
		return fmt.Errorf("set prefetch %d: %w", matchEndedPrefetch, err)
	}

	go c.consumeMatchEnded(context.Background())
	go c.consumeProfileUpdated()

	slog.Info("Stats consumer listening for events...")
	return nil
}

func (c *Consumer) consumeProfileUpdated() {
	msgs, err := c.channel.Consume(
		commonconstants.StatsAuthProfileUpdatedQueue,
		"",
		false,
		false,
		false,
		false,
		nil,
	)

	if err != nil {
		slog.Error("Failed to register consumer", "error", err)
		return
	}

	for msg := range msgs {
		var memberUpdated pb.MemberProfileUpdatedEvent

		if err := proto.Unmarshal(msg.Body, &memberUpdated); err != nil {
			slog.Error("Failed to parse member profile updated event", "error", err)
			msg.Nack(false, false)
			continue
		}

		slog.Info("after member profile updated data unmarshal",
			"member_updated", &memberUpdated)

		err := c.service.UpdatePlayerRankings(context.Background(), &memberUpdated)

		if err != nil {
			if errors.Is(err, commonconstants.ErrTransient) {
				slog.Warn("Transient error, retrying", "error", err, "member_id", memberUpdated.MemberId)
				msg.Nack(false, true)
				continue
			}

			slog.Error("Failed to update member profile data after consuming memberProfileUpdatedEvent event", "error", err)
			msg.Nack(false, false)
			continue
		}

		msg.Ack(false)

		slog.Info("PlayerRankings updated successfully following member profile update",
			"member_id", memberUpdated.MemberId,
			"success", true,
			"message", "PlayerRankings updated successfully following member profile update",
		)
	}
}

// matchEndedPrefetch bounds how many unsettled messages the broker hands each
// consumer on the channel at once; Listen sets it before starting them.
const matchEndedPrefetch = 10

func (c *Consumer) consumeMatchEnded(ctx context.Context) {
	msgs, err := c.channel.Consume(matchEndedQueue, "", false, false, false, false, nil)
	if err != nil {
		slog.Error("Failed to register consumer", "queue", matchEndedQueue, "error", err)
		return
	}

	for msg := range msgs {
		c.settle(ctx, msg, c.handleMatchEnded(ctx, msg))
	}
}

// handleMatchEnded applies one match.ended event and says how to settle it.
// The delivery's MessageId (the producer's outbox row id) is the dedup key; the
// event type is the routing key the work queue is bound to, not the delivery's,
// which on a retry is the work-queue name the delay queue dead-lettered to.
func (c *Consumer) handleMatchEnded(ctx context.Context, msg amqp.Delivery) outcome {
	if msg.MessageId == "" {
		slog.Error("match ended has no message id, dead-lettering it")
		return rejected(dlqReasonMissingMessageID, errors.New("match ended has no message id"))
	}
	eventID, err := uuid.Parse(msg.MessageId)
	if err != nil {
		slog.Error("match ended message id is not a uuid, dead-lettering it", "message_id", msg.MessageId, "error", err)
		return rejected(dlqReasonInvalidMessageID, fmt.Errorf("message id %q: %w: %w", msg.MessageId, commonconstants.ErrUUIDCouldNotBeParsed, err))
	}
	eventType := commonconstants.GameMatchEnded

	var event pb.MatchEndedEvent
	if err := proto.Unmarshal(msg.Body, &event); err != nil {
		slog.Error("Failed to parse match ended event, dead-lettering it", "event_id", eventID, "error", err)
		return rejected(dlqReasonMalformed, fmt.Errorf("unmarshal match ended: %w", err))
	}

	err = c.service.ProcessMatchCompleted(ctx, eventID, eventType, &event)
	switch {
	case errors.Is(err, commonconstants.ErrAlreadyProcessed):
		slog.Info("match ended already processed, acking",
			"event_id", eventID, "event_type", eventType, "session_id", event.SessionId)
		return outcome{disposition: ack}
	case err != nil:
		o := classify(err)
		slog.Warn("Failed to process match ended",
			"event_id", eventID,
			"session_id", event.SessionId,
			"disposition", o.disposition,
			"error", err,
		)
		return o
	}

	slog.Info("Match ended processed",
		"event_id", eventID, "event_type", eventType, "session_id", event.SessionId)
	return outcome{disposition: ack}
}

// topologyDeclarer is what declaring the broker topology needs from the
// channel.
type topologyDeclarer interface {
	ExchangeDeclare(name, kind string, durable, autoDelete, internal, noWait bool, args amqp.Table) error
	QueueDeclare(name string, durable, autoDelete, exclusive, noWait bool, args amqp.Table) (amqp.Queue, error)
	QueueBind(name, key, exchange string, noWait bool, args amqp.Table) error
}

// declareMatchEndedTopology declares the game.events exchange, the match.ended
// work queue (dead-lettering to its DLQ) and its binding, the DLQ and the delay
// queues. The legacy arg-less queue is left alone on the broker for an
// operator to drain and delete.
func declareMatchEndedTopology(ch topologyDeclarer) error {
	if err := ch.ExchangeDeclare(commonconstants.GameEventsExchange, "topic", true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare exchange %s: %w", commonconstants.GameEventsExchange, err)
	}
	if _, err := ch.QueueDeclare(matchEndedDLQ, true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare queue %s: %w", matchEndedDLQ, err)
	}
	if _, err := ch.QueueDeclare(matchEndedQueue, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    "",
		"x-dead-letter-routing-key": matchEndedDLQ,
	}); err != nil {
		return fmt.Errorf("declare queue %s: %w", matchEndedQueue, err)
	}
	if err := ch.QueueBind(matchEndedQueue, commonconstants.GameMatchEnded, commonconstants.GameEventsExchange, false, nil); err != nil {
		return fmt.Errorf("bind queue %s: %w", matchEndedQueue, err)
	}
	for step, delay := range retryDelays {
		if _, err := ch.QueueDeclare(retryQueueName(step), true, false, false, false, amqp.Table{
			"x-message-ttl":             int32(delay / time.Millisecond),
			"x-dead-letter-exchange":    "",
			"x-dead-letter-routing-key": matchEndedQueue,
		}); err != nil {
			return fmt.Errorf("declare queue %s: %w", retryQueueName(step), err)
		}
	}
	return nil
}

// SetupAMQPInfrastructure declares the topology both consumers rely on.
func SetupAMQPInfrastructure(channel *amqp.Channel) error {
	if err := declareMatchEndedTopology(channel); err != nil {
		return fmt.Errorf("declare match ended topology: %w", err)
	}

	// --- Member Profile Update ---

	err := channel.ExchangeDeclare(
		commonconstants.AuthEventsExchange, // exchange name
		"topic",                            // exchange type
		true,                               // durable
		false,                              // auto-deleted
		false,                              // internal
		false,                              // no-wait
		nil,                                // arguments
	)
	if err != nil {
		return err
	}

	// Declare the queue
	_, err = channel.QueueDeclare(
		commonconstants.StatsAuthProfileUpdatedQueue, // queue name
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)

	if err != nil {
		slog.Error("Failed to declare queue", "error", err)
		return err
	}

	// Bind the queue to the exchange
	err = channel.QueueBind(
		commonconstants.StatsAuthProfileUpdatedQueue, // queue name
		commonconstants.MemberProfileUpdated,         // routing key
		commonconstants.AuthEventsExchange,           // exchange
		false,                                        // no-wait
		nil,                                          // args
	)
	if err != nil {
		return err
	}

	return nil
}
