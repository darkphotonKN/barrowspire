// Package testutil holds test-only scaffolding for game-service.
package testutil

import (
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// NewRedis starts an in-process miniredis server and returns a client connected
// to it, typed as the redis.UniversalClient that features receive by injection,
// plus the server handle (for FastForward, direct inspection, etc.).
// Both are closed when the test ends.
func NewRedis(t testing.TB) (redis.UniversalClient, *miniredis.Miniredis) {
	t.Helper()

	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = client.Close() })

	return client, mr
}
