package items

import (
	"context"
	"errors"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/protobuf/proto"
)

type Consumer struct {
	service ConsumerService
	channel *amqp.Channel
}

type ConsumerService interface {
	ProcessItemsExtracted(ctx context.Context, eventID uuid.UUID, req *pb.ItemsExtractedEvent) error
	SetDedupLock(key string) (string, bool, error)
	CombineDedupKey(eventID uuid.UUID) string
	ReleaseLock(ctx context.Context, key string, lockID string) error
}

func (c *Consumer) Listen(ctx context.Context) {
	go c.consumeItemsExtracted(ctx)

	slog.Info("Items consumer listening for events...")
}

func NewConsumer(service ConsumerService, ch *amqp.Channel) *Consumer {
	return &Consumer{
		service: service,
		channel: ch,
	}
}

func (c *Consumer) consumeItemsExtracted(ctx context.Context) {
	msgs, err := c.channel.Consume(
		commonconstants.ItemsGameItemsExtractedQueue,
		"",
		false,
		false,
		false,
		false,
		nil,
	)

	if err != nil {
		slog.ErrorContext(ctx, "Failed to register consumer", "error", err)
		return
	}

	for msg := range msgs {
		var itemsExtracted pb.ItemsExtractedEvent
		slog.DebugContext(ctx, "Raw message received",
			"body_length", len(msg.Body),
			"content_type", msg.ContentType,
			"body_preview", string(msg.Body[:min(100, len(msg.Body))]),
		)

		if err := proto.Unmarshal(msg.Body, &itemsExtracted); err != nil {
			slog.ErrorContext(ctx, "Failed to parse items extracted event", "error", err)

			// dlq
			pubErr := c.PublishToDlq(ctx, msg, commonconstants.ValidationReason)
			if pubErr != nil {
				slog.ErrorContext(ctx, "failed to publish to DLQ", "err", pubErr)
				msg.Nack(false, true) // dlq失败的話就retry
				continue
			}
			msg.Ack(false) // 成功DLQ,移除原queue
			continue
		}

		slog.Info("after itemsExtractedEvent was emitted, consumed and proto unmarshalled",
			"items_extracted", itemsExtracted)

		// redis SETNX check if eventID has been processed before
		// if ok it means SETNX worked, a new key was set and hence event was
		// was never consumed before
		eventID, err := uuid.Parse(itemsExtracted.EventId)
		if err != nil {
			slog.ErrorContext(ctx, "invalid event id, discarding", "event_id", itemsExtracted.EventId, "err", err)
			// dlq
			pubErr := c.PublishToDlq(ctx, msg, commonconstants.InvalidEventIDReason)
			if pubErr != nil {
				slog.ErrorContext(ctx, "failed to publish to DLQ", "err", pubErr)
				msg.Nack(false, true) // dlq失败的話就retry
				continue
			}
			msg.Ack(false) // 成功DLQ,移除原queue
			continue
		}

		key := c.service.CombineDedupKey(eventID)
		lockID, ok, err := c.service.SetDedupLock(key)

		if err != nil {
			slog.ErrorContext(ctx, "Redis dedup check failed",
				"event_id", eventID,
				"err", err,
			)
		}

		// skip if already processed
		if !ok {
			slog.DebugContext(ctx, "Duplicate event, skipping",
				"event_id", itemsExtracted.EventId,
			)
			msg.Ack(false)
			continue
		}

		err = c.service.ProcessItemsExtracted(ctx, eventID, &itemsExtracted)

		if err != nil {
			// 重複的話就不刪除redis key , continue跳過這一輪
			if errors.Is(err, commonconstants.ErrAlreadyProcessed) {
				slog.InfoContext(ctx, "already processed",
					"event_id", eventID,
				)
				// 成功 不再重試
				msg.Ack(false)
				continue
			}
			// err是tx內的錯誤 等於流程錯誤inbox也無法建立 所以同時刪除dedup key
			releaseErr := c.service.ReleaseLock(ctx, key, lockID)
			if releaseErr != nil {
				slog.WarnContext(ctx, "failed to release redis",
					"event_id", eventID,
					"err", releaseErr,
				)
			}

			if errors.Is(err, commonconstants.ErrTransient) {
				slog.ErrorContext(ctx, "Items service could not process items extracted due to transient error. Requeuing message",
					"err", err,
				)
				// retry
				msg.Nack(false, true)
				continue
			}

			slog.ErrorContext(ctx, "Items service could not process items extracted.",
				"items_extracted", itemsExtracted,
				"err", err,
			)

			// dlq
			pubErr := c.PublishToDlq(ctx, msg, commonconstants.ProcessingFailedReason)
			if pubErr != nil {
				slog.ErrorContext(ctx, "failed to publish to DLQ", "err", pubErr)
				msg.Nack(false, true) // dlq失败的話就retry
				continue
			}
			msg.Ack(false) // 成功DLQ,移除原queue
			continue
		}
		msg.Ack(false)
	}
}

// Helper method to set up AMQP exchange and bindings
func SetupAMQPInfrastructure(channel *amqp.Channel) error {

	// --- Items Extracted Event ---

	err := channel.ExchangeDeclare(
		commonconstants.GameEventsExchange, // exchange name
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

	dlqErr := channel.ExchangeDeclare(
		commonconstants.ItemDlxEventsExchange,
		"direct",
		true,
		false,
		false,
		false,
		nil,
	)

	if dlqErr != nil {
		return dlqErr
	}

	// args := amqp.Table{
	// 	"x-dead-letter-exchange":    "dlx.items",       // 专属 DLX(要另外宣告)
	// 	"x-dead-letter-routing-key": "items.extracted", // dead letter用的 routing key
	// }
	// declare the queue
	_, err = channel.QueueDeclare(
		commonconstants.ItemsGameItemsExtractedQueue, // queue name
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,   // arguments dlq
	)
	if err != nil {
		slog.Error("Failed to declare queue", "error", err)
		return err
	}

	// dlq queue
	_, err = channel.QueueDeclare(commonconstants.ItemsDlqQueue, true, false, false, false, nil)
	if err != nil {
		slog.Error("Failed to declare items.dlq", "error", err)
		return err
	}

	// Bind the queue to the exchange
	err = channel.QueueBind(
		commonconstants.ItemsGameItemsExtractedQueue, // queue name
		commonconstants.ItemsExtracted,               // routing key
		commonconstants.GameEventsExchange,           // exchange
		false,                                        // no-wait
		nil,                                          // args
	)

	if err != nil {
		return err
	}

	slog.Info("Items AMQP infrastructure setup complete",
		"exchange", commonconstants.GameEventsExchange,
		"queue", commonconstants.ItemsGameItemsExtractedQueue,
	)

	err = channel.QueueBind(
		commonconstants.ItemsDlqQueue,
		commonconstants.ItemDlq,
		commonconstants.ItemDlxEventsExchange,
		false,
		nil,
	)

	if err != nil {
		return err
	}

	slog.Info("Items AMQP infrastructure setup complete",
		"exchange", commonconstants.ItemDlxEventsExchange,
		"queue", commonconstants.ItemsDlqQueue,
	)

	return nil
}

func (c *Consumer) PublishToDlq(ctx context.Context, msg amqp.Delivery, reason string) error {
	err := c.channel.PublishWithContext(ctx,
		commonconstants.ItemDlxEventsExchange,
		commonconstants.ItemDlq,
		false, false,
		amqp.Publishing{
			ContentType:   "application/protobuf",
			Body:          msg.Body,
			CorrelationId: msg.CorrelationId,
			DeliveryMode:  amqp.Persistent,
			Timestamp:     time.Now(),
			Headers: amqp.Table{
				"x-original-exchange":    msg.Exchange,
				"x-original-routing-key": msg.RoutingKey,
				"x-failure-reason":       reason,
				"x-failed-at":            time.Now().Format(time.RFC3339),
			},
		})
	return err
}
