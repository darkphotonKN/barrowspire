package gameserver

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/settling"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-QPDKN §Requirements 32–36 (charter addendum 2026-11-03); §Acceptance Criteria "Settling";
// §Edge States "Settling". I-QPDKN-10.
//
// A released escapee (I-QPDKN-9) is marked settling in Redis by the run's pod, and every pod then
// refuses them any entry that checks out their gear (find_game, start_solo, a field, party entry)
// until the run's settlement events are written, because the plunder lands in their bag. The
// mark is one key per player, refreshed while the run lives, on a 90 s TTL.
//
// Two pods share one miniredis: pod A runs the delve and releases Wren (dead_disconnect_test.go's
// rig on real connections), pod B is the village she connects to afterwards (field_world_test.go's
// rig), seating her under the same id.

// settlingCopy is the refusal, word for word. FS-QPDKN R33; §WebSocket message surface.
const settlingCopy = "Your plunder is still being counted. Wait for the delve to end."

// settlingPods is the two pods: A with a live two-delver run, B a village with Wren's character.
type settlingPods struct {
	mini *miniredis.Miniredis
	a    *deadDropParty
	b    *fieldRig
}

func newSettlingPods(t *testing.T, aOpts ...Option) *settlingPods {
	t.Helper()

	client, mini := testutil.NewRedis(t)
	a := deadDropRun(t, append([]Option{WithSettling(settling.NewRedis(client))}, aOpts...)...)
	b := newFieldRig(t, &MockItemsClient{}, WithSettling(settling.NewRedis(client)))
	return &settlingPods{mini: mini, a: a, b: b}
}

// releaseWren has Wren escape on pod A and closes her connection normally: released at once.
func (p *settlingPods) releaseWren(t *testing.T) {
	t.Helper()

	p.a.escapeWrenWithAFind(t)
	p.a.server.handleReadError(p.a.wrenConn, deadDropNormal)
	require.True(t, p.a.run.HasPlayer(p.a.wren.ID), "released with the body kept")
}

func settlingKey(playerID uuid.UUID) string { return "settling:" + playerID.String() }

// settlingKeys are every settling mark in Redis.
func settlingKeys(mini *miniredis.Miniredis) []string {
	var keys []string
	for _, key := range mini.Keys() {
		if strings.HasPrefix(key, "settling:") {
			keys = append(keys, key)
		}
	}
	return keys
}

// wrenAtSpireGateOnB seats Wren, as pod A knew her, at pod B's Spire door.
func (p *settlingPods) wrenAtSpireGateOnB(t *testing.T) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()
	return p.b.seatAtSpireGate(t, &types.Player{ID: p.a.wren.ID, Username: "Wren"})
}

// wrenAtMeadowsGateOnB seats Wren, as pod A knew her, at pod B's Meadows gate.
func (p *settlingPods) wrenAtMeadowsGateOnB(t *testing.T) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()
	wren, conn, inbox := p.b.seatAt(t, &types.Player{ID: p.a.wren.ID, Username: "Wren"}, &websocket.Conn{}, 1960, 360)
	p.b.awaitAtMeadowsGate(t, wren)
	return wren, conn, inbox
}

// assertSettlingRefusal checks the one reply a refused find_game or start_solo gets: an error on
// its own action, the settling words on the error and in the payload.
func assertSettlingRefusal(t *testing.T, inbox *startSoloInbox, action string) {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), action)
	require.True(t, answered, "%s was never answered", action)
	require.Equal(t, action, reply.Action, "refused on %s itself, not with %q", action, reply.Action)
	require.NotNil(t, reply.Error, "%s was let through", action)
	assert.Equal(t, settlingCopy, *reply.Error)
	assert.Equal(t, settlingCopy, reply.Payload["message"], "the same words in the payload")
}

// awaitQueued waits for find_game's answer and requires it to be the queue taking them.
func awaitQueued(t *testing.T, inbox *startSoloInbox, rig *fieldRig, player *types.Player) {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionFindGame))
	require.True(t, answered, "find_game was never answered")
	require.Nil(t, reply.Error, "find_game was refused: %s", startSoloErrorOf(reply))
	assert.True(t, rig.queue.holds(player), "they are queued")
}

// Releasing an escapee writes their mark, naming the run, for 90 s; whichever way they were
// released. FS-QPDKN R29, R32; AC "they are marked settling".
func TestSettling_ReleaseMarksTheEscapee(t *testing.T) {
	for _, released := range escapedReleaseCloses {
		t.Run(released.name, func(t *testing.T) {
			client, mini := testutil.NewRedis(t)
			p := deadDropRun(t, WithSettling(settling.NewRedis(client)))
			p.escapeWrenWithAFind(t)

			released.release(p, t)

			got, err := mini.Get(settlingKey(p.wren.ID))
			require.NoError(t, err, "the released escapee is marked")
			assert.Equal(t, p.run.ID.String(), got, "naming the run")
			assert.Equal(t, settling.TTL, mini.TTL(settlingKey(p.wren.ID)))
			assert.Equal(t, []string{settlingKey(p.wren.ID)}, settlingKeys(mini), "nobody else")
		})
	}
}

// Nobody but a released escapee is ever marked: a dead delver's drop (their leave), a living
// delver whose grace runs out, an escapee back inside their grace. FS-QPDKN R36; AC "neither is
// ever marked settling", "nothing is marked".
func TestSettling_NobodyElseIsMarked(t *testing.T) {
	type drop struct {
		name string
		run  func(p *deadDropParty, t *testing.T)
	}
	var drops []drop
	for _, closed := range deadDropCloses {
		drops = append(drops, drop{"dead, " + closed.name, func(p *deadDropParty, t *testing.T) {
			p.killWren(t)
			p.server.handleReadError(p.wrenConn, closed.err)
		}})
	}
	drops = append(drops,
		drop{"in play, grace run out", func(p *deadDropParty, t *testing.T) {
			p.server.handleReadError(p.wrenConn, deadDropAbnormal)
			p.server.cleanUpPlayerCompletely(p.wren.ID, deadDropHold(t, p.server, p.wren.ID))
		}},
		drop{"escaped, back inside the grace", func(p *deadDropParty, t *testing.T) {
			p.escapeWrenWithAFind(t)
			p.server.handleReadError(p.wrenConn, deadDropAbnormal)
			hold := deadDropHold(t, p.server, p.wren.ID)
			_, reconnected := p.server.connectPlayer(p.wren.ID, "Wren", "token")
			require.True(t, reconnected)
			_, mapped := p.server.MapConnToPlayer(&websocket.Conn{}, p.wren.ID, make(chan interface{}, clientWriterBuffer))
			require.True(t, mapped)
			p.server.cleanUpPlayerCompletely(p.wren.ID, hold)
		}},
	)

	for _, d := range drops {
		t.Run(d.name, func(t *testing.T) {
			client, mini := testutil.NewRedis(t)
			p := deadDropRun(t, WithSettling(settling.NewRedis(client)))

			d.run(p, t)

			assert.Empty(t, settlingKeys(mini), "nobody is marked")
		})
	}
}

// A settling player's find_game and start_solo are refused on another pod, with the settling
// words, and they are neither queued nor seated. FS-QPDKN R33; AC "find_game and start_solo are
// refused", "the check holds on every pod".
func TestSettling_SpireEntry_RefusedOnAnotherPod(t *testing.T) {
	p := newSettlingPods(t)
	p.releaseWren(t)
	wren, conn, inbox := p.wrenAtSpireGateOnB(t)
	worldsBefore := startSoloSessionCount(p.b.server)

	send(p.b.server, conn, constants.ActionFindGame)
	assertSettlingRefusal(t, inbox, string(constants.ActionFindGame))
	assert.Zero(t, p.b.queue.joinCalls(), "the queue was asked to take them")
	assert.False(t, p.b.queue.holds(wren), "they were queued")

	startSoloSend(p.b.server, conn)
	assertSettlingRefusal(t, inbox, startSoloAction)
	assert.Equal(t, worldsBefore, startSoloSessionCount(p.b.server), "a run was built")
	assert.True(t, p.b.hub.HasPlayer(wren.ID), "still standing in the village")
	assert.Equal(t, p.b.hub.ID, startSoloWorldOnRecord(t, p.b.server, wren.ID))
}

// A settling player's field entry is refused on another pod, with reason settling and the same
// words, and they stay in the village. FS-QPDKN R33; AC "their field entry is refused".
func TestSettling_FieldEntry_RefusedOnAnotherPod(t *testing.T) {
	p := newSettlingPods(t)
	p.releaseWren(t)
	wren, conn, inbox := p.wrenAtMeadowsGateOnB(t)

	sendEnterField(p.b.server, conn, meadowsField)

	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterField))
	require.True(t, answered, "enter_field was never answered")
	require.Equal(t, string(constants.ActionEnterField), reply.Action, "refused, not let in")
	require.NotNil(t, reply.Error)
	assert.Equal(t, "settling", reply.Payload["reason"])
	assert.Equal(t, settlingCopy, reply.Payload["message"])
	assert.Equal(t, settlingCopy, *reply.Error)
	assert.True(t, p.b.hub.HasPlayer(wren.ID), "still in the village")
	assert.False(t, p.b.meadows.HasPlayer(wren.ID), "never seated in the field")
}

// settlingProbe is a run-end publish spy that records, as the settlement events are written,
// which settling marks Redis still holds.
type settlingProbe struct {
	*resolvedDropEmitter
	mini *miniredis.Miniredis

	mu        sync.Mutex
	atPublish []string
}

// PublishSettlement: this fake records only the run's end.
func (e *settlingProbe) PublishSettlement(_ context.Context, _ *types.RawSettlement) {}

func (e *settlingProbe) PublishMatchComplete(ctx context.Context, data *types.RawMatchState) {
	e.mu.Lock()
	e.atPublish = settlingKeys(e.mini)
	e.mu.Unlock()
	e.resolvedDropEmitter.PublishMatchComplete(ctx, data)
}

func (e *settlingProbe) marksAtPublish() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.atPublish
}

// The run's end deletes the mark only after its settlement events are written; from then on
// every entry opens again, on any pod. FS-QPDKN R32, R34; AC "When the run ends and its settlement
// events are written, the key is deleted, and the same player's find_game then queues them".
func TestSettling_RunEnd_ClearsAfterSettlement_ThenEntryOpens(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	probe := &settlingProbe{resolvedDropEmitter: &resolvedDropEmitter{}, mini: mini}
	serverA := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), probe, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{},
		WithSettling(settling.NewRedis(client)))
	p := &settlingPods{mini: mini, a: deadDropRunOn(t, serverA, probe.resolvedDropEmitter), b: newFieldRig(t, &MockItemsClient{}, WithSettling(settling.NewRedis(client)))}
	p.releaseWren(t)

	escapedReleaseAssertSettled(t, p.a, p.a.endWithKaelenEscaping(t))

	assert.Equal(t, []string{settlingKey(p.a.wren.ID)}, probe.marksAtPublish(), "the mark stood while the settlement was written")
	require.Eventually(t, func() bool { return len(settlingKeys(mini)) == 0 }, startSoloSettle, 10*time.Millisecond,
		"the run's end deleted the mark")

	wren, conn, inbox := p.wrenAtSpireGateOnB(t)
	send(p.b.server, conn, constants.ActionFindGame)
	awaitQueued(t, inbox, p.b, wren)
}

// The run's pod writes its marks again on every refresh while the run lives, so a run longer
// than the TTL keeps its escapees settling. FS-QPDKN R32; AC "The run's pod refreshes the key while
// the run lives".
func TestSettling_RefreshedWhileTheRunLives(t *testing.T) {
	ticks := make(chan time.Time)
	p := newSettlingPods(t, withSettlingTicks(ticks))
	p.releaseWren(t)
	key := settlingKey(p.a.wren.ID)

	p.mini.FastForward(60 * time.Second)
	ticks <- time.Now()
	require.Eventually(t, func() bool { return p.mini.TTL(key) == settling.TTL }, startSoloSettle, 10*time.Millisecond,
		"the refresh wrote the mark again")
	p.mini.FastForward(60 * time.Second)

	assert.True(t, p.mini.Exists(key), "refreshed, the mark outlives its first 90 s")
}

// A mark nobody refreshes (its pod died mid-run) lapses after 90 s, and entry opens. FS-QPDKN R32;
// AC "If that pod dies, the key lapses within its TTL (90 s) and entry opens"; §Edge States "The
// run's pod dies mid-run".
func TestSettling_WithoutARefresh_LapsesAndEntryOpens(t *testing.T) {
	p := newSettlingPods(t, withSettlingTicks(make(chan time.Time)))
	p.releaseWren(t)

	p.mini.FastForward(settling.TTL)

	assert.Empty(t, settlingKeys(p.mini), "the mark lapsed")
	wren, conn, inbox := p.wrenAtSpireGateOnB(t)
	send(p.b.server, conn, constants.ActionFindGame)
	awaitQueued(t, inbox, p.b, wren)
}

// unreachableMarks is a settling store whose Redis cannot be reached.
type unreachableMarks struct{}

var errMarksUnreachable = errors.New("redis: connection refused")

func (unreachableMarks) Mark(context.Context, uuid.UUID, ...uuid.UUID) error {
	return errMarksUnreachable
}
func (unreachableMarks) Clear(context.Context, ...uuid.UUID) error { return errMarksUnreachable }
func (unreachableMarks) Settling(context.Context, ...uuid.UUID) (bool, error) {
	return false, errMarksUnreachable
}

// captureWarns sends the default logger to a sink for the test.
func captureWarns(t *testing.T) *lockedLog {
	t.Helper()
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelWarn})))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return sink
}

// An unreadable mark lets every entry through, with a Warn: refusing while Redis is down would
// block everyone. FS-QPDKN R35 (confirmed by Nick, "先放行"); AC "If Redis can't be read for the
// check, the entry goes ahead and a Warn is logged".
func TestSettling_UnreadableMark_LetsEntryThroughWithAWarn(t *testing.T) {
	sink := captureWarns(t)
	rig := newFieldRig(t, &MockItemsClient{}, WithSettling(unreachableMarks{}))

	wren, conn, inbox := rig.atSpireGate(t, "Wren")
	send(rig.server, conn, constants.ActionFindGame)
	awaitQueued(t, inbox, rig, wren)

	kaelen, kaelenConn, kaelenInbox := rig.atMeadowsGate(t, "Kaelen")
	rig.enterMeadows(t, kaelen, kaelenConn, kaelenInbox)

	assert.Contains(t, sink.String(), "settling mark unreadable", "the failure is logged")
	assert.Contains(t, sink.String(), "level=WARN")
}

// stalledMarks is a settling store whose Redis answers no read: each one waits out its context.
type stalledMarks struct{ unreachableMarks }

func (stalledMarks) Settling(ctx context.Context, _ ...uuid.UUID) (bool, error) {
	<-ctx.Done()
	return false, ctx.Err()
}

// deadlineItemsClient answers a loadout read as gRPC does: not at all once its context has ended.
type deadlineItemsClient struct{ MockItemsClient }

func (c *deadlineItemsClient) GetLoadoutWithItems(ctx context.Context, req *itemspb.GetLoadoutWithItemsRequest) (*itemspb.GetLoadoutWithItemsResponse, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return c.MockItemsClient.GetLoadoutWithItems(ctx, req)
}

// CheckOutRunGear answers a checkout the same way.
func (c *deadlineItemsClient) CheckOutRunGear(ctx context.Context, req *itemspb.CheckOutRunGearRequest) (*itemspb.CheckOutRunGearResponse, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return c.MockItemsClient.CheckOutRunGear(ctx, req)
}

// A mark read that stalls until it times out is an unreadable mark, and lets the Spire entry
// through with a Warn: the gear read after it gets its own time, so the stall is not turned into a
// "gear unreadable" refusal. FS-QPDKN R35.
func TestSettling_StalledMarkRead_LetsSpireEntryThroughWithAWarn(t *testing.T) {
	sink := captureWarns(t)
	rig := newFieldRig(t, &deadlineItemsClient{}, WithSettling(stalledMarks{}))

	wren, conn, inbox := rig.atSpireGate(t, "Wren")
	send(rig.server, conn, constants.ActionFindGame)

	// the stalled read takes its whole bound before the gear is read
	var reply types.Message
	answered := false
	for range 3 {
		if reply, answered = inbox.await(string(constants.ActionWorldEntered), string(constants.ActionFindGame)); answered {
			break
		}
	}
	require.True(t, answered, "find_game was never answered")
	require.Nil(t, reply.Error, "find_game was refused: %s", startSoloErrorOf(reply))
	assert.True(t, rig.queue.holds(wren), "they are queued")

	assert.Contains(t, sink.String(), "settling mark unreadable", "the stall is logged")
	assert.NotContains(t, sink.String(), "gear unreadable", "the gear read was given its own time")
}

// A mark read that stalls until it times out lets the field entry through with a Warn, the same
// way: the gear checkout after it gets its own time, so the stall is not turned into a
// loadout_unavailable refusal. FS-QPDKN R35.
func TestSettling_StalledMarkRead_LetsFieldEntryThroughWithAWarn(t *testing.T) {
	sink := captureWarns(t)
	rig := newFieldRig(t, &deadlineItemsClient{}, WithSettling(stalledMarks{}))

	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
	rig.awaitAtMeadowsGate(t, wren)
	sendEnterField(rig.server, conn, meadowsField)

	// the stalled read takes its whole bound before the gear is checked out
	var reply types.Message
	answered := false
	for range 3 {
		if reply, answered = inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterField)); answered {
			break
		}
	}
	require.True(t, answered, "enter_field was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
		"enter_field was refused: %s", startSoloErrorOf(reply))
	assert.True(t, rig.meadows.HasPlayer(wren.ID), "seated in the field")

	assert.Equal(t, 1, strings.Count(sink.String(), "settling mark unreadable"), "the stall is logged once")
	assert.NotContains(t, sink.String(), "Refusing enter_field", "the checkout was given its own time")
}

// A mark that cannot be written is logged at Warn and blocks nothing: the escapee is released as
// ever. FS-QPDKN §Edge States "The key write fails when the escapee is released".
func TestSettling_UnwritableMark_ReleasesWithAWarn(t *testing.T) {
	sink := captureWarns(t)
	p := deadDropRun(t, WithSettling(unreachableMarks{}))
	p.escapeWrenWithAFind(t)

	p.server.handleReadError(p.wrenConn, deadDropNormal)

	assert.True(t, p.run.HasPlayer(p.wren.ID), "released, the body kept")
	_, onRecord := p.server.PlayerByID(p.wren.ID)
	assert.False(t, onRecord, "and off record")
	assert.Contains(t, sink.String(), "settling mark not written")
	escapedReleaseAssertSettled(t, p, p.endWithKaelenEscaping(t))
}

// A release that loses the race with its run's end marks nobody: the run is gone, so no end will
// ever delete the mark. FS-QPDKN §Edge States "The run ends in the same moment as a release":
// ended first, no mark.
func TestSettling_ReleaseAfterTheRunEnded_MarksNobody(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	server := bootedServer(t, WithSettling(settling.NewRedis(client)))

	server.settling.mark(context.Background(), uuid.New(), uuid.New())

	assert.Empty(t, settlingKeys(mini))
}

// A pre-formed party whose member (or leader) is settling is refused its instance entry, with
// party_notice settling to the one who pressed, and no ready check opens. Once the mark is gone,
// the same press opens the check. FS-QPDKN R33, R34; FS-BJNYC; AC "While any member of a pre-formed
// party is settling, that party's instance entry is refused".
func TestSettling_PartyEntry_RefusedWhileAnyMemberSettles(t *testing.T) {
	for _, who := range []string{"a member", "the leader"} {
		t.Run(who, func(t *testing.T) {
			// another pod's run marked them, in the Redis every pod reads
			marksClient, _ := testutil.NewRedis(t)
			otherPod := settling.NewRedis(marksClient)
			rig := newPartyEntryRig(t, &MockItemsClient{}, WithSettling(settling.NewRedis(marksClient)))
			wren, kaelen, wrenConn, _, wrenInbox, _ := partyOfTwo(t, rig)
			marked := kaelen.ID
			if who == "the leader" {
				marked = wren.ID
			}
			require.NoError(t, otherPod.Mark(context.Background(), uuid.New(), marked))

			sendEnter(rig.server, wrenConn)
			// refused, so no check opened: the press after the clear opens one rather than being
			// refused checking
			assertNoticeCode(t, wrenInbox, "Wren", string(constants.PartyNoticeSettling))

			require.NoError(t, otherPod.Clear(context.Background(), marked))
			sendEnter(rig.server, wrenConn)
			open := awaitReadyCheck(t, wrenInbox, "Wren")
			assert.Equal(t, "open", open.outcome, "the mark gone, the press opens the check")
		})
	}
}
