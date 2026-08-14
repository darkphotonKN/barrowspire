package listing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/protobuf/proto"
)

// ListingCreatedEvent is the exchange / routing key this service will publish and
// consume once the listing domain is built out. Kept local for now (no shared
// constant yet) — it follows the broker naming convention documented in
// common/constants ({resource}.{action}).
const ListingCreatedEvent = "listing.created"
const ItemReservedEvent = "Item.Reserved"

type consumer struct {
	publishCh       *amqp.Channel
	createListingUC *usecase.CreateListingUC
}

func NewConsumer(ch *amqp.Channel, createListingUC *usecase.CreateListingUC) *consumer {
	return &consumer{publishCh: ch, createListingUC: createListingUC}
}

func (c *consumer) Listen(ctx context.Context) {
	// go c.listingCreatedEventListener()
	c.itemReservedEventEventListener(ctx)

	fmt.Println("Marketplace consumer started - listening for listing.created events.")
}

func (c *consumer) listingCreatedEventListener() {
	queueName := fmt.Sprintf("marketplace.%s", ListingCreatedEvent)

	// declare this service's unique queue that listens for ListingCreatedEvent
	queue, err := c.publishCh.QueueDeclare(queueName, true, false, false, false, nil)
	if err != nil {
		log.Fatal(err)
	}

	// bind to the exchange that will publish ListingCreatedEvent events
	err = c.publishCh.QueueBind(
		queue.Name,
		"",
		ListingCreatedEvent,
		false,
		nil,
	)
	if err != nil {
		log.Fatal(err)
	}

	// consume messages, delivers messages from the queue
	msgs, err := c.publishCh.Consume(queue.Name, "", true, false, false, false, nil)
	if err != nil {
		log.Fatal(err)
	}

	// start a goroutine to listen for events
	go func() {
		for msg := range msgs {
			var event map[string]any

			err := json.Unmarshal(msg.Body, &event)
			if err != nil {
				fmt.Printf("Error when unmarshalling listing.created event body: %s\n", err.Error())
			}

			fmt.Printf("\nsuccessfully received event message: %+v\n\n", event)
		}
	}()
}

func (c *consumer) itemReservedEventEventListener(ctx context.Context) error {
	queueName := fmt.Sprintf("items.%s", ItemReservedEvent)

	// dlq config
	config := amqp.Table{
		"x-dead-letter-exchange":    commonconstants.MarketplaceDlxEventsExchange,
		"x-dead-letter-routing-key": commonconstants.MarpetplaceItemReservedDlq,
	}
	// declare this service's unique queue that listens for ListingCreatedEvent
	queue, err := c.publishCh.QueueDeclare(queueName, true, false, false, false, config)
	if err != nil {
		return fmt.Errorf("declare queue: %w", err)
	}

	// bind to the exchange that will publish ListingCreatedEvent events
	err = c.publishCh.QueueBind(
		queue.Name,
		commonconstants.ItemReserved,
		commonconstants.ItemEventsExchange,
		false,
		nil,
	)
	if err != nil {
		return fmt.Errorf("bind queue: %w", err)
	}
	// consume messages, delivers messages from the queue
	msgs, err := c.publishCh.Consume(queue.Name, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("consume: %w", err)
	}
	go c.itemReservedConsumerLoop(ctx, msgs)

	return nil
}

func (c *consumer) itemReservedConsumerLoop(ctx context.Context, msgs <-chan amqp.Delivery) {
	defer func() {
		// ensure we recover from any panics in the writer goroutine
		if r := recover(); r != nil {
			slog.Info("consumer panic recovered",
				"panic", r,
			)
		}
	}()
	// start a goroutine to listen for events
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-msgs:
			if !ok {
				slog.Warn("amqp delivery channel closed", "msg", msg)
				return
			}
			var event pb.ItemReservedEvent

			err := proto.Unmarshal(msg.Body, &event)
			if err != nil {
				fmt.Printf("Error when unmarshalling item.reserved event body: %s\n", err.Error())
				msg.Nack(false, false)
				continue
			}
			if event.EndsAt == nil {
				slog.Error("missing ends_at", "event_id", event.EventId)
				msg.Nack(false, false)
				continue
			}

			// format data
			sellerID, err := uuid.Parse(event.SellerId)
			if err != nil {
				slog.Warn("amqp invalid sellerid")
				msg.Nack(false, false)
				continue
			}
			itemInstanceID, err := uuid.Parse(event.Id)
			if err != nil {
				slog.Warn("amqp invalid itemInstanceID")
				msg.Nack(false, false)
				continue
			}
			cmd := &usecase.CreateListingCommand{
				SellerID:   sellerID,
				ItemID:     itemInstanceID,
				StartPrice: int(event.StartPrice),
				Now:        time.Now(),
				EndsAt:     event.EndsAt.AsTime(),
			}
			err = c.createListingUC.Handle(ctx, cmd)

			if err != nil {
				if errors.Is(err, commonconstants.ErrDuplicateResource) {
					msg.Ack(false)
					continue
				}
				slog.Error("amqp create listing failed", "error", err)
				msg.Nack(false, true) // retry
				continue
			}
			slog.Info("received item reserved",
				"event_id", event.EventId,
				"item_id", event.Id)

			msg.Ack(false)
		}
	}
}
