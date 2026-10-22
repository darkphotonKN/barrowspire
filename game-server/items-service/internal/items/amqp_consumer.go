package items

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

type Consumer struct {
	service ConsumerService
	channel *amqp.Channel
	broker  republisher
}

type ConsumerService interface {
	ProcessItemsExtracted(ctx context.Context, eventID uuid.UUID, eventType string, req *pb.ItemsExtractedEvent) error
}

// republisher is what the consumer needs to park a failed message's copy in a
// delay queue or the DLQ. Republish returns nil only once the broker has
// confirmed the copy reached queue; any error means the copy may be lost, so
// the original must not be acked.
type republisher interface {
	Republish(ctx context.Context, queue string, msg amqp.Publishing) error
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

// extractedPrefetch bounds how many unsettled items.extracted messages the
// broker hands this consumer at once.
const extractedPrefetch = 10

// extractedQueue is items-service's work queue for items.extracted. It replaces
// the arg-less legacy ItemsGameItemsExtractedQueue: a durable queue's arguments
// cannot change in place, and redeclaring the legacy queue with a dead-letter
// exchange fails with PRECONDITION_FAILED, closing the channel the service also
// publishes on.
var extractedQueue = commonconstants.ItemsGameItemsExtractedQueue + ".v2"

// deadLetterQueue parks dead-lettered items.extracted events for inspection and
// replay; nothing is discarded.
var deadLetterQueue = extractedQueue + ".dlq"

// retryDelays is how long a failed items.extracted waits before each retry; a
// message's x-retry-count picks the step, and past the last step it keeps
// waiting at the last one. Unbounded retries never run out: a run's loot waits
// out an items-service store outage of any length.
var retryDelays = []time.Duration{5 * time.Second, 30 * time.Second, 2 * time.Minute}

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

// retryQueueName is the delay queue for one step. Delay queues dead-letter
// through the default exchange straight back into the work queue:
// republishing to game.events would redeliver the event to every subscriber.
func retryQueueName(step int) string {
	return fmt.Sprintf("%s.retry-%d", extractedQueue, step+1)
}

func (c *Consumer) Listen(ctx context.Context) {
	go c.consumeItemsExtracted(ctx)

	slog.Info("Items consumer listening for events...")
}

// NewConsumer consumes from ch and republishes retries and dead letters
// through broker, which must confirm each copy; ch is never published on.
func NewConsumer(service ConsumerService, ch *amqp.Channel, broker republisher) *Consumer {
	return &Consumer{
		service: service,
		channel: ch,
		broker:  broker,
	}
}

func (c *Consumer) consumeItemsExtracted(ctx context.Context) {
	if err := c.channel.Qos(extractedPrefetch, 0, false); err != nil {
		slog.Error("failed to set prefetch", "queue", extractedQueue, "error", err)
		return
	}

	msgs, err := c.channel.Consume(extractedQueue, "", false, false, false, false, nil)
	if err != nil {
		slog.Error("Failed to register consumer", "queue", extractedQueue, "error", err)
		return
	}

	for msg := range msgs {
		c.settle(ctx, msg, c.handleItemsExtracted(ctx, msg))
	}
}

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
		slog.Error("failed to settle items extracted message", "disposition", o.disposition, "error", err)
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
		slog.Error("failed to forward items extracted to retry, returning it to the queue",
			"queue", queue, "message_id", msg.MessageId, "error", err)
		return msg.Nack(false, true)
	}

	log := slog.With("queue", queue, "message_id", msg.MessageId, "retry", count+1, "delay", retryDelays[step], "cause", cause)
	if count >= len(retryDelays) {
		log.Error("items extracted still failing, retrying at the longest delay")
	} else {
		log.Warn("items extracted failed, retrying after delay")
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

	if err := c.broker.Republish(ctx, deadLetterQueue, copyOf(msg, headers)); err != nil {
		slog.Error("failed to dead-letter items extracted with a reason, nacking it to the dead-letter exchange",
			"message_id", msg.MessageId, "reason", reason, "error", err)
		return msg.Nack(false, false)
	}

	slog.Error("items extracted dead-lettered",
		"queue", deadLetterQueue, "message_id", msg.MessageId, "reason", reason, "cause", cause)
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

// handleItemsExtracted stores one items.extracted event exactly once and says
// how to settle it. The dedup key is the delivery's MessageId, the producer's
// outbox row id; the event type is the routing key the work queue is bound to,
// never the delivery's, which on a retried copy is the work queue's name
// (FS-BVM9H Req 1, 2). A delivery without a usable MessageId is a producer bug
// and is dead-lettered before anything is read or written (Req 4). A duplicate
// is acked (Req 10); a failure is classified (Req 12).
func (c *Consumer) handleItemsExtracted(ctx context.Context, msg amqp.Delivery) outcome {
	if msg.MessageId == "" {
		slog.Error("items extracted has no message id, dead-lettering it")
		return rejected(dlqReasonMissingMessageID, errors.New("items extracted has no message id"))
	}
	eventID, err := uuid.Parse(msg.MessageId)
	if err != nil {
		slog.Error("items extracted message id is not a uuid, dead-lettering it", "message_id", msg.MessageId, "error", err)
		return rejected(dlqReasonInvalidMessageID, fmt.Errorf("message id %q: %w: %w", msg.MessageId, commonconstants.ErrUUIDCouldNotBeParsed, err))
	}

	var itemsExtracted pb.ItemsExtractedEvent
	if err := proto.Unmarshal(msg.Body, &itemsExtracted); err != nil {
		slog.Error("Failed to parse items extracted event, dead-lettering it", "message_id", eventID, "error", err)
		return rejected(dlqReasonMalformed, fmt.Errorf("unmarshal items extracted: %w", err))
	}

	slog.Info("after itemsExtractedEvent was emitted, consumed and proto unmarshalled",
		"message_id", eventID, "items_extracted", &itemsExtracted)

	err = c.service.ProcessItemsExtracted(ctx, eventID, commonconstants.ItemsExtracted, &itemsExtracted)
	if err == nil {
		return outcome{disposition: ack}
	}
	if errors.Is(err, commonconstants.ErrAlreadyProcessed) {
		slog.Info("items extracted already processed, acking duplicate",
			"event_id", eventID, "event_type", commonconstants.ItemsExtracted)
		return outcome{disposition: ack}
	}

	o := classify(err)
	slog.Warn("Failed to process items extracted",
		"message_id", eventID,
		"event_id", itemsExtracted.EventId,
		"disposition", o.disposition,
		"error", err,
	)
	return o
}

// topologyDeclarer is what declaring the items.extracted topology needs from
// the broker channel.
type topologyDeclarer interface {
	ExchangeDeclare(name, kind string, durable, autoDelete, internal, noWait bool, args amqp.Table) error
	QueueDeclare(name string, durable, autoDelete, exclusive, noWait bool, args amqp.Table) (amqp.Queue, error)
	QueueBind(name, key, exchange string, noWait bool, args amqp.Table) error
}

// SetupAMQPInfrastructure declares the items.extracted topology the consumer
// relies on.
func SetupAMQPInfrastructure(channel *amqp.Channel) error {
	if err := declareExtractedTopology(channel); err != nil {
		return err
	}

	slog.Info("Items AMQP infrastructure setup complete",
		"exchange", commonconstants.GameEventsExchange,
		"queue", extractedQueue,
		"dlq", deadLetterQueue,
	)
	return nil
}

// declareExtractedTopology declares the game.events exchange, the work queue
// (dead-lettering rejects to the DLQ) and its binding, the DLQ and the delay
// queues.
func declareExtractedTopology(ch topologyDeclarer) error {
	if err := ch.ExchangeDeclare(commonconstants.GameEventsExchange, "topic", true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare exchange %s: %w", commonconstants.GameEventsExchange, err)
	}
	if _, err := ch.QueueDeclare(deadLetterQueue, true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare queue %s: %w", deadLetterQueue, err)
	}
	if _, err := ch.QueueDeclare(extractedQueue, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    "",
		"x-dead-letter-routing-key": deadLetterQueue,
	}); err != nil {
		return fmt.Errorf("declare queue %s: %w", extractedQueue, err)
	}
	if err := ch.QueueBind(extractedQueue, commonconstants.ItemsExtracted, commonconstants.GameEventsExchange, false, nil); err != nil {
		return fmt.Errorf("bind queue %s: %w", extractedQueue, err)
	}
	for step, delay := range retryDelays {
		if _, err := ch.QueueDeclare(retryQueueName(step), true, false, false, false, amqp.Table{
			"x-message-ttl":             int32(delay / time.Millisecond),
			"x-dead-letter-exchange":    "",
			"x-dead-letter-routing-key": extractedQueue,
		}); err != nil {
			return fmt.Errorf("declare queue %s: %w", retryQueueName(step), err)
		}
	}
	return nil
}
