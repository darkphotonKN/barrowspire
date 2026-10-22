package broker

import (
	"context"

	amqp "github.com/rabbitmq/amqp091-go"
)

/**
* Adapter for rabbitmq version of our publisher.
**/
type AmqpPublisher struct {
	ch *amqp.Channel
}

func NewAmqpPublisher(ch *amqp.Channel) *AmqpPublisher {
	return &AmqpPublisher{ch: ch}
}

func (p *AmqpPublisher) PublishWithContext(_ context.Context, exchange, key string, msg Message) error {
	return p.ch.Publish(exchange, key, false, false, toPublishing(msg))
}

// toPublishing maps our broker-agnostic Message onto the AMQP wire struct.
func toPublishing(msg Message) amqp.Publishing {
	return amqp.Publishing{
		ContentType:   msg.ContentType,
		Body:          msg.Body,
		DeliveryMode:  msg.DeliveryMode,
		CorrelationId: msg.CorrelationId,
		Headers:       msg.Headers,
		MessageId:     msg.MessageId,
	}
}
