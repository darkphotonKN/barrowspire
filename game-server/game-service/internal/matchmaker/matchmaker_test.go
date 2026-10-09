package matchmaker_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
)

// fakeMatchQueue records heartbeats; the queue operations are inert so the
// match loop Start also launches stays idle.
type fakeMatchQueue struct {
	mu        sync.Mutex
	beats     []string
	beatErr   error
	beatCalls int
}

func (f *fakeMatchQueue) QueuePlayer(context.Context, string, string) error { return nil }
func (f *fakeMatchQueue) DequeuePlayer(context.Context, string) error       { return nil }
func (f *fakeMatchQueue) Matchmake(context.Context, matchmaker.MatchCriteria) ([]matchmaker.MatchedPlayer, error) {
	return nil, nil
}

func (f *fakeMatchQueue) MarkPodAlive(ctx context.Context, podID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.beatCalls++
	if f.beatErr != nil {
		return f.beatErr
	}
	if _, ok := ctx.Deadline(); !ok {
		return errors.New("heartbeat called without a per-call timeout")
	}
	f.beats = append(f.beats, podID)
	return nil
}

func (f *fakeMatchQueue) calls() (int, []string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.beatCalls, append([]string(nil), f.beats...)
}

func TestStart_Heartbeat_MarksThisPodAliveRepeatedly(t *testing.T) {
	fake := &fakeMatchQueue{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	matchmaker.NewMatchmaker(2, "pod-a", fake).Start(ctx)

	require.Eventually(t, func() bool {
		_, beats := fake.calls()
		return len(beats) >= 2
	}, 3*time.Second, 20*time.Millisecond, "expected at least two heartbeats")

	_, beats := fake.calls()
	for _, podID := range beats {
		assert.Equal(t, "pod-a", podID)
	}
}

func TestStart_Heartbeat_BeatsImmediatelyOnStart(t *testing.T) {
	fake := &fakeMatchQueue{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	matchmaker.NewMatchmaker(2, "pod-a", fake).Start(ctx)

	// well under the 1s tick: the pod must count as alive from boot
	require.Eventually(t, func() bool {
		n, _ := fake.calls()
		return n >= 1
	}, 500*time.Millisecond, 10*time.Millisecond)
}

func TestStart_Heartbeat_KeepsBeatingAfterFailures(t *testing.T) {
	fake := &fakeMatchQueue{beatErr: errors.New("redis down")}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	matchmaker.NewMatchmaker(2, "pod-a", fake).Start(ctx)

	require.Eventually(t, func() bool {
		n, _ := fake.calls()
		return n >= 2
	}, 3*time.Second, 20*time.Millisecond, "a failed beat must not stop the loop")
}

func TestStart_Heartbeat_StopsWhenContextIsCancelled(t *testing.T) {
	fake := &fakeMatchQueue{}
	ctx, cancel := context.WithCancel(context.Background())

	matchmaker.NewMatchmaker(2, "pod-a", fake).Start(ctx)
	require.Eventually(t, func() bool {
		n, _ := fake.calls()
		return n >= 1
	}, 3*time.Second, 10*time.Millisecond)

	cancel()
	// let any beat already in flight land, then nothing more may arrive
	time.Sleep(50 * time.Millisecond)
	stopped, _ := fake.calls()
	time.Sleep(1500 * time.Millisecond)
	after, _ := fake.calls()

	assert.Equal(t, stopped, after, "heartbeat kept running after ctx was cancelled")
}
