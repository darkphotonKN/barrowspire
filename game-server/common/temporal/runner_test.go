package temporal

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
)

// A lazy client is enough to exercise construction: NewRunner must not need a
// live frontend to tell the caller their wiring is wrong.
func lazyClient(t *testing.T) client.Client {
	t.Helper()

	c, err := client.NewLazyClient(client.Options{
		HostPort:  DefaultHostPort,
		Namespace: DefaultNamespace,
	})
	require.NoError(t, err)

	return c
}

// Both failures produce a worker that starts, polls nothing, and reports
// healthy — so they have to be refused at construction, where the stack trace
// still points at the caller.
func TestNewRunner_RejectsUnusableWiring(t *testing.T) {
	tests := []struct {
		name    string
		client  func(t *testing.T) client.Client
		queue   TaskQueue
		wantErr string
	}{
		{
			name:    "nil client",
			client:  func(*testing.T) client.Client { return nil },
			queue:   QueueMarketplace,
			wantErr: "client is required",
		},
		{
			name:    "empty task queue",
			client:  lazyClient,
			queue:   "",
			wantErr: "task queue is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, err := NewRunner(tt.client(t), Config{TaskQueue: tt.queue}, nil, worker.Options{})

			require.Error(t, err)
			assert.Nil(t, r)
			assert.Contains(t, err.Error(), tt.wantErr)
		})
	}
}

// Registration is what makes one service's worker different from another's.
// Every registrar must be applied, and a nil one must be skipped rather than
// panic — services pass a slice that grows slice by slice as the saga lands.
func TestNewRunner_AppliesEveryRegistrar(t *testing.T) {
	var applied []string

	register := func(name string) Register {
		return func(worker.Worker) { applied = append(applied, name) }
	}

	r, err := NewRunner(
		lazyClient(t),
		Config{TaskQueue: QueueItems},
		nil,
		worker.Options{},
		register("first"),
		nil,
		register("second"),
	)

	require.NoError(t, err)
	require.NotNil(t, r)
	assert.Equal(t, []string{"first", "second"}, applied)
}
