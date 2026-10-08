package testutil_test

// Example patterns for testing Redis-backed code against miniredis.
// Copy what you need; nothing here wraps a feature operation.

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
)

func TestRedisExample_PubSub(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	ctx := context.Background()

	pubsub := client.Subscribe(ctx, "hub:state")
	t.Cleanup(func() { _ = pubsub.Close() })

	// Wait for the subscription confirmation before publishing, otherwise the
	// message can be published before the server registers the subscriber.
	_, err := pubsub.Receive(ctx)
	require.NoError(t, err)

	msgs := pubsub.Channel()

	require.NoError(t, client.Publish(ctx, "hub:state", "player-joined").Err())

	select {
	case msg := <-msgs:
		assert.Equal(t, "hub:state", msg.Channel)
		assert.Equal(t, "player-joined", msg.Payload)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for published message")
	}
}

func TestRedisExample_TTLWithFastForward(t *testing.T) {
	client, mr := testutil.NewRedis(t)
	ctx := context.Background()

	require.NoError(t, client.Set(ctx, "pod:alive:a", "1", 10*time.Second).Err())

	// miniredis does not expire keys on wall-clock time; advance it explicitly.
	mr.FastForward(9 * time.Second)
	assert.True(t, mr.Exists("pod:alive:a"), "key should survive before its TTL")

	mr.FastForward(2 * time.Second)
	_, err := client.Get(ctx, "pod:alive:a").Result()
	assert.ErrorIs(t, err, redis.Nil, "key should be gone after its TTL")
}

func TestRedisExample_EvalLua(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	ctx := context.Background()

	// Compare-and-delete: remove the key only if it holds the expected value.
	script := redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`)

	require.NoError(t, client.Set(ctx, "lock", "owner-a", 0).Err())

	n, err := script.Run(ctx, client, []string{"lock"}, "owner-b").Int()
	require.NoError(t, err)
	assert.Equal(t, 0, n, "wrong owner must not delete")

	n, err = script.Run(ctx, client, []string{"lock"}, "owner-a").Int()
	require.NoError(t, err)
	assert.Equal(t, 1, n, "right owner deletes")

	// Raw EVAL works too.
	res, err := client.Eval(ctx, "return ARGV[1]", nil, "hello").Text()
	require.NoError(t, err)
	assert.Equal(t, "hello", res)
}

func TestRedisExample_ListOps(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	ctx := context.Background()

	require.NoError(t, client.RPush(ctx, "queue", "p1", "p2", "p3").Err())

	removed, err := client.LRem(ctx, "queue", 0, "p2").Result()
	require.NoError(t, err)
	assert.Equal(t, int64(1), removed)

	require.NoError(t, client.LPush(ctx, "queue", "p0").Err())

	got, err := client.LRange(ctx, "queue", 0, -1).Result()
	require.NoError(t, err)
	assert.Equal(t, []string{"p0", "p1", "p3"}, got)
}

func TestRedisExample_GetDel(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	ctx := context.Background()

	require.NoError(t, client.Set(ctx, "handoff:ticket-1", `{"player_id":"p1","run_id":"r1"}`, 0).Err())

	val, err := client.GetDel(ctx, "handoff:ticket-1").Result()
	require.NoError(t, err)
	assert.Equal(t, `{"player_id":"p1","run_id":"r1"}`, val)

	_, err = client.GetDel(ctx, "handoff:ticket-1").Result()
	assert.ErrorIs(t, err, redis.Nil, "second GETDEL finds nothing")
}
