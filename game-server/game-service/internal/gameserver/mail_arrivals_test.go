package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/chatbus"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-1GZGD §Requirements R42–R44, §Amendment 2026-11-04 A4; ADR-0045 §Decisions 2–4.
// I-1GZGD-9: every pod relays a mail arrival on Redis `mail:arrived` as `mail_arrived` to its
// players standing in the HUB world, and to nobody in a run or a field.

const mailArrivedAction = "mail_arrived"

// mailRig is a pod on a miniredis with the mail-arrival relay, and the client a test publishes
// through, as notification-service would.
type mailRig struct {
	*chatRig
	redis redis.UniversalClient
}

func newMailRig(t *testing.T) *mailRig {
	t.Helper()
	client, _ := testutil.NewRedis(t)
	return newMailPod(t, client, chatbus.NewRedis(client))
}

func newMailPod(t *testing.T, client redis.UniversalClient, bus mailArrivalBus) *mailRig {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	characters := newFakeCharacters()
	server := newTestServer(t, ctx, &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters, testPodID, testPodAddr, noopAnnouncer{},
		WithMailArrivals(bus),
	)
	hub, ok := server.HubSession()
	require.True(t, ok)
	meadows, ok := server.FieldSession(game.FieldGentleMeadows)
	require.True(t, ok)

	return &mailRig{
		chatRig: &chatRig{server: server, hub: hub, meadows: meadows, characters: characters},
		redis:   client,
	}
}

// publish puts raw on `mail:arrived`, retrying until the pod is listening: go-redis subscribes
// asynchronously, and a publish before that (or between a drop and the next subscribe) lands on
// nobody.
func (r *mailRig) publish(t *testing.T, raw string) {
	t.Helper()
	require.Eventually(t, func() bool {
		n, err := r.redis.Publish(context.Background(), mailArrivedChannel, raw).Result()
		return err == nil && n >= 1
	}, startSoloSettle, 10*time.Millisecond, "nobody subscribed to %s", mailArrivedChannel)
}

func (r *mailRig) publishMember(t *testing.T, memberID uuid.UUID) {
	t.Helper()
	r.publish(t, `{"member_id":"`+memberID.String()+`"}`)
}

// awaitMailArrived waits for one mail_arrived on the inbox, dropping anything else.
func awaitMailArrived(t *testing.T, inbox *startSoloInbox, who string) types.Message {
	t.Helper()
	msg, ok := inbox.await(mailArrivedAction)
	require.True(t, ok, "%s never received mail_arrived", who)
	return msg
}

// assertNoMailArrived fails if a mail_arrived reaches the inbox within chatSilence.
func assertNoMailArrived(t *testing.T, inbox *startSoloInbox, who string) {
	t.Helper()
	deadline := time.After(chatSilence)
	for {
		select {
		case msg := <-inbox.messages:
			if msg.Action == mailArrivedAction {
				t.Fatalf("%s should get no mail_arrived; got %v", who, msg.Payload)
			}
		case <-deadline:
			return
		}
	}
}

// A member id for a player standing in the HUB world on this pod reaches them once, in the
// game envelope with an empty payload. R43, A4.
func TestMailArrivals_MemberInTheHub_GetsOneMailArrived(t *testing.T) {
	rig := newMailRig(t)
	wren, _, wrenInbox := rig.inHub(t, "Wren")

	rig.publishMember(t, wren.ID)

	got := awaitMailArrived(t, wrenInbox, "Wren")
	raw, err := json.Marshal(got)
	require.NoError(t, err)
	assert.JSONEq(t, `{"action":"mail_arrived","payload":{}}`, string(raw))
	assertNoMailArrived(t, wrenInbox, "Wren a second time")
}

// A member id for a player in a run, in a field, connected in no world, or not on this pod
// reaches nobody; the relay carries on and the next arrival for a hub player is delivered.
// R43; §Edge States "Player on another pod, or in a run".
func TestMailArrivals_MemberNotInTheHubHere_GetsNothing(t *testing.T) {
	cases := []struct {
		name  string
		place func(r *mailRig, t *testing.T) (uuid.UUID, *startSoloInbox)
	}{
		{"in a run", func(r *mailRig, t *testing.T) (uuid.UUID, *startSoloInbox) {
			p, _, in := r.inRun(t, "Idris")
			return p.ID, in
		}},
		{"in a field", func(r *mailRig, t *testing.T) (uuid.UUID, *startSoloInbox) {
			p, _, in := r.inMeadows(t, "Kaelen")
			return p.ID, in
		}},
		{"in no world", func(r *mailRig, t *testing.T) (uuid.UUID, *startSoloInbox) {
			p, _, in := r.connected(t, "Ash")
			return p.ID, in
		}},
		{"on another pod", func(r *mailRig, t *testing.T) (uuid.UUID, *startSoloInbox) {
			return uuid.New(), nil
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rig := newMailRig(t)
			wren, _, wrenInbox := rig.inHub(t, "Wren")
			target, targetInbox := tc.place(rig, t)

			rig.publishMember(t, target)
			// arrivals are relayed in order: once Wren's is in, the one before it was handled
			rig.publishMember(t, wren.ID)

			awaitMailArrived(t, wrenInbox, "Wren (after)")
			assertNoMailArrived(t, wrenInbox, "Wren gets only her own")
			if targetInbox != nil {
				assertNoMailArrived(t, targetInbox, tc.name)
			}
		})
	}
}

// A broadcast reaches every player in the HUB world on this pod once, and nobody in a run, a
// field or no world. R43; §Edge States "Broadcast with many players in the town".
func TestMailArrivals_Broadcast_ReachesEveryHubPlayerOnly(t *testing.T) {
	rig := newMailRig(t)
	_, _, wrenInbox := rig.inHub(t, "Wren")
	_, _, marlInbox := rig.inHub(t, "Marl")
	_, _, idrisInbox := rig.inRun(t, "Idris")
	_, _, kaelenInbox := rig.inMeadows(t, "Kaelen")
	_, _, ashInbox := rig.connected(t, "Ash")

	rig.publish(t, `{"broadcast":true}`)

	for who, inbox := range map[string]*startSoloInbox{"Wren (hub)": wrenInbox, "Marl (hub)": marlInbox} {
		awaitMailArrived(t, inbox, who)
		assertNoMailArrived(t, inbox, who+" a second time")
	}
	for who, inbox := range map[string]*startSoloInbox{"Idris (run)": idrisInbox, "Kaelen (Meadows)": kaelenInbox, "Ash (no world)": ashInbox} {
		assertNoMailArrived(t, inbox, who)
	}
}

// A message that is neither form is skipped with a warning, and the next good one is still
// delivered. R42; ADR-0045 "A pod skips any other payload".
func TestMailArrivals_SkipsWhatIsNotAMailArrival(t *testing.T) {
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })

	rig := newMailRig(t)
	wren, _, wrenInbox := rig.inHub(t, "Wren")

	malformed := []string{
		`{not json`,
		`null`,
		`[]`,
		`"broadcast"`,
		`{}`,
		`{"broadcast":false}`,
		`{"broadcast":"true"}`,
		`{"member_id":"not-a-uuid"}`,
		`{"member_id":"00000000-0000-0000-0000-000000000000"}`,
		`{"member_id":42}`,
		`{"member_id":"` + wren.ID.String() + `","broadcast":true}`,
	}
	for _, raw := range malformed {
		rig.publish(t, raw)
	}
	rig.publishMember(t, wren.ID)

	awaitMailArrived(t, wrenInbox, "Wren")
	assertNoMailArrived(t, wrenInbox, "Wren: only the good one is delivered")
	assert.Equal(t, len(malformed), strings.Count(sink.String(), "mail arrival skipped"), "each malformed message is warned once")
}

// The decoder takes exactly the two forms ADR-0045 fixes, by their exact keys, and skips every
// other payload: a key present as null, a key spelt in another case, both keys, or neither. Other
// keys beside one form are ignored. R42; ADR-0045 "A pod skips any other payload".
func TestDecodeMailArrival(t *testing.T) {
	member := uuid.New()
	id := member.String()
	accepted := []struct {
		raw  string
		want mailArrival
	}{
		{`{"member_id":"` + id + `"}`, mailArrival{memberID: member}},
		{`{"member_id":"` + id + `","sent_at":"2026-11-04"}`, mailArrival{memberID: member}},
		{`{"broadcast":true}`, mailArrival{broadcast: true}},
		{`{"broadcast":true,"note":null}`, mailArrival{broadcast: true}},
	}
	for _, tc := range accepted {
		t.Run("accepts "+tc.raw, func(t *testing.T) {
			got, err := decodeMailArrival([]byte(tc.raw))
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}

	refused := []string{
		`{not json`,
		`null`,
		`[]`,
		`"broadcast"`,
		`{}`,
		`{"broadcast":false}`,
		`{"broadcast":"true"}`,
		`{"broadcast":null}`,
		`{"member_id":null}`,
		`{"member_id":"not-a-uuid"}`,
		`{"member_id":"00000000-0000-0000-0000-000000000000"}`,
		`{"member_id":42}`,
		`{"member_id":"` + id + `","broadcast":true}`,
		`{"member_id":null,"broadcast":true}`,
		`{"member_id":"` + id + `","broadcast":null}`,
		`{"Broadcast":true}`,
		`{"BROADCAST":true}`,
		`{"Member_ID":"` + id + `"}`,
		`{"MEMBER_ID":"` + id + `"}`,
	}
	for _, raw := range refused {
		t.Run("refuses "+raw, func(t *testing.T) {
			_, err := decodeMailArrival([]byte(raw))
			assert.Error(t, err)
		})
	}
}

// memberListMax is the most member ids one admin send may name (FS-1GZGD A6): it publishes one
// `{"member_id"}` per recipient in one pipelined burst, and that burst reaches every pod.
const memberListMax = 1000

// handedCountBus counts the messages its subscriptions have handed on to the relay.
type handedCountBus struct {
	mailArrivalBus
	handed atomic.Int64
}

func (b *handedCountBus) Listen(ctx context.Context, channel string, onMessage func([]byte)) error {
	return b.mailArrivalBus.Listen(ctx, channel, func(payload []byte) {
		onMessage(payload)
		b.handed.Add(1)
	})
}

// A member-list send's burst lands while the hub's loop is busy: the one member of it standing
// in this pod's hub still gets their mail_arrived, however many arrivals for other pods' players
// came first. A6, R43, R50.
func TestMailArrivals_AMemberListBurst_StillReachesTheMemberHere(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	bus := &handedCountBus{mailArrivalBus: chatbus.NewRedis(client)}
	rig := newMailPod(t, client, bus)
	wren, _, wrenInbox := rig.inHub(t, "Wren")

	// publish retries until the pod listens; the warm-up is for nobody here
	rig.publishMember(t, uuid.New())
	require.Eventually(t, func() bool { return bus.handed.Load() == 1 }, startSoloSettle, 10*time.Millisecond)

	// the hub's loop stalls, as behind other work, until the whole burst is off the bus
	rig.server.mu.Lock()
	stalled := true
	resume := func() {
		if stalled {
			stalled = false
			rig.server.mu.Unlock()
		}
	}
	t.Cleanup(resume)

	ctx := context.Background()
	burst := rig.redis.Pipeline()
	for range memberListMax - 1 {
		burst.Publish(ctx, mailArrivedChannel, `{"member_id":"`+uuid.New().String()+`"}`)
	}
	burst.Publish(ctx, mailArrivedChannel, `{"member_id":"`+wren.ID.String()+`"}`)
	_, err := burst.Exec(ctx)
	require.NoError(t, err)
	require.Eventually(t, func() bool { return bus.handed.Load() == 1+memberListMax }, startSoloSettle, 10*time.Millisecond, "the burst never came off the bus")

	resume()
	awaitMailArrived(t, wrenInbox, "Wren, last of the burst")
}

// hubTown is a pod's HUB world as the relay reads it, counting how often the whole of it is listed.
type hubTown struct {
	conns  map[uuid.UUID]*websocket.Conn
	listed atomic.Int64
}

func (h *hubTown) TownConns() map[uuid.UUID]*websocket.Conn {
	h.listed.Add(1)
	out := make(map[uuid.UUID]*websocket.Conn, len(h.conns))
	for id, conn := range h.conns {
		out[id] = conn
	}
	return out
}

func (h *hubTown) TownConn(playerID uuid.UUID) (*websocket.Conn, bool) {
	conn, here := h.conns[playerID]
	return conn, here
}

// sentConns records which connections mail_arrived was sent on.
type sentConns struct {
	mu   sync.Mutex
	sent []*websocket.Conn
}

func (s *sentConns) SendMessageToConn(conn *websocket.Conn, _ types.Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sent = append(s.sent, conn)
	return nil
}

// An arrival for one member looks that member up; only a broadcast lists the whole town. A
// member-list burst is up to a thousand arrivals, nearly all for other pods' players. R43, A6.
func TestMailArrivals_MemberArrival_LooksUpOnlyThatMember(t *testing.T) {
	wren, marl := uuid.New(), uuid.New()
	wrenConn, marlConn := &websocket.Conn{}, &websocket.Conn{}
	town := &hubTown{conns: map[uuid.UUID]*websocket.Conn{wren: wrenConn, marl: marlConn}}
	sender := &sentConns{}
	relay := newMailArrivals(nil, town, sender)

	relay.deliver(mailArrival{memberID: uuid.New()})
	relay.deliver(mailArrival{memberID: wren})

	assert.Equal(t, []*websocket.Conn{wrenConn}, sender.sent)
	assert.Zero(t, town.listed.Load(), "a member arrival lists the whole town")

	relay.deliver(mailArrival{broadcast: true})
	assert.ElementsMatch(t, []*websocket.Conn{wrenConn, wrenConn, marlConn}, sender.sent)
	assert.Equal(t, int64(1), town.listed.Load())
}

// A hub built with no relay, or a typed-nil one, waits on no arrivals; a typed-nil relay delivers
// nothing and does not panic.
func TestMessageHub_WithoutAMailRelay_WaitsOnNoArrivals(t *testing.T) {
	var typedNil *mailArrivals
	for name, relay := range map[string]mailArrivalRelayer{"no relay": nil, "typed-nil relay": typedNil} {
		t.Run(name, func(t *testing.T) {
			hub := NewMessageHub(nil, nil, testPodID, testPodAddr, noopAnnouncer{}, nil, nil, nil, newLoopJobs(), relay)
			assert.Nil(t, hub.mailInbound())
		})
	}
	assert.NotPanics(t, func() { typedNil.deliver(mailArrival{broadcast: true}) })
}

// dropAfterOneBus delivers one message on its first subscription and then drops it, as a Redis
// connection lost mid-life would; later subscriptions pass straight through. listens counts the
// subscriptions asked for, so a test can wait for the one after the drop.
type dropAfterOneBus struct {
	mailArrivalBus
	dropped atomic.Bool
	listens atomic.Int64
}

func (b *dropAfterOneBus) Listen(ctx context.Context, channel string, onMessage func([]byte)) error {
	b.listens.Add(1)
	if b.dropped.Load() {
		return b.mailArrivalBus.Listen(ctx, channel, onMessage)
	}
	sub, cancel := context.WithCancel(ctx)
	defer cancel()
	_ = b.mailArrivalBus.Listen(sub, channel, func(payload []byte) {
		onMessage(payload)
		b.dropped.Store(true)
		cancel()
	})
	return errors.New("redis: subscription closed")
}

// After the subscription drops, the relay subscribes again and delivers later arrivals. R42.
func TestMailArrivals_SubscribesAgainAfterADrop(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	bus := &dropAfterOneBus{mailArrivalBus: chatbus.NewRedis(client)}
	rig := newMailPod(t, client, bus)
	wren, _, wrenInbox := rig.inHub(t, "Wren")

	rig.publishMember(t, wren.ID)
	awaitMailArrived(t, wrenInbox, "Wren before the drop")
	// wait for the relay to ask again: before that, a publish can be counted by the dying
	// subscription and lost with it
	require.Eventually(t, func() bool { return bus.listens.Load() >= 2 }, startSoloSettle, 10*time.Millisecond, "the relay never subscribed again")

	// publish retries until the fresh subscription is listening
	rig.publishMember(t, wren.ID)
	awaitMailArrived(t, wrenInbox, "Wren after the drop")
}

// A full queue drops the arrival instead of blocking the subscriber: at most once. R42; ADR-0045
// "A push can be lost (... a full queue ...)".
// The drop is logged at Debug, as chat and the pod inbox log theirs: a member-list burst behind a
// busy loop must not write a warning per arrival.
func TestMailArrivals_FullQueueDropsInsteadOfBlocking(t *testing.T) {
	sink := captureLogs(t)
	relay := newMailArrivals(nil, nil, nil)
	raw := []byte(`{"broadcast":true}`)

	done := make(chan struct{})
	go func() {
		for range mailArrivalBuffer + 5 {
			relay.arrived(raw)
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("the subscriber blocked on a full queue")
	}
	assert.Len(t, relay.inbound(), mailArrivalBuffer, "the queue holds its buffer and drops the rest")
	assert.Equal(t, 5, strings.Count(sink.String(), "mail arrival dropped"), "each drop is logged")
	assert.Empty(t, warnLinesWith(sink, "mail arrival dropped"), "a drop is logged at Debug, not Warn")
}
