package character

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/protobuf/proto"
)

// ExperienceGranter is what the consumer needs from the service.
type ExperienceGranter interface {
	GrantExperience(ctx context.Context, grant ExperienceGrant) error
}

// retryPublisher is what the consumer needs to park a failed message in a
// retry queue.
type retryPublisher interface {
	PublishWithContext(ctx context.Context, exchange, key string, mandatory, immediate bool, msg amqp.Publishing) error
}

// topologyDeclarer is what declaring a listener's queues needs from its broker
// channel.
type topologyDeclarer interface {
	ExchangeDeclare(name, kind string, durable, autoDelete, internal, noWait bool, args amqp.Table) error
	QueueDeclare(name string, durable, autoDelete, exclusive, noWait bool, args amqp.Table) (amqp.Queue, error)
	QueueBind(name, key, exchange string, noWait bool, args amqp.Table) error
}

// consumeChannel is what a listener needs from the broker channel it owns.
type consumeChannel interface {
	topologyDeclarer
	Consume(queue, consumer string, autoAck, exclusive, noLocal, noWait bool, args amqp.Table) (<-chan amqp.Delivery, error)
}

// matchEndedChannel is what the match.ended listener needs from its own
// channel: it also bounds its prefetch and forwards retries on it.
type matchEndedChannel interface {
	consumeChannel
	retryPublisher
	Qos(prefetchCount, prefetchSize int, global bool) error
}

// consumer runs each listener on a channel of its own: a broker error closes
// the channel it happens on, so a shared channel would let one listener's
// failure silently kill the other.
type consumer struct {
	granter      ExperienceGranter
	createdCh    consumeChannel
	matchEndedCh matchEndedChannel
	retries      retryPublisher
	logger       *slog.Logger
}

func NewConsumer(granter ExperienceGranter, createdCh consumeChannel, matchEndedCh matchEndedChannel, logger *slog.Logger) *consumer {
	return &consumer{
		granter:      granter,
		createdCh:    createdCh,
		matchEndedCh: matchEndedCh,
		retries:      matchEndedCh,
		logger:       logger,
	}
}

// Listen declares each listener's topology and starts consuming. Any declare
// or consume failure is returned before a message is read, so the service
// fails at startup instead of running on without granting experience.
func (c *consumer) Listen(ctx context.Context) error {
	matchEnded, err := c.startMatchEnded()
	if err != nil {
		return fmt.Errorf("start match ended listener: %w", err)
	}
	created, err := c.startCharacterCreated()
	if err != nil {
		return fmt.Errorf("start character created listener: %w", err)
	}

	go c.consumeMatchEnded(ctx, matchEnded)
	go c.consumeCharacterCreated(created)

	c.logger.Info("character consumer started",
		"events", []string{commonconstants.CharacterCreatedEvent, commonconstants.GameMatchEnded})
	return nil
}

// disposition is what becomes of a delivered message.
type disposition int

const (
	ack    disposition = iota
	retry              // not the message's fault: try again after a delay
	reject             // malformed: dead-letter to the DLQ, never retry
)

func (d disposition) String() string {
	return [...]string{"ack", "retry", "reject"}[d]
}

// matchEndedPrefetch bounds how many unsettled match.ended messages the broker
// hands this consumer at once.
const matchEndedPrefetch = 10

// retryDelays is how long a failed match.ended waits before each retry; a
// message's x-retry-count picks the step, and past the last step it keeps
// waiting at the last one. Retries never run out: a run's experience waits out
// a character-service outage of any length (FS-BDA7X Edge State
// "character-service down").
var retryDelays = []time.Duration{5 * time.Second, 30 * time.Second, 2 * time.Minute}

const retryCountHeader = "x-retry-count"

// retryQueueName is the delay queue for one step. Delay queues dead-letter
// through the default exchange straight back into character's own queue —
// republishing to game.events would redeliver the run to every subscriber.
func retryQueueName(step int) string {
	return fmt.Sprintf("%s.retry-%d", commonconstants.CharacterGameMatchEndedQueue, step+1)
}

// deadLetterQueue parks malformed match.ended messages for inspection.
var deadLetterQueue = commonconstants.CharacterGameMatchEndedQueue + ".dlq"

// declareMatchEndedTopology declares the work queue (dead-lettering rejects to
// the DLQ), its binding to game.events, the DLQ and the delay queues.
func declareMatchEndedTopology(ch topologyDeclarer) error {
	queue := commonconstants.CharacterGameMatchEndedQueue

	if err := ch.ExchangeDeclare(commonconstants.GameEventsExchange, "topic", true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare exchange %s: %w", commonconstants.GameEventsExchange, err)
	}
	if err := declareQueue(ch, deadLetterQueue, nil); err != nil {
		return err
	}
	if err := declareQueue(ch, queue, amqp.Table{
		"x-dead-letter-exchange":    "",
		"x-dead-letter-routing-key": deadLetterQueue,
	}); err != nil {
		return err
	}
	if err := ch.QueueBind(queue, commonconstants.GameMatchEnded, commonconstants.GameEventsExchange, false, nil); err != nil {
		return fmt.Errorf("bind queue %s: %w", queue, err)
	}
	for step, delay := range retryDelays {
		if err := declareQueue(ch, retryQueueName(step), amqp.Table{
			"x-message-ttl":             int32(delay / time.Millisecond),
			"x-dead-letter-exchange":    "",
			"x-dead-letter-routing-key": queue,
		}); err != nil {
			return err
		}
	}
	return nil
}

// declareQueue declares a durable queue. A durable queue's arguments cannot
// change in place: if the broker already holds the queue with other arguments
// (an earlier build declared it without them) the error says how to clear it.
func declareQueue(ch topologyDeclarer, name string, args amqp.Table) error {
	if _, err := ch.QueueDeclare(name, true, false, false, false, args); err != nil {
		var amqpErr *amqp.Error
		if errors.As(err, &amqpErr) && amqpErr.Code == amqp.PreconditionFailed {
			return fmt.Errorf("declare queue %s: it already exists with different arguments; delete queue %s once and restart, it will be recreated: %w", name, name, err)
		}
		return fmt.Errorf("declare queue %s: %w", name, err)
	}
	return nil
}

// startMatchEnded declares the match.ended topology, bounds the prefetch and
// starts consuming, all on the listener's own channel.
func (c *consumer) startMatchEnded() (<-chan amqp.Delivery, error) {
	queue := commonconstants.CharacterGameMatchEndedQueue

	if err := declareMatchEndedTopology(c.matchEndedCh); err != nil {
		return nil, err
	}
	if err := c.matchEndedCh.Qos(matchEndedPrefetch, 0, false); err != nil {
		return nil, fmt.Errorf("set prefetch on %s: %w", queue, err)
	}
	msgs, err := c.matchEndedCh.Consume(queue, "", false, false, false, false, nil)
	if err != nil {
		return nil, fmt.Errorf("consume queue %s: %w", queue, err)
	}
	return msgs, nil
}

// consumeMatchEnded applies each run's experience grants from match.ended,
// on the service's own durable queue. FS-BDA7X §Requirements 25, 28.
func (c *consumer) consumeMatchEnded(ctx context.Context, msgs <-chan amqp.Delivery) {
	for msg := range msgs {
		c.settle(ctx, msg, c.handleMatchEnded(ctx, msg.Body))
	}
	c.logger.Error("match ended listener stopped: its channel closed",
		"queue", commonconstants.CharacterGameMatchEndedQueue)
}

// settle carries out a disposition. A retry is never requeued in place — an
// immediate redelivery of a failing message is a hot loop — but forwarded to
// the delay queue for its step, then acked.
func (c *consumer) settle(ctx context.Context, msg amqp.Delivery, d disposition) {
	var err error
	switch d {
	case ack:
		err = msg.Ack(false)
	case reject:
		err = msg.Nack(false, false)
	case retry:
		err = c.forwardToRetry(ctx, msg)
	}
	if err != nil {
		c.logger.Error("failed to settle match ended message", "disposition", d, "error", err)
	}
}

// forwardToRetry publishes a copy to the delay queue for the message's retry
// count, then acks the original. If the publish fails the broker channel is
// almost certainly gone, so the original is returned to its queue: an outage
// loses nothing.
func (c *consumer) forwardToRetry(ctx context.Context, msg amqp.Delivery) error {
	count := retryCountOf(msg)
	step := min(count, len(retryDelays)-1)
	queue := retryQueueName(step)

	headers := amqp.Table{}
	for k, v := range msg.Headers {
		headers[k] = v
	}
	headers[retryCountHeader] = int32(count + 1)

	if err := c.retries.PublishWithContext(ctx, "", queue, false, false, amqp.Publishing{
		ContentType:  msg.ContentType,
		DeliveryMode: amqp.Persistent,
		Headers:      headers,
		Body:         msg.Body,
	}); err != nil {
		c.logger.Error("failed to forward match ended to retry, returning it to the queue", "queue", queue, "error", err)
		return msg.Nack(false, true)
	}

	log := c.logger.With("queue", queue, "retry", count+1, "delay", retryDelays[step])
	if count >= len(retryDelays) {
		log.Error("match ended still failing, retrying at the longest delay")
	} else {
		log.Warn("match ended failed, retrying after delay")
	}
	return msg.Ack(false)
}

func retryCountOf(msg amqp.Delivery) int {
	switch n := msg.Headers[retryCountHeader].(type) {
	case int32:
		return int(n)
	case int64:
		return int(n)
	}
	return 0
}

// handleMatchEnded applies every grant a run's end carries. The whole message is
// read before anything is applied, so a malformed one applies nothing. A grant
// already applied, or for a character that is not the member's live one, is
// settled as it is; an invalid grant rejects the message; any other failure
// retries it after a delay, and its applied grants are no-ops the second time.
// FS-BDA7X §Requirements 25–28.
func (c *consumer) handleMatchEnded(ctx context.Context, body []byte) disposition {
	grants, err := experienceGrants(body)
	if err != nil {
		c.logger.Error("rejecting malformed match ended event", "error", err)
		return reject
	}

	for _, grant := range grants {
		log := c.logger.With(
			"session_id", grant.SessionID,
			"character_id", grant.CharacterID,
			"member_id", grant.MemberID,
			"amount", grant.Amount,
		)

		err := c.granter.GrantExperience(ctx, grant)
		switch {
		case err == nil:
			log.Info("experience grant applied")
		case errors.Is(err, commonconstants.ErrAlreadyProcessed):
			log.Info("experience grant already applied")
		case errors.Is(err, commonconstants.ErrNotFound):
			log.Warn("experience grant dropped: not the member's live character")
		case errors.Is(err, commonconstants.ErrInvalidInput):
			log.Error("rejecting match ended event: invalid experience grant", "error", err)
			return reject
		default:
			// a transient or unrecognised failure (a refused connection, an
			// administrator shutdown) is the database's, not the message's
			log.Warn("experience grant failed, retrying", "error", err)
			return retry
		}
	}

	return ack
}

// experienceGrants reads the grants a match.ended carries: one per character
// with experience gained. Any unreadable part makes the whole message malformed.
func experienceGrants(body []byte) ([]ExperienceGrant, error) {
	var event pb.MatchEndedEvent
	if err := proto.Unmarshal(body, &event); err != nil {
		return nil, fmt.Errorf("unmarshal match ended: %w", err)
	}
	sessionID, err := uuid.Parse(event.GetSessionId())
	if err != nil {
		return nil, fmt.Errorf("session id %q: %w", event.GetSessionId(), err)
	}

	grants := []ExperienceGrant{}
	for _, player := range event.GetPlayers() {
		if player.GetExperienceGained() <= 0 {
			continue
		}
		memberID, err := uuid.Parse(player.GetMemberId())
		if err != nil {
			return nil, fmt.Errorf("member id %q: %w", player.GetMemberId(), err)
		}
		characterID, err := uuid.Parse(player.GetCharacterId())
		if err != nil {
			return nil, fmt.Errorf("character id %q: %w", player.GetCharacterId(), err)
		}
		grants = append(grants, ExperienceGrant{
			SessionID:   sessionID,
			CharacterID: characterID,
			MemberID:    memberID,
			Amount:      player.GetExperienceGained(),
		})
	}
	return grants, nil
}

// characterCreatedQueue is character's own queue on the character.created
// fanout exchange.
var characterCreatedQueue = fmt.Sprintf("character.%s", commonconstants.CharacterCreatedEvent)

// startCharacterCreated declares character's queue, binds it to the
// character.created exchange and starts consuming, on the listener's own
// channel.
func (c *consumer) startCharacterCreated() (<-chan amqp.Delivery, error) {
	if err := declareQueue(c.createdCh, characterCreatedQueue, nil); err != nil {
		return nil, err
	}
	if err := c.createdCh.QueueBind(characterCreatedQueue, "", commonconstants.CharacterCreatedEvent, false, nil); err != nil {
		return nil, fmt.Errorf("bind queue %s: %w", characterCreatedQueue, err)
	}
	msgs, err := c.createdCh.Consume(characterCreatedQueue, "", true, false, false, false, nil)
	if err != nil {
		return nil, fmt.Errorf("consume queue %s: %w", characterCreatedQueue, err)
	}
	return msgs, nil
}

func (c *consumer) consumeCharacterCreated(msgs <-chan amqp.Delivery) {
	for msg := range msgs {
		var createdCharacter *CreateCharacterEvent

		if err := json.Unmarshal(msg.Body, &createdCharacter); err != nil {
			c.logger.Error("failed to unmarshal character created event", "error", err)
			continue
		}

		c.logger.Info("received character created event", "event", createdCharacter)
	}
}
