package gameserver

import (
	"context"
	"sync"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-QPDKN §Requirements 18–20, §Edge States "Disconnects" (I-QPDKN-5).
//
// A resolved member of a run (dead, escaped, left behind) whose connection
// drops past its reconnect grace keeps their body and their record until the
// run ends, so the run settles them exactly as if they had stayed. A member
// still in play, and a member in the hub, are removed at grace end as today.
//
// The run's end is driven through its real path. NewSession starts a world's
// loop as it is built, so a run here ticks from CreateGameSession on: once a
// test has resolved every delver, the next tick's RulesSystem signals the end
// and endSession runs (snapshot, progress, ReturnPlayersToHub, CloseSession,
// Shutdown, PublishMatchComplete). The tests wait for the publish.
//
// Resolving a delver is a component write, made from the test as the escape
// door and the combat tick make it. As with every entity read in this
// package's tests, it is made beside a live loop: the tests reach it well
// inside the first tick.

// resolvedDropEmitter records every run-end publish, under a lock, because the
// publish happens on the run's own goroutine.
type resolvedDropEmitter struct {
	mu        sync.Mutex
	published []*types.RawMatchState
}

func (e *resolvedDropEmitter) PublishMatchComplete(_ context.Context, data *types.RawMatchState) {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.published = append(e.published, data)
}

// snapshots is a copy of what has been published so far.
func (e *resolvedDropEmitter) snapshots() []*types.RawMatchState {
	e.mu.Lock()
	defer e.mu.Unlock()

	return append([]*types.RawMatchState(nil), e.published...)
}

// resolvedDropServer is a server whose run-end publishes are spied on.
func resolvedDropServer(t *testing.T) (*Server, *resolvedDropEmitter) {
	t.Helper()

	emitter := &resolvedDropEmitter{}
	server := NewServer(context.Background(), &MockAuthClient{}, NewMockQueueService(), emitter, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})

	return server, emitter
}

// resolvedDropParty is a two-delver run and the connections it was entered on.
type resolvedDropParty struct {
	run        *game.Session
	wren       *types.Player
	wrenConn   *websocket.Conn
	kaelen     *types.Player
	kaelenConn *websocket.Conn
}

// resolvedDropRun seats Wren and Kaelen in a run from the hub. The run is
// live from here, as every run is: its loop ticks until it ends or the test
// ends.
func resolvedDropRun(t *testing.T, server *Server) resolvedDropParty {
	t.Helper()

	wren, wrenConn := enterHub(t, server, "Wren")
	kaelen, kaelenConn := enterHub(t, server, "Kaelen")

	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})
	require.True(t, run.HasPlayer(wren.ID))
	require.True(t, run.HasPlayer(kaelen.ID))

	// a run the test leaves unended stops with the test; Shutdown is idempotent
	t.Cleanup(run.Shutdown)

	return resolvedDropParty{run: run, wren: wren, wrenConn: wrenConn, kaelen: kaelen, kaelenConn: kaelenConn}
}

// resolvedDropBodyOf finds the member's body in a world.
func resolvedDropBodyOf(t *testing.T, world *game.Session, memberID uuid.UUID) *ecs.Entity {
	t.Helper()

	for _, entity := range world.EntityManager.GetAllEntities() {
		pc, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)
		if isPlayer && pc.(*components.PlayerComponent).MemberID == memberID {
			return entity
		}
	}

	require.FailNow(t, "the member has no body in the world", "member %s", memberID)
	return nil
}

// resolvedDropEscape resolves the member's body as escaped, what the escape
// door does (handlePlayerEscape).
func resolvedDropEscape(t *testing.T, run *game.Session, memberID uuid.UUID) {
	t.Helper()

	body := resolvedDropBodyOf(t, run, memberID)
	pc, _ := body.GetComponent(ecs.ComponentTypePlayer)
	pc.(*components.PlayerComponent).Escape = true

	require.False(t, systems.InPlay(body), "an escaped delver is out of play")
}

// resolvedDropKill resolves the member's body as dead: health at zero, which
// takes them out of play at once. The elimination itself is recorded by the
// EliminationSystem on the next tick, as a kill in combat would be on the tick
// that landed it, so the run's end sees them in its elimination order.
func resolvedDropKill(t *testing.T, run *game.Session, memberID uuid.UUID) {
	t.Helper()

	body := resolvedDropBodyOf(t, run, memberID)
	hc, hasHealth := body.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, hasHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0

	require.False(t, systems.InPlay(body), "a dead delver is out of play")
}

// resolvedDropPastGrace drops the member's connection and lets the reconnect
// grace of that drop run out at once: the hold is taken as the read error
// would take it, and the timer's cleanup is called with that hold.
func resolvedDropPastGrace(t *testing.T, server *Server, conn *websocket.Conn) {
	t.Helper()

	player, hold, held := server.holdForReconnect(conn)
	require.True(t, held, "the connection carried a member")

	server.cleanUpPlayerCompletely(player.ID, hold)
}

// resolvedDropEndRun waits for the run to end through its real path: with
// nobody left in play, the next tick's RulesSystem signals the end. Returns
// the run-end snapshot once it has been published.
func resolvedDropEndRun(t *testing.T, run *game.Session, emitter *resolvedDropEmitter) *types.RawMatchState {
	t.Helper()

	require.False(t, run.Ended(), "the run was shut down before it could end and settle anyone")

	before := len(emitter.snapshots())

	eventually(t, "the run ends and publishes its result", func() bool {
		return len(emitter.snapshots()) > before
	})

	return emitter.snapshots()[before]
}

// resolvedDropPlayerIn is the snapshot's entry for a member.
func resolvedDropPlayerIn(snapshot *types.RawMatchState, memberID uuid.UUID) (types.RawPlayerState, bool) {
	for _, player := range snapshot.Players {
		if player.MemberID == memberID.String() {
			return player, true
		}
	}

	return types.RawPlayerState{}, false
}

// resolvedDropWorldEntered is the world_entered message on a writer channel,
// if any. The channel is drained, so it must be closed or no longer written to.
func resolvedDropWorldEntered(t *testing.T, msgChan chan interface{}) (types.Message, bool) {
	t.Helper()

	for {
		select {
		case raw := <-msgChan:
			msg, ok := raw.(types.Message)
			if ok && msg.Action == string(constants.ActionWorldEntered) {
				return msg, true
			}
		default:
			return types.Message{}, false
		}
	}
}

// A resolved member whose grace runs out stays in the run: body and record
// both, with the record still naming the run. The connection is already gone,
// so they receive nothing until they reconnect. FS-QPDKN §Requirements 18–19.
func TestGraceEnd_KeepsResolvedRunMember(t *testing.T) {
	t.Run("escaped", func(t *testing.T) {
		server, _ := resolvedDropServer(t)
		party := resolvedDropRun(t, server)

		resolvedDropEscape(t, party.run, party.wren.ID)
		resolvedDropPastGrace(t, server, party.wrenConn)

		assert.True(t, party.run.HasPlayer(party.wren.ID), "an escaped member's body is kept in the run past the grace")
		record, onRecord := server.PlayerByID(party.wren.ID)
		require.True(t, onRecord, "an escaped member's record is kept past the grace")
		assert.Equal(t, party.run.ID, record.CurrentGameSessionId, "and still names the run")
		assert.Equal(t, constants.Reconnecting, connStateOf(t, server, party.wren.ID))

		_, mapped := server.GetPlayerFromConn(party.wrenConn)
		assert.False(t, mapped, "the dropped connection is unmapped")
		assert.True(t, party.run.HasPlayer(party.kaelen.ID), "the delver still in play is untouched")
		assert.False(t, party.run.Ended(), "the run goes on while someone is in play")
	})

	t.Run("dead", func(t *testing.T) {
		server, _ := resolvedDropServer(t)
		party := resolvedDropRun(t, server)

		resolvedDropKill(t, party.run, party.wren.ID)
		resolvedDropPastGrace(t, server, party.wrenConn)

		assert.True(t, party.run.HasPlayer(party.wren.ID), "a dead member's body is kept in the run past the grace")
		record, onRecord := server.PlayerByID(party.wren.ID)
		require.True(t, onRecord, "a dead member's record is kept past the grace")
		assert.Equal(t, party.run.ID, record.CurrentGameSessionId, "and still names the run")
		assert.False(t, party.run.Ended())
	})
}

// A member still in play whose grace runs out is removed from the run, as
// today. FS-QPDKN §Requirements 20. Pins today's behavior.
func TestGraceEnd_RemovesInPlayMember(t *testing.T) {
	server, emitter := resolvedDropServer(t)
	party := resolvedDropRun(t, server)

	require.True(t, systems.InPlay(resolvedDropBodyOf(t, party.run, party.wren.ID)))
	resolvedDropPastGrace(t, server, party.wrenConn)

	assert.False(t, party.run.HasPlayer(party.wren.ID), "a member in play is removed from the run at grace end")
	_, onRecord := server.PlayerByID(party.wren.ID)
	assert.False(t, onRecord, "and taken off record")

	assert.True(t, party.run.HasPlayer(party.kaelen.ID), "the other delver is still in the run")
	assert.False(t, party.run.Ended(), "which goes on")
	assert.Empty(t, emitter.snapshots(), "and has not settled")
}

// A member in the hub whose grace runs out is removed from the hub, as today.
// Pins today's behavior.
func TestGraceEnd_RemovesHubMember(t *testing.T) {
	server, _ := resolvedDropServer(t)
	hub, _ := server.HubSession()

	wren, wrenConn := enterHub(t, server, "Wren")
	require.True(t, hub.HasPlayer(wren.ID))

	resolvedDropPastGrace(t, server, wrenConn)

	assert.False(t, hub.HasPlayer(wren.ID), "a hub member is removed from the hub at grace end")
	_, onRecord := server.PlayerByID(wren.ID)
	assert.False(t, onRecord, "and taken off record")
}

// The run settles a kept member exactly as if they had stayed, and their
// record does not outlive the run. FS-QPDKN §Requirements 18–19.
func TestRunEnd_SettlesKeptMemberAndDeletesRecord(t *testing.T) {
	t.Run("escaped member is in the snapshot as escaped", func(t *testing.T) {
		server, emitter := resolvedDropServer(t)
		hub, _ := server.HubSession()
		party := resolvedDropRun(t, server)

		resolvedDropEscape(t, party.run, party.wren.ID)
		resolvedDropPastGrace(t, server, party.wrenConn)

		// the last delver in play escapes too, and the next tick ends the run
		resolvedDropEscape(t, party.run, party.kaelen.ID)
		snapshot := resolvedDropEndRun(t, party.run, emitter)

		wrenState, inSnapshot := resolvedDropPlayerIn(snapshot, party.wren.ID)
		require.True(t, inSnapshot, "the kept member is in the run-end snapshot")
		assert.True(t, wrenState.Escape, "as escaped, so their plunder is extracted")
		_, kaelenInSnapshot := resolvedDropPlayerIn(snapshot, party.kaelen.ID)
		assert.True(t, kaelenInSnapshot)

		_, onRecord := server.PlayerByID(party.wren.ID)
		assert.False(t, onRecord, "a kept record whose member never came back does not outlive the run")
		assert.Zero(t, entityCountFor(hub.EntityManager.GetAllEntities(), party.wren.ID),
			"and no body is left standing in the hub for a member who is not on record")

		assert.True(t, hub.HasPlayer(party.kaelen.ID), "the connected delver came home")
		assert.Equal(t, hub.ID, recordOf(t, server, party.kaelen.ID).CurrentGameSessionId)
		assert.True(t, party.run.Ended())
		assert.Len(t, emitter.snapshots(), 1, "the run settled once")
	})

	t.Run("dead member is in match.ended with their elimination position", func(t *testing.T) {
		server, emitter := resolvedDropServer(t)
		party := resolvedDropRun(t, server)

		resolvedDropKill(t, party.run, party.wren.ID)
		resolvedDropPastGrace(t, server, party.wrenConn)

		resolvedDropEscape(t, party.run, party.kaelen.ID)
		snapshot := resolvedDropEndRun(t, party.run, emitter)

		_, inSnapshot := resolvedDropPlayerIn(snapshot, party.wren.ID)
		assert.True(t, inSnapshot, "the kept dead member is in the run-end snapshot")
		position, eliminated := snapshot.EliminationOrder[party.wren.ID]
		require.True(t, eliminated, "the kept dead member is in the elimination order")
		assert.Equal(t, 0, position, "as the first to fall")
		_, kaelenEliminated := snapshot.EliminationOrder[party.kaelen.ID]
		assert.False(t, kaelenEliminated, "the escaped delver is not")

		_, onRecord := server.PlayerByID(party.wren.ID)
		assert.False(t, onRecord, "their record is gone after the run ends")
	})
}

// The last delver in play dropping past the grace ends the run, once, and the
// kept resolved members are settled by it. FS-QPDKN §Requirements 18–20.
func TestGraceEnd_LastInPlayMemberEndsTheRunAndSettlesTheKept(t *testing.T) {
	server, emitter := resolvedDropServer(t)
	party := resolvedDropRun(t, server)

	resolvedDropEscape(t, party.run, party.wren.ID)
	resolvedDropPastGrace(t, server, party.wrenConn)

	// the run is live, ticking, while the last delver in play drops
	require.False(t, party.run.Ended())

	resolvedDropPastGrace(t, server, party.kaelenConn)

	eventually(t, "the run ends and settles once the last delver in play is removed", func() bool {
		return len(emitter.snapshots()) == 1
	})
	assert.True(t, party.run.Ended())

	snapshot := emitter.snapshots()[0]
	wrenState, inSnapshot := resolvedDropPlayerIn(snapshot, party.wren.ID)
	require.True(t, inSnapshot, "the kept escaped member is settled by the end")
	assert.True(t, wrenState.Escape)
	_, kaelenInSnapshot := resolvedDropPlayerIn(snapshot, party.kaelen.ID)
	assert.False(t, kaelenInSnapshot, "the delver removed in play was not in the world to settle")

	_, onRecord := server.PlayerByID(party.wren.ID)
	assert.False(t, onRecord, "the kept record is gone after the run ends")
	_, kaelenOnRecord := server.PlayerByID(party.kaelen.ID)
	assert.False(t, kaelenOnRecord)

	assert.Len(t, emitter.snapshots(), 1, "the run settled exactly once")
}

// A kept member who reconnects before the run ends is back in the run: the
// ordinary reconnect finds their record naming the run and announces it on
// the new connection. FS-QPDKN §Requirements 19 (R12).
func TestReconnect_BeforeRunEnd_LandsInRun(t *testing.T) {
	server, _ := resolvedDropServer(t)
	party := resolvedDropRun(t, server)

	resolvedDropEscape(t, party.run, party.wren.ID)
	resolvedDropPastGrace(t, server, party.wrenConn)

	// the reconnect, as the handler runs it: the record is found, the world
	// announced on the new writer channel, the connection published
	record, reconnected := server.connectPlayer(party.wren.ID, "Wren", "token")
	require.True(t, reconnected, "a kept member reconnecting is a reconnect, not a fresh connect")
	assert.Equal(t, party.run.ID, record.CurrentGameSessionId, "their record names the run")

	msgChan := make(chan interface{}, clientWriterBuffer)
	server.announceCurrentWorld(msgChan, &record)

	newConn := &websocket.Conn{}
	_, mapped := server.MapConnToPlayer(newConn, party.wren.ID, msgChan)
	require.True(t, mapped)

	world, announced := resolvedDropWorldEntered(t, msgChan)
	require.True(t, announced, "the reconnecting member is told which world they are in")
	assert.Equal(t, party.run.ID.String(), world.Payload["session_id"], "and it is the run")
	assert.Equal(t, string(types.WorldTypeRun), world.Payload["world_type"])

	assert.True(t, party.run.HasPlayer(party.wren.ID), "their body is still in the run")
	assert.Equal(t, constants.Connected, connStateOf(t, server, party.wren.ID))
	routed, ok := server.GetPlayerFromConn(newConn)
	require.True(t, ok)
	assert.Equal(t, party.run.ID, routed.CurrentGameSessionId, "the connection routes to the run")
}

// A kept member who reconnects after the run ends connects fresh: the run
// settled without them and their record went with it. FS-QPDKN §Requirements 19.
// Green today, since today the record goes at grace end; it guards the GREEN
// against keeping a record past the run.
func TestReconnect_AfterRunEnd_ConnectsFresh(t *testing.T) {
	server, emitter := resolvedDropServer(t)
	hub, _ := server.HubSession()
	party := resolvedDropRun(t, server)

	resolvedDropEscape(t, party.run, party.wren.ID)
	resolvedDropPastGrace(t, server, party.wrenConn)

	resolvedDropEscape(t, party.run, party.kaelen.ID)
	resolvedDropEndRun(t, party.run, emitter)

	record, reconnected := server.connectPlayer(party.wren.ID, "Wren", "token")
	assert.False(t, reconnected, "a member whose run ended while they were away connects fresh")
	assert.Equal(t, uuid.Nil, record.CurrentGameSessionId, "in no world")
	assert.False(t, hub.HasPlayer(party.wren.ID), "and not seated anywhere until they enter the hub")
}

// The run ends before the grace does. The end moves the dropped member home
// and the hub seats a body for them; the grace timer then fires and must not
// remove that hub body on the strength of a drop that happened in the run.
// FS-QPDKN §Edge States "Disconnects".
func TestRunEndsBeforeGrace_LateTimerRemovesNothing(t *testing.T) {
	server, emitter := resolvedDropServer(t)
	hub, _ := server.HubSession()
	party := resolvedDropRun(t, server)

	resolvedDropEscape(t, party.run, party.wren.ID)

	// Wren drops, and is held: the grace has not run out
	_, hold, held := server.holdForReconnect(party.wrenConn)
	require.True(t, held)

	// the run ends while she is held
	resolvedDropEscape(t, party.run, party.kaelen.ID)
	snapshot := resolvedDropEndRun(t, party.run, emitter)

	wrenState, inSnapshot := resolvedDropPlayerIn(snapshot, party.wren.ID)
	require.True(t, inSnapshot, "a member within grace is settled with the run")
	assert.True(t, wrenState.Escape)

	require.True(t, hub.HasPlayer(party.wren.ID), "the end moved her home")
	require.Equal(t, 1, entityCountFor(hub.EntityManager.GetAllEntities(), party.wren.ID), "with one body")
	require.Equal(t, hub.ID, recordOf(t, server, party.wren.ID).CurrentGameSessionId, "and her record names the hub")

	// the grace timer of the drop in the run fires late
	server.cleanUpPlayerCompletely(party.wren.ID, hold)

	assert.True(t, hub.HasPlayer(party.wren.ID), "the late timer does not remove the hub body")
	assert.Equal(t, 1, entityCountFor(hub.EntityManager.GetAllEntities(), party.wren.ID), "still one body")
	_, onRecord := server.PlayerByID(party.wren.ID)
	assert.True(t, onRecord, "nor the record it holds")
}
