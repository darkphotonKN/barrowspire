// Package chatbus is the Redis side of chat: the pub/sub the cross-pod channels ride
// (FS-5SH4G). It wraps the one go-redis client the pod already holds, as handoff does, and
// knows nothing about lines: bytes in, bytes out.
package chatbus

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// WorldChannel is the Redis channel every pod publishes world lines to and subscribes to.
const WorldChannel = "chat:world"

type Redis struct {
	client redis.UniversalClient
}

func NewRedis(client redis.UniversalClient) *Redis {
	return &Redis{client: client}
}

// subscribeTimeout bounds the wait for Redis to confirm a subscription.
const subscribeTimeout = 5 * time.Second

// Listen subscribes to channel and hands every message's payload to onMessage, in order, on the
// calling goroutine. It returns once ctx ends, or with an error when the subscription drops, so
// the caller decides whether to subscribe again. onMessage is not called before the subscription
// is confirmed, so a publish after Listen has started is never missed.
func (r *Redis) Listen(ctx context.Context, channel string, onMessage func(payload []byte)) error {
	sub := r.client.Subscribe(ctx, channel)
	defer sub.Close()

	confirm, cancel := context.WithTimeout(ctx, subscribeTimeout)
	_, err := sub.Receive(confirm)
	cancel()
	if err != nil {
		return fmt.Errorf("chat bus subscribe %s: %w", channel, err)
	}

	messages := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-messages:
			if !ok {
				return fmt.Errorf("chat bus subscription to %s closed", channel)
			}
			onMessage([]byte(msg.Payload))
		}
	}
}
