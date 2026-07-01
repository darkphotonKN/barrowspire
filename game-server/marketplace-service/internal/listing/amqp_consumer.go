package listing

import (
	"encoding/json"
	"fmt"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

// ListingCreatedEvent is the exchange / routing key this service will publish and
// consume once the listing domain is built out. Kept local for now (no shared
// constant yet) — it follows the broker naming convention documented in
// common/constants ({resource}.{action}).
const ListingCreatedEvent = "listing.created"

type consumer struct {
	publishCh *amqp.Channel
}

func NewConsumer(ch *amqp.Channel) *consumer {
	return &consumer{publishCh: ch}
}

func (c *consumer) Listen() {
	go c.listingCreatedEventListener()

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
