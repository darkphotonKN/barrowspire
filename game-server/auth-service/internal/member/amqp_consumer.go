package member

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

// accountRecorder is the slice of AccountRecorder this consumer needs.
type accountRecorder interface {
	Record(ctx context.Context, cmd RecordAccountCommand) error
}

// Consumer reacts to wallet's account.created by caching the account id onto
// the member, which is what finally lets the access token carry the claim.
type Consumer struct {
	channel  *amqp.Channel
	recorder accountRecorder
}

func NewConsumer(ch *amqp.Channel, recorder accountRecorder) *Consumer {
	return &Consumer{channel: ch, recorder: recorder}
}

// SetupConsumer declares auth's own queue and binds it to WALLET's exchange.
//
// wallet.events is declared here too, with identical parameters. AMQP declares
// are idempotent when they match, and binding to an exchange that does not yet
// exist fails with a 404 — so without this, booting auth before wallet would be
// a fatal startup error rather than a wait.
func (c *Consumer) SetupConsumer() error {
	if err := c.channel.ExchangeDeclare(
		commonconstants.WalletEventsExchange,
		"topic", true, false, false, false, nil,
	); err != nil {
		slog.Error("Failed to declare wallet events exchange", "error", err)
		return err
	}

	if _, err := c.channel.QueueDeclare(
		commonconstants.AuthAccountCreatedQueue,
		true, false, false, false, nil,
	); err != nil {
		slog.Error("Failed to declare auth account.created queue", "error", err)
		return err
	}

	if err := c.channel.QueueBind(
		commonconstants.AuthAccountCreatedQueue,
		commonconstants.AccountCreatedEvent,
		commonconstants.WalletEventsExchange,
		false, nil,
	); err != nil {
		slog.Error("Failed to bind auth account.created queue", "error", err)
		return err
	}

	slog.Info("Auth account.created consumer ready",
		"exchange", commonconstants.WalletEventsExchange,
		"queue", commonconstants.AuthAccountCreatedQueue,
	)
	return nil
}

func (c *Consumer) Listen() {
	go c.consumeAccountCreated()
	slog.Info("Auth consumer listening for account.created")
}

func (c *Consumer) consumeAccountCreated() {
	msgs, err := c.channel.Consume(
		commonconstants.AuthAccountCreatedQueue,
		"",
		false, // MANUAL ack
		false, false, false, nil,
	)
	if err != nil {
		slog.Error("Failed to register auth account.created consumer", "error", err)
		return
	}

	for msg := range msgs {
		c.handleAccountCreated(msg)
	}
}

func (c *Consumer) handleAccountCreated(msg amqp.Delivery) {
	var payload commonconstants.AccountCreatedEventPayload
	if err := json.Unmarshal(msg.Body, &payload); err != nil {
		slog.Error("Failed to parse AccountCreatedEvent, dropping", "error", err)
		msg.Nack(false, false)
		return
	}

	eventID, idErr := uuid.Parse(payload.EventID)
	memberID, memErr := uuid.Parse(payload.MemberID)
	accountID, accErr := uuid.Parse(payload.AccountID)
	if err := errors.Join(idErr, memErr, accErr); err != nil {
		// Redelivery cannot repair a malformed payload, so drop rather than spin.
		slog.Error("AccountCreatedEvent carries unusable ids, dropping",
			"event_id", payload.EventID, "member_id", payload.MemberID,
			"account_id", payload.AccountID, "error", err)
		msg.Nack(false, false)
		return
	}

	err := c.recorder.Record(context.Background(), RecordAccountCommand{
		EventID: eventID, MemberID: memberID, AccountID: accountID,
	})

	switch decideAck(err) {
	case ackDone:
		msg.Ack(false)
		slog.Info("Recorded wallet account for member",
			"member_id", memberID, "account_id", accountID)

	case ackAlreadyProcessed:
		msg.Ack(false)
		slog.Info("account.created already processed, acking", "member_id", memberID)

	case nackRequeue:
		// Requeued, and for the two deliberate wedges — an unknown member, or an
		// account id another member already holds — it will keep coming back.
		// That is the point: both are consumer bugs, and silence is worse than a
		// stuck queue (FS-0006 §Edge States).
		slog.Error("Failed to record wallet account, requeueing",
			"member_id", memberID, "account_id", accountID, "error", err)
		msg.Nack(false, true)
	}
}

// ackDecision is the acknowledgement policy, separated from the delivery so it
// can be tested without a broker. amqp.Delivery's Ack and Nack are methods on a
// struct with a private acknowledger, so a policy left inline is provable only
// against real RabbitMQ.
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
		return ackAlreadyProcessed
	default:
		return nackRequeue
	}
}
