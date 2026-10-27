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

// Temporal Cloud refuses a connection without TLS and credentials; a local
// server has no TLS listener at all. So both switch on together, on the key.
func TestClientOptions_APIKeyTurnsOnTLSAndCredentials(t *testing.T) {
	tests := []struct {
		name     string
		apiKey   string
		wantAuth bool
	}{
		{"no key: plain connection", "", false},
		{"key: TLS and API key credentials", "test-key", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := Config{HostPort: "temporal:7233", Namespace: DefaultNamespace, APIKey: tt.apiKey}

			opts := clientOptions(cfg, nil)

			assert.Equal(t, cfg.HostPort, opts.HostPort)
			assert.Equal(t, cfg.Namespace, opts.Namespace)
			assert.NotEmpty(t, opts.ConnectionOptions.DialOptions, "the service-config dial option stays in both modes")
			if tt.wantAuth {
				assert.NotNil(t, opts.ConnectionOptions.TLS)
				assert.NotNil(t, opts.Credentials)
			} else {
				assert.Nil(t, opts.ConnectionOptions.TLS)
				assert.Nil(t, opts.Credentials)
			}
		})
	}
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
