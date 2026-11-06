package worker_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/worker"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeSweep counts passes and fails each one with err.
type fakeSweep struct {
	passes atomic.Int32
	err    error
}

func (f *fakeSweep) Handle(ctx context.Context, cmd *usecase.ExpireHoldsCommand) (int, error) {
	f.passes.Add(1)
	return 0, f.err
}

// A pass that fails — the candidate read could not reach the database — is
// logged and the worker keeps ticking; the next pass is the retry.
func TestHoldSweeper_FailedPass_KeepsTicking(t *testing.T) {
	sweep := &fakeSweep{err: errors.New("database unavailable")}
	wg := &sync.WaitGroup{}
	wg.Add(1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go worker.NewHoldSweeper(time.Millisecond, sweep, wg).Run(ctx)

	assert.Eventually(t, func() bool { return sweep.passes.Load() >= 2 }, time.Second, time.Millisecond)
}

// On shutdown the worker returns with the other workers and gives back its
// wait-group slot, so main's wait for the workers can finish.
func TestHoldSweeper_ContextCancelled_ReturnsAndReleasesItsSlot(t *testing.T) {
	wg := &sync.WaitGroup{}
	wg.Add(1)
	ctx, cancel := context.WithCancel(context.Background())

	go worker.NewHoldSweeper(time.Hour, &fakeSweep{}, wg).Run(ctx)
	cancel()

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		require.Fail(t, "the worker did not stop on cancel")
	}
}

// The sweep is a backstop, not a hot path: one pass every five minutes.
func TestHoldSweepInterval_IsFiveMinutes(t *testing.T) {
	assert.Equal(t, 5*time.Minute, worker.HoldSweepInterval)
}
