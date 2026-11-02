package gameserver

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeOccupancy records each count published.
type fakeOccupancy struct {
	mu     sync.Mutex
	counts []int
}

func (f *fakeOccupancy) Publish(_ context.Context, _ string, count int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.counts = append(f.counts, count)
	return nil
}

func (f *fakeOccupancy) published() []int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]int(nil), f.counts...)
}

// hubOf is a pod holding nobody present, with n in its hub.
type hubOf struct{ n int }

func (h *hubOf) PresentPlayers() []presentPlayer    { return nil }
func (h *hubOf) Travellers() map[uuid.UUID]struct{} { return nil }
func (h *hubOf) HubOccupancy() int                  { return h.n }

// The hub's count is published when it changes, and otherwise once its last publish is two
// seconds old, inside the 3 s TTL: not every tick, so a slow Redis is not handed a write a second
// on the writer the presence index shares (FS-JEAVX R19; code review MED).
func TestPresenceKeeper_HubOccupancy_PublishedOnChangeOrBeforeItLapses(t *testing.T) {
	occupancy := &fakeOccupancy{}
	hub := &hubOf{n: 3}
	clock := newChatClock()
	writer := newOrderedWriter()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	writer.start(ctx)
	keeper := newPresenceKeeper(nil, occupancy, hub, "pod-a", "ws://pod-a/ws", clock.now, writer)
	wait := func(want []int, what string) {
		t.Helper()
		require.Eventually(t, func() bool { return assert.ObjectsAreEqual(want, occupancy.published()) },
			time.Second, 5*time.Millisecond, "%s: published %v", what, occupancy.published())
	}

	keeper.tick()
	wait([]int{3}, "the first tick")
	clock.advance(time.Second)
	keeper.tick()
	time.Sleep(20 * time.Millisecond)
	wait([]int{3}, "unchanged a second later")
	hub.n = 4
	keeper.tick()
	wait([]int{3, 4}, "changed")
	clock.advance(2 * time.Second)
	keeper.tick()
	wait([]int{3, 4, 4}, "two seconds since the last")
}
