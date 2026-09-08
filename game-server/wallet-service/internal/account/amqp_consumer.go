package account

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

// signupHandler is the slice of the use case this consumer needs. Declared here
// because the consumer owns its interface.
type signupHandler interface {
	Handle(ctx context.Context, cmd usecase.CreateAccountOnSignupCommand) error
}

// Consumer reacts to member.signedup by creating the member's gold account.
//
// Wallet learns about new members from the broker rather than being called at
// signup, so it adds no dependency to auth-service's login path — the property
// ADR-0014 exists to protect.
type Consumer struct {
	channel *amqp.Channel
	handler signupHandler
}

func NewConsumer(ch *amqp.Channel, handler signupHandler) *Consumer {
	return &Consumer{channel: ch, handler: handler}
}

// SetupConsumer declares wallet's own queue and binds it to AUTH's exchange.
//
// The exchange belongs to the producer; the queue belongs to the consumer. That
// is why this declares no exchange: auth-service owns auth.events, and a
// consumer that redeclares a producer's exchange will fight it over the type.
func (c *Consumer) SetupConsumer() error {
	if _, err := c.channel.QueueDeclare(
		commonconstants.WalletMemberSignedUpQueue,
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		nil,
	); err != nil {
		slog.Error("Failed to declare wallet signup queue", "error", err)
		return err
	}

	if err := c.channel.QueueBind(
		commonconstants.WalletMemberSignedUpQueue,
		commonconstants.MemberSignedUpEvent,
		commonconstants.AuthEventsExchange,
		false,
		nil,
	); err != nil {
		slog.Error("Failed to bind wallet signup queue",
			"key", commonconstants.MemberSignedUpEvent, "error", err)
		return err
	}

	slog.Info("Wallet consumer infrastructure ready",
		"exchange", commonconstants.AuthEventsExchange,
		"queue", commonconstants.WalletMemberSignedUpQueue,
	)
	return nil
}

func (c *Consumer) Listen() {
	go c.consumeMemberSignedUp()
	slog.Info("Wallet consumer listening for member.signedup")
}

func (c *Consumer) consumeMemberSignedUp() {
	msgs, err := c.channel.Consume(
		commonconstants.WalletMemberSignedUpQueue,
		"",
		false, // MANUAL ack — see handleMemberSignedUp
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		slog.Error("Failed to register wallet consumer", "error", err)
		return
	}

	for msg := range msgs {
		c.handleMemberSignedUp(msg)
	}
}

// handleMemberSignedUp never acks on a handler error.
//
// The consumer this replaced auto-acked, so a failure was discarded silently —
// a member whose account creation failed would never get one, and nothing would
// say so. Requeueing is safe here precisely because the use case is idempotent:
// the inbox records the event inside the same transaction as the account.
func (c *Consumer) handleMemberSignedUp(msg amqp.Delivery) {
	var payload commonconstants.MemberSignedUpEventPayload
	if err := json.Unmarshal(msg.Body, &payload); err != nil {
		// Unparseable: redelivery cannot fix it, so drop rather than spin.
		slog.Error("Failed to parse MemberSignedUpEvent, dropping", "error", err)
		msg.Nack(false, false)
		return
	}

	eventID, err := uuid.Parse(payload.EventID)
	if err != nil {
		slog.Error("MemberSignedUpEvent carries no usable event id, dropping",
			"event_id", payload.EventID, "error", err)
		msg.Nack(false, false)
		return
	}

	memberID, err := uuid.Parse(payload.UserID)
	if err != nil {
		slog.Error("MemberSignedUpEvent carries no usable member id, dropping",
			"user_id", payload.UserID, "error", err)
		msg.Nack(false, false)
		return
	}

	err = c.handler.Handle(context.Background(), usecase.CreateAccountOnSignupCommand{
		EventID:  eventID,
		MemberID: memberID,
	})

	switch decideAck(err) {
	case ackDone:
		msg.Ack(false)
		slog.Info("Created account for new member", "member_id", memberID)

	case ackAlreadyProcessed:
		msg.Ack(false)
		slog.Info("member.signedup already processed, acking", "member_id", memberID)

	case nackRequeue:
		slog.Error("Failed to create account for new member, requeueing",
			"member_id", memberID, "error", err)
		msg.Nack(false, true)
	}
}

// ackDecision is the acknowledgement policy, separated from the delivery so it
// can be tested without a broker. amqp.Delivery's Ack and Nack are methods on a
// struct with a private acknowledger, so a policy left inline is only provable
// against real RabbitMQ — which is how the auto-acking predecessor went so long
// without anyone noticing it discarded failures.
type ackDecision int

const (
	ackDone ackDecision = iota
	ackAlreadyProcessed
	nackRequeue
)

func decideAck(err error) ackDecision {
	switch {
	case err == nil:
		return ackDone
	case errors.Is(err, commonconstants.ErrAlreadyProcessed):
		// Success wearing an error's shape: the work was done on an earlier
		// delivery. Ack so it leaves the queue rather than spinning forever.
		return ackAlreadyProcessed
	default:
		// Requeue. Safe because the use case is transactional: neither the
		// account nor the inbox row survives a failure, so a retry starts clean.
		return nackRequeue
	}
}
