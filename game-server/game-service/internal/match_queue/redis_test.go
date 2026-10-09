package matchqueue_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	matchqueue "github.com/darkphotonKN/barrowspire-server/game-service/internal/match_queue"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
)

// Key names are asserted literally: they are the shared contract between
// replicas, so a test that reused the package constants would not catch a rename.
const (
	queueKey     = "queue"
	playerPodKey = "player:pod"
)

func newQueue(t *testing.T) (*matchqueue.Redis, redis.UniversalClient) {
	t.Helper()
	client, _ := testutil.NewRedis(t)
	return matchqueue.NewRedis(client), client
}

func TestQueuePlayer_FirstJoin_AddsToQueueAndPodHash(t *testing.T) {
	q, client := newQueue(t)
	ctx := context.Background()

	require.NoError(t, q.QueuePlayer(ctx, "p1", "pod-a"))

	assert.Equal(t, []string{"p1"}, client.LRange(ctx, queueKey, 0, -1).Val())
	assert.Equal(t, "pod-a", client.HGet(ctx, playerPodKey, "p1").Val())
}

func TestQueuePlayer_SecondJoin_ReturnsAlreadyQueuedAndKeepsOneEntry(t *testing.T) {
	q, client := newQueue(t)
	ctx := context.Background()

	require.NoError(t, q.QueuePlayer(ctx, "p1", "pod-a"))
	err := q.QueuePlayer(ctx, "p1", "pod-b")

	assert.ErrorIs(t, err, matchmaker.ErrPlayerAlreadyQueued)
	assert.Equal(t, []string{"p1"}, client.LRange(ctx, queueKey, 0, -1).Val())
	assert.Equal(t, "pod-a", client.HGet(ctx, playerPodKey, "p1").Val(), "first pod must win")
}

func TestDequeuePlayer_ClearsQueueAndPodHash_AndIsIdempotent(t *testing.T) {
	q, client := newQueue(t)
	ctx := context.Background()

	require.NoError(t, q.QueuePlayer(ctx, "p1", "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p2", "pod-a"))

	require.NoError(t, q.DequeuePlayer(ctx, "p1"))
	require.NoError(t, q.DequeuePlayer(ctx, "p1"), "second dequeue must be safe")

	assert.Equal(t, []string{"p2"}, client.LRange(ctx, queueKey, 0, -1).Val())
	assert.False(t, client.HExists(ctx, playerPodKey, "p1").Val())
	assert.True(t, client.HExists(ctx, playerPodKey, "p2").Val())
}

func TestMarkPodAlive_SetsKeyThatExpiresAfterThreeSeconds(t *testing.T) {
	client, mr := testutil.NewRedis(t)
	q := matchqueue.NewRedis(client)
	ctx := context.Background()

	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))

	assert.True(t, mr.Exists("pod:alive:pod-a"))
	assert.Equal(t, 3*time.Second, mr.TTL("pod:alive:pod-a"))

	mr.FastForward(3 * time.Second)
	assert.False(t, mr.Exists("pod:alive:pod-a"), "key must expire once the heartbeat stops")
}

func TestMarkPodAlive_Refresh_ExtendsTheTTL(t *testing.T) {
	client, mr := testutil.NewRedis(t)
	q := matchqueue.NewRedis(client)
	ctx := context.Background()

	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))
	mr.FastForward(2 * time.Second)
	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))
	mr.FastForward(2 * time.Second)

	assert.True(t, mr.Exists("pod:alive:pod-a"), "a refreshed pod must stay alive past the first TTL")
}

var matchOfTwo = matchmaker.MatchCriteria{MatchSize: 2}

func TestMatchmake_FewerThanMatchSize_ReturnsNilAndLeavesPlayerQueued(t *testing.T) {
	q, client := newQueue(t)
	ctx := context.Background()

	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p1", "pod-a"))

	matched, err := q.Matchmake(ctx, matchOfTwo)

	require.NoError(t, err)
	assert.Nil(t, matched)
	assert.Equal(t, []string{"p1"}, client.LRange(ctx, queueKey, 0, -1).Val())
	assert.Equal(t, "pod-a", client.HGet(ctx, playerPodKey, "p1").Val())
}

func TestMatchmake_FullGroup_ReturnsArrivalOrderWithPodsAndCleansKeys(t *testing.T) {
	q, client := newQueue(t)
	ctx := context.Background()

	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))
	require.NoError(t, q.MarkPodAlive(ctx, "pod-b"))
	require.NoError(t, q.QueuePlayer(ctx, "p1", "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p2", "pod-b"))
	require.NoError(t, q.QueuePlayer(ctx, "p3", "pod-a"))

	matched, err := q.Matchmake(ctx, matchOfTwo)

	require.NoError(t, err)
	assert.Equal(t, []matchmaker.MatchedPlayer{
		{ID: "p1", Pod: "pod-a"},
		{ID: "p2", Pod: "pod-b"},
	}, matched)
	assert.Equal(t, []string{"p3"}, client.LRange(ctx, queueKey, 0, -1).Val(), "the rest keeps its place")
	assert.False(t, client.HExists(ctx, playerPodKey, "p1").Val())
	assert.False(t, client.HExists(ctx, playerPodKey, "p2").Val())
	assert.True(t, client.HExists(ctx, playerPodKey, "p3").Val())
}

func TestMatchmake_MissingPod_ReturnsErrorAndRestoresOthersInOrder(t *testing.T) {
	q, client := newQueue(t)
	ctx := context.Background()

	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p1", "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p2", "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p3", "pod-a"))
	// drift: p2 is queued but its pod record is gone
	require.NoError(t, client.HDel(ctx, playerPodKey, "p2").Err())

	matched, err := q.Matchmake(ctx, matchmaker.MatchCriteria{MatchSize: 3})

	require.Error(t, err)
	assert.Nil(t, matched)
	assert.Equal(t, []string{"p1", "p3"}, client.LRange(ctx, queueKey, 0, -1).Val())
	assert.True(t, client.HExists(ctx, playerPodKey, "p1").Val())
	assert.True(t, client.HExists(ctx, playerPodKey, "p3").Val())
}

func TestMatchmake_DeadPod_DropsItsPlayerAndSurvivorKeepsTheHead(t *testing.T) {
	client, mr := testutil.NewRedis(t)
	q := matchqueue.NewRedis(client)
	ctx := context.Background()

	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))
	require.NoError(t, q.MarkPodAlive(ctx, "pod-b"))
	require.NoError(t, q.QueuePlayer(ctx, "p1", "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p2", "pod-b"))
	require.NoError(t, q.QueuePlayer(ctx, "p3", "pod-a"))

	// pod-a keeps beating, pod-b goes silent and its key expires
	mr.FastForward(2 * time.Second)
	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))
	mr.FastForward(2 * time.Second)
	require.False(t, mr.Exists("pod:alive:pod-b"))

	matched, err := q.Matchmake(ctx, matchOfTwo)

	require.NoError(t, err, "a dead pod is an expected case, not an error")
	assert.Nil(t, matched)
	assert.Equal(t, []string{"p1", "p3"}, client.LRange(ctx, queueKey, 0, -1).Val(), "survivor back at the head")
	assert.False(t, client.HExists(ctx, playerPodKey, "p2").Val(), "dead pod's player is cleaned up")
	assert.Equal(t, "pod-a", client.HGet(ctx, playerPodKey, "p1").Val(), "survivor keeps its pod record")
}

func TestMatchmake_DeadPodFirstInGroup_DropsItAndRestoresTheRestInOrder(t *testing.T) {
	q, client := newQueue(t)
	ctx := context.Background()

	// pod-dead never beats at all
	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p1", "pod-dead"))
	require.NoError(t, q.QueuePlayer(ctx, "p2", "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p3", "pod-a"))
	require.NoError(t, q.QueuePlayer(ctx, "p4", "pod-a"))

	matched, err := q.Matchmake(ctx, matchmaker.MatchCriteria{MatchSize: 3})

	require.NoError(t, err)
	assert.Nil(t, matched)
	assert.Equal(t, []string{"p2", "p3", "p4"}, client.LRange(ctx, queueKey, 0, -1).Val())
	assert.False(t, client.HExists(ctx, playerPodKey, "p1").Val())
}

// Several matchers run the same rounds at once (the lock expired, or it is not
// held at all). The script's atomic pop must still hand each player out once,
// and only ever in full groups. FS-K2HKP §Requirements 14.
func TestMatchmake_ConcurrentMatchers_NeverDuplicateOrSplitAGroup(t *testing.T) {
	q, client := newQueue(t)
	ctx := context.Background()

	const players = 40
	const matchers = 8
	require.NoError(t, q.MarkPodAlive(ctx, "pod-a"))
	for i := range players {
		require.NoError(t, q.QueuePlayer(ctx, fmt.Sprintf("p%d", i), "pod-a"))
	}

	var (
		mu     sync.Mutex
		groups [][]matchmaker.MatchedPlayer
		wg     sync.WaitGroup
	)
	for range matchers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// each matcher keeps going until the queue is drained
			for range players {
				matched, err := q.Matchmake(ctx, matchOfTwo)
				assert.NoError(t, err)
				if matched == nil {
					continue
				}
				mu.Lock()
				groups = append(groups, matched)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	seen := make(map[string]bool, players)
	for _, group := range groups {
		require.Len(t, group, matchOfTwo.MatchSize, "a partial group was handed out")
		for _, p := range group {
			require.False(t, seen[p.ID], "player %s matched twice", p.ID)
			seen[p.ID] = true
		}
	}
	assert.Len(t, seen, players, "every queued player is matched exactly once")
	assert.Zero(t, client.LLen(ctx, queueKey).Val())
	assert.Zero(t, client.HLen(ctx, playerPodKey).Val())
}
