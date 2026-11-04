package mailbox

import (
	"context"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

/**
* Mail arrivals (FS-1GZGD A4, R41, R50, R62; ADR-0045 §Decision 1): after letters commit, one
* message per stored letter on the Redis pub/sub channel `mail:arrived`, which every game-service
* pod relays to its players in the town. A hint only, at most once: the summary is the truth, and
* a lost message is recovered at the reader's next town entry (R44).
**/

// arrivalChannel and the two payload forms below are the contract with game-service's
// subscriber (ADR-0045); it drops anything else.
const arrivalChannel = "mail:arrived"

// arrivalTimeout bounds one whole batch of publishes, however many letters it holds (A6).
const arrivalTimeout = 2 * time.Second

// arrivalPipeliner is what the publisher needs from Redis: *redis.Client in production, built
// with ContextTimeoutEnabled so the batch's deadline binds its reads and writes too (go-redis
// otherwise waits out its own ReadTimeout on a hung Redis).
type arrivalPipeliner interface {
	Pipelined(ctx context.Context, fn func(redis.Pipeliner) error) ([]redis.Cmder, error)
}

// RedisArrivalPublisher announces stored letters on `mail:arrived`.
type RedisArrivalPublisher struct {
	redis   arrivalPipeliner
	timeout time.Duration
	log     *slog.Logger
}

func NewRedisArrivalPublisher(client arrivalPipeliner) *RedisArrivalPublisher {
	return &RedisArrivalPublisher{redis: client, timeout: arrivalTimeout, log: slog.Default()}
}

// PublishArrivals announces letters that were just stored. Call it after their transaction
// commits, never inside it, and only with letters that commit actually stored: a redelivered
// request that stored nothing announces nothing.
//
// One pipelined batch under one deadline, detached from the caller's cancellation so a request
// that has gone away still sends its hint. It never fails its caller: a failure, partial or
// whole, is logged once at warn.
func (p *RedisArrivalPublisher) PublishArrivals(ctx context.Context, letters []Letter) {
	if len(letters) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), p.timeout)
	defer cancel()

	cmds, err := p.redis.Pipelined(ctx, func(pipe redis.Pipeliner) error {
		for _, l := range letters {
			pipe.Publish(ctx, arrivalChannel, arrivalPayload(l))
		}
		return nil
	})
	if err == nil {
		return
	}

	published := 0
	for _, cmd := range cmds {
		if cmd.Err() == nil {
			published++
		}
	}
	attrs := []any{"letters", len(letters), "published", published, "error", err}
	if len(letters) == 1 {
		attrs = append(attrs, "letter_id", letters[0].ID.String())
	}
	p.log.Warn("mailbox: mail arrival not published; readers see the letter at their next town entry", attrs...)
}

// arrivalPayload is `{"member_id":"<uuid>"}` for a one-member letter and `{"broadcast":true}`
// for a broadcast, byte for byte.
func arrivalPayload(l Letter) string {
	if l.MemberID == nil {
		return `{"broadcast":true}`
	}
	return `{"member_id":"` + l.MemberID.String() + `"}`
}
