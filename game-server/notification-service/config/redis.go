package config

import (
	"context"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

// redisPingTimeout bounds the boot's one look at Redis.
const redisPingTimeout = 2 * time.Second

// NewRedisClient builds the standalone client mail arrivals are published
// through (FS-1GZGD R41, ADR-0045), as game-service runs Redis. It dials
// lazily, so notification boots with Redis down: the ping only logs, and
// every publish until Redis is back fails and is logged.
//
// ContextTimeoutEnabled lets a publish's deadline bind the reads and writes,
// so a hung Redis costs one batch deadline and not the client's timeouts.
func NewRedisClient(addr string) *redis.Client {
	client := redis.NewClient(&redis.Options{
		Addr:                  addr,
		ContextTimeoutEnabled: true,
		DialTimeout:           2 * time.Second,
		ReadTimeout:           2 * time.Second,
		WriteTimeout:          2 * time.Second,
	})

	ctx, cancel := context.WithTimeout(context.Background(), redisPingTimeout)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		slog.Warn("Redis unreachable at boot; mail arrivals are not published until it is back", "addr", addr, "error", err)
	} else {
		slog.Info("Connected to Redis", "addr", addr)
	}
	return client
}
