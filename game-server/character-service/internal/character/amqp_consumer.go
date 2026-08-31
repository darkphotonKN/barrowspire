package character

import (
	"encoding/json"
	"fmt"
	"log"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	amqp "github.com/rabbitmq/amqp091-go"
)

type consumer struct {
	service   Service
	publishCh *amqp.Channel
}

func NewConsumer(service Service, ch *amqp.Channel) *consumer {
	return &consumer{service: service, publishCh: ch}
}

func (c *consumer) Listen() {
	go c.charactrCreatedEventListener()

	fmt.Println("Notification consumer started - listening for create character events.")
}

func (c *consumer) charactrCreatedEventListener() {
	queueName := fmt.Sprintf("character.%s", commonconstants.CharacterCreatedEvent)

	// declare our unique queue that listens and waits for ExampleCreatedEvent to be published from example service
	queue, err := c.publishCh.QueueDeclare(queueName, true, false, false, false, nil)

	if err != nil {
		log.Fatal(err)
	}

	// bind to the exchange that will publish CharacterCreatedEvent events
	err = c.publishCh.QueueBind(
		queue.Name,
		"",
		commonconstants.CharacterCreatedEvent,
		false,
		nil,
	)

	if err != nil {
		log.Fatal(err)
	}

	// consume messages, delivers messages from the queue
	msgs, err := c.publishCh.Consume(queue.Name, "", true, false, false, false, nil)

	// start a goroutine to listen for events
	go func() {
		for msg := range msgs {
			var createdCharacter *CreateCharacterEvent

			err := json.Unmarshal(msg.Body, &createdCharacter)
			if err != nil {
				fmt.Printf("Error when unmarshalling exampl event created body: %s\n", err.Error())
			}

			fmt.Printf("\nsuccessfully received event message: %+v\n\n", createdCharacter)
		}
	}()
}
