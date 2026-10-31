package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/chatbus"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
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
	return newWorldPod(t, client, mini, testPodID, chatbus.NewRedis(client))
}

// newWorldPod is one pod on the given Redis, speaking through bus (the real one, or a double
// around it). Two pods on one miniredis are two replicas of the game.
func newWorldPod(t *testing.T, client redis.UniversalClient, mini *miniredis.Miniredis, podID string, bus chatBus) *worldRig {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	characters := newFakeCharacters()
	clock := newChatClock()
	server := newTestServer(t, ctx, &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters, podID, testPodAddr, noopAnnouncer{},
		WithChatClock(clock.now),
		WithChatIDs(uuid.New),
		WithChatBus(bus),
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
	r.publishHeardBy(t, raw, 1)
}

// publishHeardBy retries until at least `subscribers` pods hear the publish, so a test with two
// pods knows both are listening before anyone speaks.
func (r *worldRig) publishHeardBy(t *testing.T, raw []byte, subscribers int64) {
	t.Helper()
	require.Eventually(t, func() bool {
		n, err := r.redis.Publish(context.Background(), chatbus.WorldChannel, raw).Result()
		return err == nil && n >= subscribers
	}, startSoloSettle, 10*time.Millisecond, "fewer than %d subscribers on the world channel", subscribers)
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

// ── Sending: the world channel open, one path through Redis (I-5SH4G-2) ─────────────────────

// twoPods is two replicas on one miniredis: A and B.
func twoPods(t *testing.T) (a, b *worldRig) {
	t.Helper()
	client, mini := testutil.NewRedis(t)
	a = newWorldPod(t, client, mini, "pod-a", chatbus.NewRedis(client))
	b = newWorldPod(t, client, mini, "pod-b", chatbus.NewRedis(client))
	// both subscribed before anyone speaks (review 2026-10-31: one heard is not two)
	a.publishHeardBy(t, []byte("{}"), 2)
	return a, b
}

// A world line from a player on pod A reaches every seated player on A and on B, the sender
// included, once each, stamped world/world, one message_id on both pods.
// FS-5SH4G R1, R2, R5–R7.
func TestWorldChat_ReachesBothPods(t *testing.T) {
	a, b := twoPods(t)
	wren, wrenConn, wrenInbox := a.inHub(t, "Wren")
	_, _, kaelenInbox := a.inRun(t, "Kaelen")
	_, _, marlInbox := b.inHub(t, "Marl")
	_, _, idrisInbox := b.inMeadows(t, "Idris")

	sendChat(a.server, wrenConn, "world", "hello, every village")

	var ids []string
	for who, inbox := range map[string]*startSoloInbox{"Wren (A, sender)": wrenInbox, "Kaelen (A, run)": kaelenInbox, "Marl (B)": marlInbox, "Idris (B, Meadows)": idrisInbox} {
		got := awaitChat(t, inbox, who)
		assert.Equal(t, "world", got.Payload["channel"], who)
		assert.Equal(t, "world", got.Payload["scope"], who)
		assert.Equal(t, wren.ID.String(), got.Payload["sender_id"], who)
		assert.Equal(t, "Wren", got.Payload["sender_name"], who)
		assert.Equal(t, "hello, every village", got.Payload["text"], who)
		ids = append(ids, got.Payload["message_id"].(string))
		assertSilent(t, inbox, who+" hears it once")
	}
	for _, id := range ids[1:] {
		assert.Equal(t, ids[0], id, "one message_id on both pods")
	}
}

// countingBus wraps a bus and counts publishes, so a test can say "nothing was published".
type countingBus struct {
	chatBus
	mu        sync.Mutex
	published int
}

func (b *countingBus) Publish(ctx context.Context, channel string, payload []byte) error {
	b.mu.Lock()
	b.published++
	b.mu.Unlock()
	return b.chatBus.Publish(ctx, channel, payload)
}

func (b *countingBus) count() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.published
}

// heldBus parks every publish until released, so a test can look at the world between a line
// being accepted and Redis returning it.
type heldBus struct {
	chatBus
	mu   sync.Mutex
	held [][]byte
}

func (b *heldBus) Publish(_ context.Context, _ string, payload []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.held = append(b.held, payload)
	return nil
}

func (b *heldBus) release(ctx context.Context) {
	b.mu.Lock()
	held := b.held
	b.held = nil
	b.mu.Unlock()
	for _, payload := range held {
		_ = b.chatBus.Publish(ctx, chatbus.WorldChannel, payload)
	}
}

// failOnceBus fails the first publish and passes the rest through.
type failOnceBus struct {
	chatBus
	failed atomic.Bool
}

func (b *failOnceBus) Publish(ctx context.Context, channel string, payload []byte) error {
	if b.failed.CompareAndSwap(false, true) {
		return errors.New("redis: connection refused")
	}
	return b.chatBus.Publish(ctx, channel, payload)
}

// A world line from a player in no world is refused and never published. FS-5SH4G R3.
func TestWorldChat_FromNoWorldIsRefusedAndNotPublished(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	bus := &countingBus{chatBus: chatbus.NewRedis(client)}
	rig := newWorldPod(t, client, mini, "pod-a", bus)
	_, ashConn, ashInbox := rig.connected(t, "Ash")

	sendChat(rig.server, ashConn, "world", "anyone?")

	notice := awaitNotice(t, ashInbox, "Ash")
	assert.Equal(t, "not_in_world", notice.Payload["code"])
	assert.Equal(t, 0, bus.count())
}

// An area line never touches the bus. FS-5SH4G R12.
func TestWorldChat_AreaLinesAreNeverPublished(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	bus := &countingBus{chatBus: chatbus.NewRedis(client)}
	rig := newWorldPod(t, client, mini, "pod-a", bus)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")

	sendChat(rig.server, wrenConn, "area", "just the town")
	awaitChat(t, wrenInbox, "Wren")

	assert.Equal(t, 0, bus.count())
}

// Ten world lines accepted in order on A arrive on B in that order. FS-5SH4G R8, R10.
func TestWorldChat_KeepsOrderAcrossPods(t *testing.T) {
	a, b := twoPods(t)
	_, _, marlInbox := b.inHub(t, "Marl")
	sent := []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J"}
	speakers := make([]*websocket.Conn, len(sent))
	for i := range sent {
		_, speakers[i], _ = a.inHub(t, "Speaker"+sent[i])
	}

	for i, text := range sent {
		sendChat(a.server, speakers[i], "world", text)
	}

	got := make([]string, 0, len(sent))
	for range sent {
		got = append(got, awaitChat(t, marlInbox, "Marl").Payload["text"].(string))
	}
	assert.Equal(t, sent, got)
}

// Until Redis returns the line, nobody on the sender's pod has it, the sender included: one
// path, no local short-cut. FS-5SH4G R6.
func TestWorldChat_SendersPodHearsOnlyWhatRedisReturns(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	bus := &heldBus{chatBus: chatbus.NewRedis(client)}
	rig := newWorldPod(t, client, mini, "pod-a", bus)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.publish(t, []byte("{}")) // subscribed

	sendChat(rig.server, wrenConn, "world", "held at the gate")
	assertSilent(t, wrenInbox, "Wren before Redis returns it")
	assertSilent(t, kaelenInbox, "Kaelen before Redis returns it")

	bus.release(context.Background())
	assert.Equal(t, "held at the gate", awaitChat(t, wrenInbox, "Wren").Payload["text"])
	assert.Equal(t, "held at the gate", awaitChat(t, kaelenInbox, "Kaelen").Payload["text"])
}

// A publish that fails drops the line with a Warn carrying no text; the next line goes through.
// FS-5SH4G R8, R11, R14.
func TestWorldChat_FailedPublishDropsTheLineAndCarriesOn(t *testing.T) {
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })

	client, mini := testutil.NewRedis(t)
	bus := &failOnceBus{chatBus: chatbus.NewRedis(client)}
	rig := newWorldPod(t, client, mini, "pod-a", bus)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, _ := rig.inHub(t, "Kaelen")
	rig.publish(t, []byte("{}")) // subscribed

	// two speakers, so the flood window plays no part
	const lost = "the-lost-line-9f3a"
	sendChat(rig.server, wrenConn, "world", lost)
	sendChat(rig.server, kaelenConn, "world", "and the next")

	assert.Equal(t, "and the next", awaitChat(t, wrenInbox, "Wren").Payload["text"])
	assertSilent(t, wrenInbox, "the lost line never arrives")
	assert.Contains(t, sink.String(), "publish failed")
	assert.NotContains(t, sink.String(), lost, "the dropped line's text reached the log")
}

// The 2 s flood window counts a world line and an area line from one player together.
// FS-5SH4G R4.
func TestWorldChat_SharesTheFloodWindowWithArea(t *testing.T) {
	rig := newWorldRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	rig.publish(t, []byte("{}")) // subscribed

	sendChat(rig.server, wrenConn, "world", "to everyone")
	awaitChat(t, wrenInbox, "Wren")
	rig.clock.advance(time.Second)
	sendChat(rig.server, wrenConn, "area", "to the town")

	notice := awaitNotice(t, wrenInbox, "Wren")
	assert.Equal(t, "too_fast", notice.Payload["code"])
}

// Logs on the world's sending path carry no text. FS-5SH4G R14.
func TestWorldChat_SendingLogsCarryNoText(t *testing.T) {
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })

	rig := newWorldRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	rig.publish(t, []byte("{}"))

	const secret = "meet-at-the-old-well-at-dusk"
	sendChat(rig.server, wrenConn, "world", secret)
	awaitChat(t, wrenInbox, "Wren")

	assert.NotContains(t, sink.String(), secret)
}

// ── Code review 2026-10-31 ──────────────────────────────────────────────────────────────────

// dropOnceBus's first Listen fails at once, as a dropped subscription does; the rest go through.
type dropOnceBus struct {
	chatBus
	dropped atomic.Bool
}

func (b *dropOnceBus) Listen(ctx context.Context, channel string, onMessage func([]byte)) error {
	if b.dropped.CompareAndSwap(false, true) {
		return errors.New("redis: subscription closed")
	}
	return b.chatBus.Listen(ctx, channel, onMessage)
}

// A dropped subscription is followed by a fresh one, and world chat carries on. FS-5SH4G R11.
func TestWorldChat_SubscribesAgainAfterADrop(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	rig := newWorldPod(t, client, mini, "pod-a", &dropOnceBus{chatBus: chatbus.NewRedis(client)})
	_, _, wrenInbox := rig.inHub(t, "Wren")

	rig.publishLine(t, stampedWorldLine("after the drop"))

	assert.Equal(t, "after the drop", awaitChat(t, wrenInbox, "Wren").Payload["text"])
}

// A line on the world channel that names another chat channel, or no scope, is not delivered:
// the bus carries world lines only. FS-5SH4G §Edge States decoding.
func TestWorldChat_SkipsLinesThatAreNotWorldLines(t *testing.T) {
	rig := newWorldRig(t)
	_, _, wrenInbox := rig.inHub(t, "Wren")

	area := stampedWorldLine("pretending to be area")
	area["channel"] = "area"
	rig.publishLine(t, area)
	noScope := stampedWorldLine("no scope")
	delete(noScope, "scope")
	rig.publishLine(t, noScope)
	rig.publishLine(t, stampedWorldLine("a real one"))

	assert.Equal(t, "a real one", awaitChat(t, wrenInbox, "Wren").Payload["text"])
	assertSilent(t, wrenInbox, "Wren hears only the world line")
}
