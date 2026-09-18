package temporal

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The task queue is identity, not configuration: every other field may be
// overridden by the environment, but a service's queue is passed in by the
// service itself and there is no env var that can move it.
func TestLoadConfig_QueueIsCallerSupplied(t *testing.T) {
	tests := []struct {
		name  string
		queue TaskQueue
	}{
		{"marketplace", QueueMarketplace},
		{"items", QueueItems},
		{"wallet", QueueWallet},
		{"ledger", QueueLedger},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(EnvHostPort, "")
			t.Setenv(EnvNamespace, "")

			cfg, err := LoadConfig(tt.queue)

			require.NoError(t, err)
			assert.Equal(t, tt.queue, cfg.TaskQueue)
			assert.Equal(t, tt.name, cfg.TaskQueue.String())
		})
	}
}

// Unset means "running from the IDE against the host"; set means "running
// inside the compose network". Both have to work without a code change.
func TestLoadConfig_Connection(t *testing.T) {
	tests := []struct {
		name          string
		hostPort      string
		namespace     string
		wantHostPort  string
		wantNamespace string
	}{
		{
			name:          "unset falls back to the host defaults",
			wantHostPort:  DefaultHostPort,
			wantNamespace: DefaultNamespace,
		},
		{
			name:          "env overrides both",
			hostPort:      "temporal:7233",
			namespace:     "barrowspire-test",
			wantHostPort:  "temporal:7233",
			wantNamespace: "barrowspire-test",
		},
		{
			name:          "empty string is treated as unset, not as a value",
			hostPort:      "",
			namespace:     "",
			wantHostPort:  DefaultHostPort,
			wantNamespace: DefaultNamespace,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(EnvHostPort, tt.hostPort)
			t.Setenv(EnvNamespace, tt.namespace)

			cfg, err := LoadConfig(QueueWallet)

			require.NoError(t, err)
			assert.Equal(t, tt.wantHostPort, cfg.HostPort)
			assert.Equal(t, tt.wantNamespace, cfg.Namespace)
		})
	}
}

// A worker with no queue would start, poll nothing, and look healthy. That is
// the one misconfiguration worth refusing at construction.
func TestLoadConfig_EmptyQueue_Errors(t *testing.T) {
	_, err := LoadConfig("")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "task queue")
}

// Dial retry has to be bounded by something, and an operator who fat-fingers
// the bound should get the default rather than a worker that gives up on the
// first attempt.
func TestLoadConfig_DialBounds(t *testing.T) {
	tests := []struct {
		name         string
		maxAttempts  string
		wantAttempts int
	}{
		{"unset uses the default", "", 30},
		{"valid override is honoured", "5", 5},
		{"garbage falls back to the default", "not-a-number", 30},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("TEMPORAL_DIAL_MAX_ATTEMPTS", tt.maxAttempts)

			cfg, err := LoadConfig(QueueLedger)

			require.NoError(t, err)
			assert.Equal(t, tt.wantAttempts, cfg.DialMaxAttempts)
			assert.Positive(t, cfg.DialBackoffMin)
			assert.GreaterOrEqual(t, cfg.DialBackoffMax, cfg.DialBackoffMin)
		})
	}
}
