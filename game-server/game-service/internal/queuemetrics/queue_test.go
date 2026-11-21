package queuemetrics

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const pod = "pod-a"

// fakeQueue is the global queue as a list, with this pod's players read back
// in order. Only the methods the decorator wraps are implemented.
type fakeQueue struct {
	matchmaker.MatchQueue
	order   []string
	podOf   map[string]string
	readErr error
	// runs inside QueuedPlayers after the list is read, to stage races
	duringRead func()
}

func newFake() *fakeQueue { return &fakeQueue{podOf: map[string]string{}} }

func (f *fakeQueue) QueuePlayer(_ context.Context, id, pod string, _ types.CharacterInPlay) error {
	f.order = append(f.order, id)
	f.podOf[id] = pod
	return nil
}

func (f *fakeQueue) DequeuePlayer(_ context.Context, id string) error {
	f.remove(id)
	return nil
}

func (f *fakeQueue) QueuedPlayers(_ context.Context, podID string) (int, []string, error) {
	if f.readErr != nil {
		return 0, nil, f.readErr
	}
	var mine []string
	for _, id := range f.order {
		if f.podOf[id] == podID {
			mine = append(mine, id)
		}
	}
	length := len(f.order)
	if f.duringRead != nil {
		f.duringRead()
	}
	return length, mine, nil
}

// match pops the first n players, as Matchmake does on whichever pod wins.
func (f *fakeQueue) match(n int) {
	for _, id := range f.order[:n] {
		delete(f.podOf, id)
	}
	f.order = f.order[n:]
}

func (f *fakeQueue) remove(id string) {
	for i, o := range f.order {
		if o == id {
			f.order = append(f.order[:i], f.order[i+1:]...)
			break
		}
	}
	delete(f.podOf, id)
}

type clock struct{ t time.Time }

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }

type harness struct {
	fake  *fakeQueue
	q     *Queue
	clock *clock
	depth prometheus.Gauge
	wait  *recorder
}

// recorder keeps every observed wait.
type recorder struct{ seconds []float64 }

func (r *recorder) Observe(v float64) { r.seconds = append(r.seconds, v) }

func newHarness() *harness {
	h := &harness{
		fake:  newFake(),
		clock: &clock{t: time.Unix(1_000, 0)},
		depth: prometheus.NewGauge(prometheus.GaugeOpts{Name: "depth"}),
		wait:  &recorder{},
	}
	h.q = Wrap(h.fake, pod, h.depth, h.wait)
	h.q.now = h.clock.now
	return h
}

func (h *harness) read(t *testing.T) {
	t.Helper()
	_, _, err := h.q.QueuedPlayers(context.Background(), pod)
	require.NoError(t, err)
}

func TestDepthIsTheGlobalQueueLength(t *testing.T) {
	h := newHarness()
	ctx := context.Background()
	require.NoError(t, h.q.QueuePlayer(ctx, "a", pod, types.CharacterInPlay{}))
	require.NoError(t, h.q.QueuePlayer(ctx, "b", "pod-b", types.CharacterInPlay{}))

	h.read(t)

	assert.Equal(t, 2.0, testutil.ToFloat64(h.depth), "depth counts every pod's players")
}

func TestMatchedPlayerWaitIsObservedOnce(t *testing.T) {
	h := newHarness()
	ctx := context.Background()
	require.NoError(t, h.q.QueuePlayer(ctx, "a", pod, types.CharacterInPlay{}))
	h.clock.advance(time.Second)
	h.read(t) // still queued: nothing observed

	h.clock.advance(6 * time.Second)
	h.fake.match(1)
	h.read(t)
	h.read(t)

	assert.Equal(t, []float64{7}, h.wait.seconds)
}

func TestLeavingTheQueueIsNotAWait(t *testing.T) {
	h := newHarness()
	ctx := context.Background()
	require.NoError(t, h.q.QueuePlayer(ctx, "a", pod, types.CharacterInPlay{}))
	h.clock.advance(time.Second)
	require.NoError(t, h.q.DequeuePlayer(ctx, "a"))
	h.read(t)

	assert.Empty(t, h.wait.seconds)
}

func TestOtherPodsPlayersAreTheirs(t *testing.T) {
	h := newHarness()
	ctx := context.Background()
	// the match loop requeues another pod's player from here after a corrupt pop
	require.NoError(t, h.q.QueuePlayer(ctx, "b", "pod-b", types.CharacterInPlay{}))
	h.clock.advance(time.Second)
	h.fake.match(1)
	h.read(t)

	assert.Empty(t, h.wait.seconds)
}

func TestJoinDuringAReadIsNotAMatch(t *testing.T) {
	h := newHarness()
	ctx := context.Background()
	// the list is read before the join lands, then the join returns while the
	// read is still under way
	h.fake.duringRead = func() {
		h.fake.duringRead = nil
		require.NoError(t, h.q.QueuePlayer(ctx, "a", pod, types.CharacterInPlay{}))
	}
	h.read(t)

	assert.Empty(t, h.wait.seconds, "a player who joined mid-read was counted as matched")

	h.clock.advance(2 * time.Second)
	h.fake.match(1)
	h.read(t)
	assert.Len(t, h.wait.seconds, 1, "the later match is still observed")
}

func TestFailedReadLeavesTheGaugeAndWaits(t *testing.T) {
	h := newHarness()
	ctx := context.Background()
	require.NoError(t, h.q.QueuePlayer(ctx, "a", pod, types.CharacterInPlay{}))
	h.read(t)
	h.fake.readErr = errors.New("redis down")
	h.clock.advance(time.Second)

	_, _, err := h.q.QueuedPlayers(ctx, pod)
	require.Error(t, err)

	assert.Equal(t, 1.0, testutil.ToFloat64(h.depth))
	assert.Empty(t, h.wait.seconds)
}
