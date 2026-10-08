package items

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/protobuf/proto"
)

type Consumer struct {
	service ConsumerService
	dedup   DedupLock
	channel *amqp.Channel
	retries retryPublisher
}

type ConsumerService interface {
	ProcessItemsExtracted(ctx context.Context, req *pb.ItemsExtractedEvent) error
}

// DedupLock marks an event as taken so a redelivered copy is not stored twice.
type DedupLock interface {
	AcquireLock(ctx context.Context, key string, ttl time.Duration) (lockID string, acquired bool, err error)
	ReleaseLock(ctx context.Context, key string, lockID string) error
}

// retryPublisher is what the consumer needs to park a failed message in a
// retry queue.
type retryPublisher interface {
	PublishWithContext(ctx context.Context, exchange, key string, mandatory, immediate bool, msg amqp.Publishing) error
}

// disposition is how a consumed message is settled.
type disposition int

const (
	ack    disposition = iota
	retry              // not the event's fault: try again after a delay
	reject             // malformed or refused: dead-letter to the DLQ, never retry
)

func (d disposition) String() string {
	return [...]string{"ack", "retry", "reject"}[d]
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

// deadLetterQueue parks rejected items.extracted events for inspection and
// replay; nothing is discarded.
var deadLetterQueue = extractedQueue + ".dlq"

// retryDelays is how long a failed items.extracted waits before each retry; a
// message's x-retry-count picks the step, and past the last step it keeps
// waiting at the last one. Retries never run out: a run's loot waits out an
// items-service store outage of any length.
var retryDelays = []time.Duration{5 * time.Second, 30 * time.Second, 2 * time.Minute}

const retryCountHeader = "x-retry-count"

// retryQueueName is the delay queue for one step. Delay queues dead-letter
// through the default exchange straight back into the work queue —
// republishing to game.events would redeliver the event to every subscriber.
func retryQueueName(step int) string {
	return fmt.Sprintf("%s.retry-%d", extractedQueue, step+1)
}

func (c *Consumer) Listen(ctx context.Context) {
	go c.consumeItemsExtracted(ctx)

	slog.Info("Items consumer listening for events...")
}

func NewConsumer(service ConsumerService, ch *amqp.Channel, dedup DedupLock) *Consumer {
	return &Consumer{
		service: service,
		channel: ch,
		retries: ch,
		dedup:   dedup,
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
		c.settle(ctx, msg, c.handleItemsExtracted(ctx, msg.Body))
	}
}

// settle carries out a disposition. A retry is never requeued in place — an
// immediate redelivery of a failing message is a hot loop — but forwarded to
// the delay queue for its step, then acked. A reject is nacked without
// requeue, which the work queue dead-letters to the DLQ.
func (c *Consumer) settle(ctx context.Context, msg amqp.Delivery, d disposition) {
	var err error
	switch d {
	case ack:
		err = msg.Ack(false)
	case reject:
		err = msg.Nack(false, false)
	case retry:
		err = c.forwardToRetry(ctx, msg)
	}
	if err != nil {
		slog.Error("failed to settle items extracted message", "disposition", d, "error", err)
	}
}

// forwardToRetry publishes a copy to the delay queue for the message's retry
// count, then acks the original. If the publish fails the broker channel is
// almost certainly gone, so the original is returned to its queue: an outage
// loses nothing.
func (c *Consumer) forwardToRetry(ctx context.Context, msg amqp.Delivery) error {
	count := retryCountOf(msg)
	step := min(count, len(retryDelays)-1)
	queue := retryQueueName(step)

	headers := amqp.Table{}
	for k, v := range msg.Headers {
		headers[k] = v
	}
	headers[retryCountHeader] = int32(count + 1)

	if err := c.retries.PublishWithContext(ctx, "", queue, false, false, amqp.Publishing{
		ContentType:  msg.ContentType,
		DeliveryMode: amqp.Persistent,
		Headers:      headers,
		Body:         msg.Body,
	}); err != nil {
		slog.Error("failed to forward items extracted to retry, returning it to the queue", "queue", queue, "error", err)
		return msg.Nack(false, true)
	}

	log := slog.With("queue", queue, "retry", count+1, "delay", retryDelays[step])
	if count >= len(retryDelays) {
		log.Error("items extracted still failing, retrying at the longest delay")
	} else {
		log.Warn("items extracted failed, retrying after delay")
	}
	return msg.Ack(false)
}

func retryCountOf(msg amqp.Delivery) int {
	switch n := msg.Headers[retryCountHeader].(type) {
	case int32:
		return int(n)
	case int64:
		return int(n)
	}
	return 0
}

// handleItemsExtracted stores one items.extracted event and says how to settle
// it. Only a stored (or already stored) event is acked. A malformed event, or
// one the store refuses, is rejected to the DLQ; any other failure — transient,
// a held row lock, or unrecognised (a refused connection, an administrator
// shutdown) — is the store's, not the event's, and retries after a delay. The
// dedup mark is released on failure so a retried or replayed copy is
// processed, not skipped as a duplicate (FS-4R9M9 R49).
func (c *Consumer) handleItemsExtracted(ctx context.Context, body []byte) disposition {
	var itemsExtracted pb.ItemsExtractedEvent
	slog.Debug("Raw message received",
		"body_length", len(body),
		"body_preview", string(body[:min(100, len(body))]),
	)

	if err := proto.Unmarshal(body, &itemsExtracted); err != nil {
		slog.Error("Failed to parse items extracted event", "error", err)
		return reject
	}

	slog.Info("after itemsExtractedEvent was emitted, consumed and proto unmarshalled",
		"items_extracted", &itemsExtracted)

	// SETNX on the event id: acquired means it was never consumed before
	key := fmt.Sprintf("dedup:items:%s", itemsExtracted.EventId)
	lockID, ok, err := c.dedup.AcquireLock(ctx, key, time.Hour*24)
	if err != nil {
		slog.Error("Redis dedup check failed",
			"event_id", itemsExtracted.EventId,
			"err", err,
		)
		return retry
	}

	// skip if already processed
	if !ok {
		slog.Debug("Duplicate event, skipping",
			"event_id", itemsExtracted.EventId,
		)
		return ack
	}

	err = c.service.ProcessItemsExtracted(ctx, &itemsExtracted)
	if err == nil {
		return ack
	}

	if releaseErr := c.dedup.ReleaseLock(ctx, key, lockID); releaseErr != nil {
		slog.Error("could not release dedup mark of a failed items extracted event",
			"event_id", itemsExtracted.EventId,
			"err", releaseErr,
		)
	}

	if permanentExtractionFailure(err) {
		slog.Error("Items service refused items extracted, dead-lettering it",
			"items_extracted", &itemsExtracted,
			"err", err,
		)
		return reject
	}

	slog.Warn("Items service could not store items extracted, retrying after a delay",
		"event_id", itemsExtracted.EventId,
		"err", err,
	)
	return retry
}

// permanentExtractionFailure reports whether a store failure is the event's own
// fault, so retrying it can never succeed.
func permanentExtractionFailure(err error) bool {
	for _, permanent := range []error{
		commonconstants.ErrUUIDCouldNotBeParsed,
		commonconstants.ErrConstraintViolation,
		commonconstants.ErrInvalidInput,
	} {
		if errors.Is(err, permanent) {
			return true
		}
	}
	return false
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
