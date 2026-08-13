package ledger

import (
	"encoding/json"
	"fmt"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

// LedgerCreatedEvent is the exchange / routing key this service will publish and
// consume once the ledger domain is built out. Kept local for now (no shared
// constant yet) — it follows the broker naming convention documented in
// common/constants ({resource}.{action}).
const LedgerCreatedEvent = "ledger.created"

type consumer struct {
	publishCh *amqp.Channel
}

func NewConsumer(ch *amqp.Channel) *consumer {
	return &consumer{publishCh: ch}
}

func (c *consumer) Listen() {
	go c.ledgerCreatedEventListener()

	fmt.Println("Ledger consumer started - listening for ledger.created events.")
}

func (c *consumer) ledgerCreatedEventListener() {
	queueName := fmt.Sprintf("ledger.%s", LedgerCreatedEvent)

	// declare this service's unique queue that listens for LedgerCreatedEvent
	queue, err := c.publishCh.QueueDeclare(queueName, true, false, false, false, nil)
	if err != nil {
		log.Fatal(err)
	}

	// bind to the exchange that will publish LedgerCreatedEvent events
	err = c.publishCh.QueueBind(
		queue.Name,
		"",
		LedgerCreatedEvent,
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
				fmt.Printf("Error when unmarshalling ledger.created event body: %s\n", err.Error())
			}

			fmt.Printf("\nsuccessfully received event message: %+v\n\n", event)
		}
	}()
}
