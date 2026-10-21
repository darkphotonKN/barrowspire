package matchmaker_test

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

// fakeMatchQueue records heartbeats; the queue operations are inert so the
// match loop Start also launches stays idle.
type fakeMatchQueue struct {
	mu        sync.Mutex
	beats     []string
	beatErr   error
	beatCalls int

	// what QueuedPlayers reports
	queueLen     int
	podPlayerIDs []string
	queuedPodIDs []string

	// groups Matchmake hands out, one per call, then nothing
	matches [][]matchmaker.MatchedPlayer

	// liveness deletes, and how many beats had landed when each arrived
	deads          []string
	beatsAtDead    int
	deadCtxErr     error
	deadHadTimeout bool
}

func (f *fakeMatchQueue) MarkPodDead(ctx context.Context, podID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deads = append(f.deads, podID)
	f.beatsAtDead = f.beatCalls
	f.deadCtxErr = ctx.Err()
	_, f.deadHadTimeout = ctx.Deadline()
	return nil
}

func (f *fakeMatchQueue) QueuePlayer(context.Context, string, string, types.CharacterInPlay) error {
	return nil
}
func (f *fakeMatchQueue) DequeuePlayer(context.Context, string) error { return nil }
func (f *fakeMatchQueue) QueuedCharacter(context.Context, string) (uuid.UUID, bool, error) {
	return uuid.Nil, false, nil
}
func (f *fakeMatchQueue) Matchmake(context.Context, matchmaker.MatchCriteria) ([]matchmaker.MatchedPlayer, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.matches) == 0 {
		return nil, nil
	}
	match := f.matches[0]
	f.matches = f.matches[1:]
	return match, nil
}

// fakeAnnouncer records what the match loop announces. Listen blocks like the
// real subscriber until ctx ends.
type fakeAnnouncer struct {
	mu        sync.Mutex
	announced []matchmaker.MatchStart
}

func (a *fakeAnnouncer) Announce(_ context.Context, payload matchmaker.MatchStart) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.announced = append(a.announced, payload)
	return nil
}

func (a *fakeAnnouncer) Listen(ctx context.Context, _ string, _ matchmaker.MatchReadyCh) error {
	<-ctx.Done()
	return ctx.Err()
}

func (a *fakeAnnouncer) announcements() []matchmaker.MatchStart {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]matchmaker.MatchStart(nil), a.announced...)
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

func (f *fakeMatchQueue) QueuedPlayers(_ context.Context, podID string) (int, []string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.queuedPodIDs = append(f.queuedPodIDs, podID)
	return f.queueLen, f.podPlayerIDs, nil
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

	matchmaker.NewMatchmaker(2, "pod-a", fake, &fakeAnnouncer{}).Start(ctx)

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

	matchmaker.NewMatchmaker(2, "pod-a", fake, &fakeAnnouncer{}).Start(ctx)

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

	matchmaker.NewMatchmaker(2, "pod-a", fake, &fakeAnnouncer{}).Start(ctx)

	require.Eventually(t, func() bool {
		n, _ := fake.calls()
		return n >= 2
	}, 3*time.Second, 20*time.Millisecond, "a failed beat must not stop the loop")
}

func TestStart_Heartbeat_StopsWhenContextIsCancelled(t *testing.T) {
	fake := &fakeMatchQueue{}
	ctx, cancel := context.WithCancel(context.Background())

	matchmaker.NewMatchmaker(2, "pod-a", fake, &fakeAnnouncer{}).Start(ctx)
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

func receiveStatus(t *testing.T, ch chan matchmaker.QueueStatus, within time.Duration) (matchmaker.QueueStatus, bool) {
	t.Helper()
	select {
	case status := <-ch:
		return status, true
	case <-time.After(within):
		return matchmaker.QueueStatus{}, false
	}
}

func TestStart_QueueStatus_ReportsGlobalCountToThisPodsQueuedPlayers(t *testing.T) {
	local := uuid.New()
	fake := &fakeMatchQueue{queueLen: 1, podPlayerIDs: []string{local.String()}}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	mm := matchmaker.NewMatchmaker(2, "pod-a", fake, &fakeAnnouncer{})
	mm.Start(ctx)

	status, ok := receiveStatus(t, mm.GetQueueStatusChan(ctx), 3*time.Second)
	require.True(t, ok, "expected a queue status")

	assert.Equal(t, 1, status.Current)
	assert.Equal(t, 2, status.Total)
	require.Len(t, status.Players, 1)
	assert.Equal(t, local, status.Players[0].ID)

	fake.mu.Lock()
	defer fake.mu.Unlock()
	assert.Contains(t, fake.queuedPodIDs, "pod-a", "status must be asked for this pod's players")
}

// The global queue can briefly hold more than one group between match ticks;
// the panel is progress toward the next match, so it never reads past full.
func TestStart_QueueStatus_CurrentNeverExceedsMatchSize(t *testing.T) {
	fake := &fakeMatchQueue{queueLen: 5, podPlayerIDs: []string{uuid.NewString()}}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	mm := matchmaker.NewMatchmaker(2, "pod-a", fake, &fakeAnnouncer{})
	mm.Start(ctx)

	status, ok := receiveStatus(t, mm.GetQueueStatusChan(ctx), 3*time.Second)
	require.True(t, ok)
	assert.Equal(t, 2, status.Current)
}

func TestStart_QueueStatus_NoPlayersOnThisPod_SendsNothing(t *testing.T) {
	fake := &fakeMatchQueue{queueLen: 1}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	mm := matchmaker.NewMatchmaker(2, "pod-a", fake, &fakeAnnouncer{})
	mm.Start(ctx)

	_, ok := receiveStatus(t, mm.GetQueueStatusChan(ctx), 2500*time.Millisecond)
	assert.False(t, ok, "no one on this pod to tell")
}

// A busy hub must not wedge the loop: a stale snapshot is dropped and the next
// tick sends a fresh one.
func TestStart_QueueStatus_HubNotReading_DropsAndKeepsReporting(t *testing.T) {
	fake := &fakeMatchQueue{queueLen: 1, podPlayerIDs: []string{uuid.NewString()}}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	mm := matchmaker.NewMatchmaker(2, "pod-a", fake, &fakeAnnouncer{})
	mm.Start(ctx)

	// nobody reads for a few ticks
	time.Sleep(3 * time.Second)

	fake.mu.Lock()
	asked := len(fake.queuedPodIDs)
	fake.mu.Unlock()
	assert.GreaterOrEqual(t, asked, 2, "the loop kept ticking while the hub was busy")

	_, ok := receiveStatus(t, mm.GetQueueStatusChan(ctx), 3*time.Second)
	assert.True(t, ok, "reporting resumes once the hub reads again")
}

// The wire values are asserted literally: they are the contract between pods,
// so reusing the Go constants would not catch a rename. FS-K2HKP §Requirements 17.
func TestStart_Match_AnnouncesCreateStepWithARunIDPerMatch(t *testing.T) {
	p1, p2, p3, p4 := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	fake := &fakeMatchQueue{matches: [][]matchmaker.MatchedPlayer{
		{{ID: p1.String(), Pod: "pod-a"}, {ID: p2.String(), Pod: "pod-b"}},
		{{ID: p3.String(), Pod: "pod-b"}, {ID: p4.String(), Pod: "pod-a"}},
	}}
	announcer := &fakeAnnouncer{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	matchmaker.NewMatchmaker(2, "pod-a", fake, announcer).Start(ctx)

	require.Eventually(t, func() bool { return len(announcer.announcements()) == 2 },
		4*time.Second, 20*time.Millisecond)
	got := announcer.announcements()

	first, err := json.Marshal(got[0])
	require.NoError(t, err)
	var wire map[string]any
	require.NoError(t, json.Unmarshal(first, &wire))
	assert.Equal(t, "create", wire["step"])
	assert.Equal(t, "pod-a", wire["pod_id"], "host is the first popped player's pod")
	assert.NotEmpty(t, wire["run_id"])

	assert.NotEqual(t, uuid.Nil, got[0].RunID)
	assert.NotEqual(t, got[0].RunID, got[1].RunID, "each match gets its own run id")
	assert.Equal(t, "pod-b", got[1].PodID)
	assert.Equal(t, []string{"pod-a", "pod-b"}, []string{got[0].Players[0].Pod, got[0].Players[1].Pod})
}

func TestMatchStep_WireValues(t *testing.T) {
	assert.Equal(t, "create", string(matchmaker.MatchStepCreate))
	assert.Equal(t, "handoff", string(matchmaker.MatchStepHandoff))
}

// Graceful shutdown: the heartbeat stops first, then the pod deletes its own
// liveness key on a fresh context (the root one is already cancelled), and
// Stopped closes once that is done. FS-K2HKP §Requirements 3.
func TestStart_Shutdown_StopsBeatingThenDeletesAliveKey(t *testing.T) {
	fake := &fakeMatchQueue{}
	ctx, cancel := context.WithCancel(context.Background())

	mm := matchmaker.NewMatchmaker(2, "pod-a", fake, &fakeAnnouncer{})
	mm.Start(ctx)
	require.Eventually(t, func() bool {
		n, _ := fake.calls()
		return n >= 1
	}, 3*time.Second, 10*time.Millisecond)

	cancel()

	select {
	case <-mm.Stopped():
	case <-time.After(3 * time.Second):
		t.Fatal("Stopped never closed after ctx was cancelled")
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()
	assert.Equal(t, []string{"pod-a"}, fake.deads)
	assert.NoError(t, fake.deadCtxErr, "delete must not run on the cancelled root context")
	assert.True(t, fake.deadHadTimeout, "delete needs its own short timeout")
	assert.Equal(t, fake.beatCalls, fake.beatsAtDead, "no beat may land after the delete")
}
