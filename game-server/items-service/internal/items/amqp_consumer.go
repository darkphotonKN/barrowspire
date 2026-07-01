package items

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commoncache "github.com/darkphotonKN/barrowspire-server/common/utils/cache"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/protobuf/proto"
)

type Consumer struct {
	service ConsumerService
	cache   commoncache.Cache
	channel *amqp.Channel
}

type ConsumerService interface {
	ProcessItemsExtracted(ctx context.Context, eventID uuid.UUID, req *pb.ItemsExtractedEvent) error
}

func (c *Consumer) Listen(ctx context.Context) {
	go c.consumeItemsExtracted(ctx)

	slog.Info("Items consumer listening for events...")
}

func NewConsumer(service ConsumerService, ch *amqp.Channel, cache commoncache.Cache) *Consumer {
	return &Consumer{
		service: service,
		channel: ch,
		cache:   cache,
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
		slog.Error("Failed to register consumer", "error", err)
		return
	}

	for msg := range msgs {
		var itemsExtracted pb.ItemsExtractedEvent
		slog.Debug("Raw message received",
			"body_length", len(msg.Body),
			"content_type", msg.ContentType,
			"body_preview", string(msg.Body[:min(100, len(msg.Body))]),
		)

		if err := proto.Unmarshal(msg.Body, &itemsExtracted); err != nil {
			slog.Error("Failed to parse items extracted event", "error", err)
			msg.Nack(false, false) // dlq
			continue
		}

		slog.Info("after itemsExtractedEvent was emitted, consumed and proto unmarshalled",
			"items_extracted", itemsExtracted)

		// redis SETNX check if eventID has been processed before
		// if ok it means SETNX worked, a new key was set and hence event was
		// was never consumed before
		eventID, err := uuid.Parse(itemsExtracted.EventId)
		if err != nil {
			slog.Error("invalid event id, discarding", "event_id", itemsExtracted.EventId, "err", err)
			msg.Nack(false, false)
			continue
		}
		key := fmt.Sprintf("dedup:items:%s", eventID)
		lockID, ok, err := c.cache.AcquireLock(context.Background(), key, time.Hour*24)

		if err != nil {
			slog.Error("Redis dedup check failed",
				"event_id", eventID,
				"err", err,
			)
			msg.Nack(false, true) // retry when redis errored
			continue
		}

		// skip if already processed
		if !ok {
			slog.Debug("Duplicate event, skipping",
				"event_id", itemsExtracted.EventId,
			)
			msg.Ack(false)
			continue
		}

		err = c.service.ProcessItemsExtracted(ctx, eventID, &itemsExtracted)

		if err != nil {
			// 重複的話就不刪除redis key , continue跳過這一輪
			if errors.Is(err, commonconstants.ErrAlreadyProcessed) {
				slog.Info("already processed",
					"event_id", eventID,
				)
				// 成功 不再重試
				msg.Ack(false)
				continue
			}
			// err是tx內的錯誤 等於流程錯誤inbox也無法建立 所以同時刪除dedup key
			if releaseErr := c.cache.ReleaseLock(context.Background(), key, lockID); releaseErr != nil {
				slog.Warn("failed to release redis",
					"event_id", eventID,
					"err", releaseErr,
				)
			}

			if errors.Is(err, commonconstants.ErrTransient) {
				slog.Error("Items service could not process items extracted due to transient error. Requeuing message",
					"err", err,
				)
				// retry
				msg.Nack(false, true)
				continue
			}

			slog.Error("Items service could not process items extracted.",
				"items_extracted", itemsExtracted,
				"err", err,
			)

			msg.Nack(false, false)
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

	args := amqp.Table{
		"x-dead-letter-exchange":    "dlx.items",       // 专属 DLX(要另外宣告)
		"x-dead-letter-routing-key": "items.extracted", // dead letter用的 routing key
	}
	// declare the queue
	_, err = channel.QueueDeclare(
		commonconstants.ItemsGameItemsExtractedQueue, // queue name
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		args,  // arguments dlq
	)
	if err != nil {
		slog.Error("Failed to declare queue", "error", err)
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

	return nil
}
