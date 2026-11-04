package config

import (
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
)

// The arrival publisher bounds a batch by its context's deadline (FS-1GZGD
// A6); go-redis honours that only with ContextTimeoutEnabled.
func TestNewRedisClient_HonoursContextDeadlines(t *testing.T) {
	client := NewRedisClient(miniredis.RunT(t).Addr())
	defer client.Close()

	assert.True(t, client.Options().ContextTimeoutEnabled)
}

// ADR-0045: Redis down only silences the hint, so it never stops the boot.
func TestNewRedisClient_RedisDownStillAnswersAClient(t *testing.T) {
	mr := miniredis.RunT(t)
	addr := mr.Addr()
	mr.Close()

	start := time.Now()
	client := NewRedisClient(addr)
	defer client.Close()

	assert.NotNil(t, client)
	assert.Less(t, time.Since(start), 3*time.Second)
}
