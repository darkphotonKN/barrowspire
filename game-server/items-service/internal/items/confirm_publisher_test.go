package items

import (
	"context"
	"errors"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// fakeConfirmation resolves as the broker would: acked, nacked, or never.
type fakeConfirmation struct {
	ack   bool
	never bool
}

func (f fakeConfirmation) WaitContext(ctx context.Context) (bool, error) {
	if f.never {
		<-ctx.Done()
		return false, ctx.Err()
	}
	return f.ack, nil
}

// fakeConfirmChannel is a confirm-mode channel. A publish either fails, or is
// confirmed as conf says after optionally returning the copy as unroutable,
// in the order the broker sends them: the return before the ack.
type fakeConfirmChannel struct {
	returns   chan amqp.Return
	err       error
	conf      fakeConfirmation
	returnIt  bool
	exchange  string
	key       string
	mandatory bool
	sent      []amqp.Publishing
}

func (f *fakeConfirmChannel) PublishWithDeferredConfirm(ctx context.Context, exchange, key string, mandatory bool, msg amqp.Publishing) (confirmation, error) {
	if f.err != nil {
		return nil, f.err
	}
	f.exchange, f.key, f.mandatory = exchange, key, mandatory
	f.sent = append(f.sent, msg)
	if f.returnIt {
		f.returns <- amqp.Return{ReplyCode: amqp.NoRoute, RoutingKey: key, MessageId: msg.MessageId}
	}
	return f.conf, nil
}

func newTestConfirmPublisher(ch *fakeConfirmChannel) *ConfirmPublisher {
	ch.returns = make(chan amqp.Return, returnBuffer)
	return &ConfirmPublisher{ch: ch, returns: ch.returns, timeout: 20 * time.Millisecond}
}

// A copy counts as republished only on a positive confirm with no return. A
// publish error, a nack, a confirm that does not come within the timeout, or
// a mandatory copy returned as unroutable (its queue was never declared) is a
// failure the consumer falls back on.
func TestConfirmPublisher_Republish(t *testing.T) {
	closed := errors.New("channel closed")
	tests := []struct {
		name    string
		ch      fakeConfirmChannel
		wantErr error
	}{
		{name: "confirmed", ch: fakeConfirmChannel{conf: fakeConfirmation{ack: true}}},
		{name: "publish error", ch: fakeConfirmChannel{err: closed}, wantErr: closed},
		{name: "nacked", ch: fakeConfirmChannel{conf: fakeConfirmation{ack: false}}, wantErr: errNacked},
		{name: "confirm times out", ch: fakeConfirmChannel{conf: fakeConfirmation{never: true}}, wantErr: context.DeadlineExceeded},
		{name: "returned unroutable then acked", ch: fakeConfirmChannel{conf: fakeConfirmation{ack: true}, returnIt: true}, wantErr: errUnroutable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ch := tt.ch
			p := newTestConfirmPublisher(&ch)
			msg := amqp.Publishing{MessageId: testMessageID, Body: []byte("loot")}

			err := p.Republish(context.Background(), deadLetterQueue, msg)

			if tt.wantErr == nil {
				if err != nil {
					t.Fatalf("republish: %v, want confirmed", err)
				}
			} else if !errors.Is(err, tt.wantErr) {
				t.Fatalf("republish error %v, want %v", err, tt.wantErr)
			}
			if tt.ch.err == nil && (ch.exchange != "" || ch.key != deadLetterQueue || !ch.mandatory) {
				t.Fatalf("published to %q/%q mandatory=%v, want default exchange/%q mandatory", ch.exchange, ch.key, ch.mandatory, deadLetterQueue)
			}
		})
	}
}

// A return left behind by an earlier copy whose confirm timed out is not
// mistaken for this copy's.
func TestConfirmPublisher_IgnoresLateReturnOfEarlierCopy(t *testing.T) {
	ch := &fakeConfirmChannel{conf: fakeConfirmation{ack: true}}
	p := newTestConfirmPublisher(ch)
	ch.returns <- amqp.Return{ReplyCode: amqp.NoRoute, RoutingKey: retryQueueName(0), MessageId: "earlier"}

	if err := p.Republish(context.Background(), retryQueueName(0), amqp.Publishing{MessageId: testMessageID}); err != nil {
		t.Fatalf("republish: %v, want confirmed", err)
	}
	if len(ch.returns) != 0 {
		t.Fatalf("%d returns left buffered, want drained", len(ch.returns))
	}
}
