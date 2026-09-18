package temporal

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// deadAddr returns a host:port nothing is listening on, by taking a real one
// and immediately giving it back.
func deadAddr(t *testing.T) string {
	t.Helper()

	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	addr := l.Addr().String()
	require.NoError(t, l.Close())

	return addr
}

// The retry is bounded on purpose. An unbounded one turns a wrong TEMPORAL_HOST_PORT
// into a service that never starts and never says why.
func TestDial_Unreachable_StopsAtMaxAttempts(t *testing.T) {
	cfg := Config{
		HostPort:        deadAddr(t),
		Namespace:       DefaultNamespace,
		TaskQueue:       QueueWallet,
		DialMaxAttempts: 2,
		DialBackoffMin:  time.Millisecond,
		DialBackoffMax:  2 * time.Millisecond,
	}

	start := time.Now()
	c, err := Dial(context.Background(), cfg, nil)

	require.Error(t, err)
	assert.Nil(t, c)
	assert.Contains(t, err.Error(), "2 attempts")
	assert.Contains(t, err.Error(), cfg.HostPort, "the error names the address that failed")
	assert.Less(t, time.Since(start), 30*time.Second, "bounded retry must not run to the default attempt count")
}

// Shutdown during startup is normal — a compose `down` while a worker is still
// waiting for the frontend. It must unwind, not sit out the remaining backoff.
func TestDial_ContextCancelled_ReturnsPromptly(t *testing.T) {
	cfg := Config{
		HostPort:        deadAddr(t),
		Namespace:       DefaultNamespace,
		TaskQueue:       QueueLedger,
		DialMaxAttempts: 100,
		DialBackoffMin:  time.Hour,
		DialBackoffMax:  time.Hour,
	}

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	start := time.Now()
	_, err := Dial(ctx, cfg, nil)

	require.Error(t, err)
	assert.ErrorIs(t, err, context.Canceled)
	assert.Less(t, time.Since(start), 10*time.Second, "cancellation must interrupt the backoff sleep")
}
