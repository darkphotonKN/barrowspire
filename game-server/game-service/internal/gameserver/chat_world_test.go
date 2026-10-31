package gameserver

import (
	"context"
	"encoding/json"
	"log/slog"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/chatbus"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-5SH4G §Requirements B7, B9, B11, B13. I-5SH4G-1: a pod subscribes to the world channel
// and delivers each line that arrives to every player seated on it, on the hub's loop.

// worldRig is a pod on a miniredis, with the client a test publishes through.
type worldRig struct {
	*chatRig
	redis  redis.UniversalClient
	mini   *miniredis.Miniredis
	cancel context.CancelFunc
}

func newWorldRig(t *testing.T) *worldRig {
	t.Helper()

	client, mini := testutil.NewRedis(t)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	characters := newFakeCharacters()
	clock := newChatClock()
	server := newTestServer(t, ctx, &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters, testPodID, testPodAddr, noopAnnouncer{},
		WithChatClock(clock.now),
		WithChatIDs(func() uuid.UUID { return chatTestID }),
		WithChatBus(chatbus.NewRedis(client)),
	)
	hub, ok := server.HubSession()
	require.True(t, ok)
	meadows, ok := server.FieldSession(game.FieldGentleMeadows)
	require.True(t, ok)

	return &worldRig{
		chatRig: &chatRig{server: server, clock: clock, hub: hub, meadows: meadows, characters: characters},
		redis:   client,
		mini:    mini,
		cancel:  cancel,
	}
}

// stampedWorldLine is a line as another pod would have published it.
func stampedWorldLine(text string) map[string]any {
	return map[string]any{
		"message_id":  uuid.New().String(),
		"sender_id":   uuid.New().String(),
		"sender_name": "Marl",
		"channel":     "world",
		"scope":       "world",
		"sent_at":     "2026-10-31T09:30:15.250Z",
		"text":        text,
	}
}

// publish puts raw bytes on the world channel, retrying until a subscriber is listening: go-redis
// subscribes asynchronously, and a publish before that lands on nobody.
func (r *worldRig) publish(t *testing.T, raw []byte) {
	t.Helper()
	require.Eventually(t, func() bool {
		n, err := r.redis.Publish(context.Background(), chatbus.WorldChannel, raw).Result()
		return err == nil && n > 0
	}, startSoloSettle, 10*time.Millisecond, "no subscriber on the world channel")
}

func (r *worldRig) publishLine(t *testing.T, line map[string]any) {
	t.Helper()
	raw, err := json.Marshal(line)
	require.NoError(t, err)
	r.publish(t, raw)
}

// A line on the world channel reaches every player seated on the pod, in the hub, a field and a
// run alike, with the publisher's stamp; a connected player in no world hears nothing.
// FS-5SH4G R7, R9.
func TestWorldChat_DeliversToEveryoneSeatedOnThePod(t *testing.T) {
	rig := newWorldRig(t)
	_, _, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inMeadows(t, "Kaelen")
	_, _, idrisInbox := rig.inRun(t, "Idris")
	_, _, ashInbox := rig.connected(t, "Ash")

	line := stampedWorldLine("hello from another pod")
	rig.publishLine(t, line)

	for who, inbox := range map[string]*startSoloInbox{"Wren (hub)": wrenInbox, "Kaelen (Meadows)": kaelenInbox, "Idris (run)": idrisInbox} {
		got := awaitChat(t, inbox, who)
		assert.Equal(t, line["message_id"], got.Payload["message_id"], "%s gets the publisher's id", who)
		assert.Equal(t, "world", got.Payload["channel"])
		assert.Equal(t, "Marl", got.Payload["sender_name"])
		assert.Equal(t, "hello from another pod", got.Payload["text"])
	}
	assertSilent(t, ashInbox, "Ash (no world)")
}

// A message on the channel that is not a stamped line is skipped with a Warn carrying no text,
// and the next good line still arrives. FS-5SH4G R9, R14; §Edge States decoding.
func TestWorldChat_SkipsWhatIsNotALine(t *testing.T) {
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })

	rig := newWorldRig(t)
	_, _, wrenInbox := rig.inHub(t, "Wren")

	const secret = "ciphertext-of-the-north-gate"
	rig.publish(t, []byte("{not json "+secret))
	rig.publish(t, []byte(`{"text":"`+secret+`","channel":"world"}`))
	rig.publishLine(t, stampedWorldLine("after the noise"))

	got := awaitChat(t, wrenInbox, "Wren")
	assert.Equal(t, "after the noise", got.Payload["text"])
	assert.Contains(t, sink.String(), "chat bus message skipped")
	assert.NotContains(t, sink.String(), secret, "a skipped message's bytes reached the log")
}

// A pod with nobody seated receives the line and delivers to no one, without error. FS-5SH4G R7.
func TestWorldChat_NobodySeatedIsFine(t *testing.T) {
	rig := newWorldRig(t)
	_, _, ashInbox := rig.connected(t, "Ash")

	rig.publishLine(t, stampedWorldLine("anyone?"))

	assertSilent(t, ashInbox, "Ash (no world)")
}

// The subscriber stops with the server's context: the pod's goroutine does not outlive it.
// FS-5SH4G R9.
func TestWorldChat_SubscriberStopsWithTheServer(t *testing.T) {
	rig := newWorldRig(t)
	_, _, wrenInbox := rig.inHub(t, "Wren")
	rig.publishLine(t, stampedWorldLine("still here"))
	awaitChat(t, wrenInbox, "Wren")

	rig.cancel()

	// once the subscriber is gone, a publish finds no listener
	require.Eventually(t, func() bool {
		n, err := rig.redis.Publish(context.Background(), chatbus.WorldChannel, []byte("{}")).Result()
		return err == nil && n == 0
	}, startSoloSettle, 10*time.Millisecond, "the subscriber is still listening after the context ended")
}

// Nothing on this path writes a key: the bus is publish and subscribe alone. FS-5SH4G R11,
// ADR-0033.
func TestWorldChat_WritesNoKeys(t *testing.T) {
	rig := newWorldRig(t)
	_, _, wrenInbox := rig.inHub(t, "Wren")

	rig.publishLine(t, stampedWorldLine("no trace"))
	awaitChat(t, wrenInbox, "Wren")

	assert.Empty(t, rig.mini.Keys(), "the chat path wrote a key")
}

// Logs on the delivery path carry no text. FS-5SH4G R14.
func TestWorldChat_LogsCarryNoText(t *testing.T) {
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })

	rig := newWorldRig(t)
	_, _, wrenInbox := rig.inHub(t, "Wren")

	const secret = "the-watchword-is-ember"
	rig.publishLine(t, stampedWorldLine(secret))
	awaitChat(t, wrenInbox, "Wren")

	assert.NotContains(t, sink.String(), secret)
}
