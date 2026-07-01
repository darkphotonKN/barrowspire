package account

import (
	"encoding/json"
	"fmt"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

// AccountCreatedEvent is the exchange / routing key this service will publish and
// consume once the account domain is built out. Kept local for now (no shared
// constant yet) — it follows the broker naming convention documented in
// common/constants ({resource}.{action}).
const AccountCreatedEvent = "account.created"

type consumer struct {
	publishCh *amqp.Channel
}

func NewConsumer(ch *amqp.Channel) *consumer {
	return &consumer{publishCh: ch}
}

func (c *consumer) Listen() {
	go c.accountCreatedEventListener()

	fmt.Println("Wallet consumer started - listening for account.created events.")
}

func (c *consumer) accountCreatedEventListener() {
	queueName := fmt.Sprintf("wallet.%s", AccountCreatedEvent)

	// declare this service's unique queue that listens for AccountCreatedEvent
	queue, err := c.publishCh.QueueDeclare(queueName, true, false, false, false, nil)
	if err != nil {
		log.Fatal(err)
	}

	// bind to the exchange that will publish AccountCreatedEvent events
	err = c.publishCh.QueueBind(
		queue.Name,
		"",
		AccountCreatedEvent,
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
				fmt.Printf("Error when unmarshalling account.created event body: %s\n", err.Error())
			}

			fmt.Printf("\nsuccessfully received event message: %+v\n\n", event)
		}
	}()
}
