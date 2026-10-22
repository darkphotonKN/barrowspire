package stats

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// confirmTimeout bounds how long a republished copy waits for the broker's
// publisher confirm before the consumer gives up on it and falls back.
const confirmTimeout = 5 * time.Second

// returnBuffer is how many unroutable returns can be held before the broker
// connection's reader blocks handing one over. Returns are drained on every
// republish, so only copies whose confirm timed out can linger.
const returnBuffer = 64

var (
	// errNacked is the broker refusing a copy (basic.nack).
	errNacked = errors.New("broker nacked the copy")
	// errUnroutable is a mandatory copy no queue took (basic.return), e.g. a
	// delay queue or the DLQ that was never declared.
	errUnroutable = errors.New("broker returned the copy as unroutable")
)

// confirmation is a pending publisher confirm.
type confirmation interface {
	WaitContext(ctx context.Context) (bool, error)
}

// confirmChannel is what the confirm publisher needs from a broker channel
// already in confirm mode.
type confirmChannel interface {
	PublishWithDeferredConfirm(ctx context.Context, exchange, key string, mandatory bool, msg amqp.Publishing) (confirmation, error)
}

// amqpConfirmChannel adapts an *amqp.Channel to confirmChannel.
type amqpConfirmChannel struct {
	ch *amqp.Channel
}

func (a amqpConfirmChannel) PublishWithDeferredConfirm(ctx context.Context, exchange, key string, mandatory bool, msg amqp.Publishing) (confirmation, error) {
	conf, err := a.ch.PublishWithDeferredConfirmWithContext(ctx, exchange, key, mandatory, false, msg)
	if err != nil {
		return nil, err
	}
	if conf == nil {
		return nil, errors.New("channel is not in confirm mode")
	}
	return conf, nil
}

// ConfirmPublisher republishes a consumed message's copy straight to a queue
// and reports success only once the broker has confirmed it routed the copy
// there, so the consumer never acks an original whose copy was lost. It owns a
// dedicated channel in confirm mode, apart from the channel the consumer reads
// from and the one the service's outbox publishes on.
type ConfirmPublisher struct {
	mu      sync.Mutex // one copy in flight, so a return belongs to it
	ch      confirmChannel
	returns <-chan amqp.Return
	timeout time.Duration
}

// NewConfirmPublisher puts ch in confirm mode and listens for unroutable
// returns on it. ch must be used for nothing else.
func NewConfirmPublisher(ch *amqp.Channel) (*ConfirmPublisher, error) {
	if err := ch.Confirm(false); err != nil {
		return nil, fmt.Errorf("put republish channel in confirm mode: %w", err)
	}
	returns := ch.NotifyReturn(make(chan amqp.Return, returnBuffer))
	return &ConfirmPublisher{ch: amqpConfirmChannel{ch: ch}, returns: returns, timeout: confirmTimeout}, nil
}

// Republish publishes msg, mandatory, to queue through the default exchange
// and waits up to the confirm timeout for the broker's confirm. It returns nil
// only on a positive confirm with no return: a publish error, a nack, a
// timeout or an unroutable return is an error.
//
// The broker sends basic.return before the basic.ack of the same message, and
// the client hands frames over in order, so by the time the confirm resolves
// any return for this copy is already buffered.
func (p *ConfirmPublisher) Republish(ctx context.Context, queue string, msg amqp.Publishing) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.returnedCopy(queue, msg.MessageId) // drop returns left by copies that timed out

	ctx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()

	conf, err := p.ch.PublishWithDeferredConfirm(ctx, "", queue, true, msg)
	if err != nil {
		return fmt.Errorf("publish copy to %s: %w", queue, err)
	}
	acked, err := conf.WaitContext(ctx)
	if err != nil {
		return fmt.Errorf("await confirm of copy to %s: %w", queue, err)
	}
	if !acked {
		return fmt.Errorf("publish copy to %s: %w", queue, errNacked)
	}
	if p.returnedCopy(queue, msg.MessageId) {
		return fmt.Errorf("publish copy to %s: %w", queue, errUnroutable)
	}
	return nil
}

// returnedCopy drains the buffered returns and reports whether one is this
// copy's. Any other is a late return of an earlier copy whose confirm timed
// out, already settled by its fallback.
func (p *ConfirmPublisher) returnedCopy(queue, messageID string) bool {
	found := false
	for {
		select {
		case ret := <-p.returns:
			if ret.RoutingKey == queue && ret.MessageId == messageID {
				found = true
				continue
			}
			slog.Warn("discarding a late return of an earlier copy",
				"queue", ret.RoutingKey, "message_id", ret.MessageId, "reply_code", ret.ReplyCode, "reply_text", ret.ReplyText)
		default:
			return found
		}
	}
}
