package chatbus_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/chatbus"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-KCQ06 Edge States (target's pod crashed). PublishCount tells how many subscribers Redis
// handed the payload to: none on a channel nobody listens on, one per subscriber otherwise.
func TestPublishCount_CountsSubscribers(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	bus := chatbus.NewRedis(client)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	heard, err := bus.PublishCount(ctx, "pod:pod-b:inbox", []byte("hello"))
	require.NoError(t, err)
	assert.Zero(t, heard, "nobody listens on pod B's inbox yet")

	got := make(chan []byte, 1)
	go func() { _ = bus.Listen(ctx, "pod:pod-b:inbox", func(p []byte) { got <- p }) }()
	require.Eventually(t, func() bool { return mini.PubSubNumSub("pod:pod-b:inbox")["pod:pod-b:inbox"] == 1 },
		time.Second, 10*time.Millisecond)

	heard, err = bus.PublishCount(ctx, "pod:pod-b:inbox", []byte("hello"))
	require.NoError(t, err)
	assert.EqualValues(t, 1, heard)
	select {
	case p := <-got:
		assert.Equal(t, "hello", string(p))
	case <-time.After(time.Second):
		t.Fatal("the subscriber never got the payload")
	}
}

// A publish Redis refuses is an error, not a count.
func TestPublishCount_RedisGone_Error(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	bus := chatbus.NewRedis(client)
	mini.Close()

	_, err := bus.PublishCount(context.Background(), "pod:pod-b:inbox", []byte("hello"))
	assert.Error(t, err)
}
