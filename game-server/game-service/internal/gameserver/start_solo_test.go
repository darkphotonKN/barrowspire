package gameserver

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-NSV3D §Requirements 8–15; §WebSocket message surface; §Edge States
// "Starting", "The run". I-NSV3D-1, RED half: the implementation is human lane.
//
// start_solo is an inbound action on the message hub's loop, beside find_game.
// It builds a run for the sender alone, at once, without the queue. The tests
// drive the hub exactly as a client would: a message on the server channel,
// routed on the sender's record, answered on the sender's writer channel.

// startSoloAction is the inbound action under test, spelled as the client
// sends it. The constant beside find_game is the implementation's to add.
const startSoloAction = "start_solo"

// The refusals, word for word. FS-NSV3D §Requirements 9; FS-BDA7X R6.
const (
	startSoloNoCharacterCopy = "Enter the hub with a character first."
	startSoloQueuedCopy      = "Leave the queue first."
)

// startSoloSettle bounds every wait on the hub's loop and on a live run's
// tick, so a server that never answers fails the test instead of hanging it.
const startSoloSettle = 3 * time.Second

// startSoloQueue is the mock queue with a count of how often the hub asked it
// to queue someone. A solo start must never ask. FS-NSV3D §Requirements 12.
type startSoloQueue struct {
	*mockQueueService

	mu    sync.Mutex
	joins int
}

func newStartSoloQueue() *startSoloQueue {
	return &startSoloQueue{mockQueueService: NewMockQueueService()}
}

func (q *startSoloQueue) PlayerJoinQueue(ctx context.Context, player *types.Player) error {
	q.mu.Lock()
	q.joins++
	q.mu.Unlock()

	return q.mockQueueService.PlayerJoinQueue(ctx, player)
}

// joinCalls is how many times the hub asked the queue to take a player.
func (q *startSoloQueue) joinCalls() int {
	q.mu.Lock()
	defer q.mu.Unlock()

	return q.joins
}

// hold puts a player in the mock queue as if they had queued, without the
// match the mock would make of two. QueuedCharacter then finds them.
func (q *startSoloQueue) hold(player *types.Player) {
	q.mockQueueService.mu.Lock()
	defer q.mockQueueService.mu.Unlock()

	q.players = append(q.players, player)
}

// holds reports whether the player is still waiting in the mock queue.
func (q *startSoloQueue) holds(player *types.Player) bool {
	q.mockQueueService.mu.Lock()
	defer q.mockQueueService.mu.Unlock()

	for _, queued := range q.players {
		if queued.ID == player.ID {
			return true
		}
	}

	return false
}

// unreadable makes every read of the queue fail, as it does with redis down.
func (q *startSoloQueue) unreadable(err error) {
	q.mockQueueService.mu.Lock()
	defer q.mockQueueService.mu.Unlock()

	q.queuedErr = err
}

// startSoloEmitterSpy captures what a run reports at its end.
type startSoloEmitterSpy struct {
	mu       sync.Mutex
	captured []*types.RawMatchState
}

func (s *startSoloEmitterSpy) PublishMatchComplete(_ context.Context, data *types.RawMatchState) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.captured = append(s.captured, data)
}

// published is a copy of every run-end report so far.
func (s *startSoloEmitterSpy) published() []*types.RawMatchState {
	s.mu.Lock()
	defer s.mu.Unlock()

	return append([]*types.RawMatchState(nil), s.captured...)
}

// startSoloServer is a server with a live hub over the given queue and
// emitter, the rest the usual mocks.
func startSoloServer(t *testing.T, queue *startSoloQueue, emitter game.EventEmitter) (*Server, *game.Session) {
	t.Helper()

	server := newTestServer(t, context.Background(), &MockAuthClient{}, queue, emitter, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, ok := server.HubSession()
	require.True(t, ok, "the server builds a hub at startup")

	return server, hub
}

// startSoloInbox reads everything the server writes to one connection, as its
// writer goroutine would, so the ten-slot writer channel never fills and drops
// a reply behind the sixty state frames a second a live world sends. Replies
// are kept; state frames are let go.
type startSoloInbox struct {
	messages chan types.Message
}

// startSoloListen starts reading the connection's writer channel.
func startSoloListen(t *testing.T, server *Server, conn *websocket.Conn) *startSoloInbox {
	t.Helper()

	server.mu.RLock()
	msgCh, ok := server.msgChan[conn]
	server.mu.RUnlock()
	require.True(t, ok, "the connection has a writer channel")

	inbox := &startSoloInbox{messages: make(chan types.Message, 256)}
	stop := make(chan struct{})
	t.Cleanup(func() { close(stop) })

	go func() {
		for {
			select {
			case <-stop:
				return
			case raw, open := <-msgCh:
				if !open {
					return
				}
				if msg, isReply := raw.(types.Message); isReply {
					select {
					case inbox.messages <- msg:
					default:
					}
				}
			}
		}
	}()

	return inbox
}

// await returns the next reply whose action is one of actions, dropping any
// other, or reports false once startSoloSettle has passed.
func (in *startSoloInbox) await(actions ...string) (types.Message, bool) {
	deadline := time.After(startSoloSettle)
	for {
		select {
		case msg := <-in.messages:
			for _, action := range actions {
				if msg.Action == action {
					return msg, true
				}
			}
		case <-deadline:
			return types.Message{}, false
		}
	}
}

// startSoloEnter seats a fresh member in the hub with a character in play and
// listens on their connection.
func startSoloEnter(t *testing.T, server *Server, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	player, conn := enterHub(t, server, name)
	require.NotEqual(t, uuid.Nil, player.Character.ID, "enterHub seats a character in play")

	return player, conn, startSoloListen(t, server, conn)
}

// startSoloSend sends start_solo as the client does: no payload, routed on the
// sender's record (FS-NSV3D §Requirements 8).
func startSoloSend(server *Server, conn *websocket.Conn) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: startSoloAction},
	}
}

// startSoloErrorOf is the reply's error text, for failure messages.
func startSoloErrorOf(reply types.Message) string {
	if reply.Error == nil {
		return "<nil>"
	}
	return *reply.Error
}

// startSoloSessionCount is how many worlds the server holds, the hub included.
func startSoloSessionCount(server *Server) int {
	server.mu.RLock()
	defer server.mu.RUnlock()

	return len(server.sessions)
}

// startSoloWorldOnRecord is the world the member's record names, read under
// the lock the server writes it under.
func startSoloWorldOnRecord(t *testing.T, server *Server, memberID uuid.UUID) uuid.UUID {
	t.Helper()

	return recordOf(t, server, memberID).CurrentGameSessionId
}

// startSoloAwaitRun waits for start_solo to be answered with world_entered(run)
// and returns the run it names. Any other answer, including the hub's
// "Unknown action" fallback and a refusal, fails here with its text.
func startSoloAwaitRun(t *testing.T, server *Server, inbox *startSoloInbox) *game.Session {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), startSoloAction)
	require.True(t, answered, "start_solo was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
		"an accepted start_solo is answered with world_entered(run); got %q with error %q",
		reply.Action, startSoloErrorOf(reply))
	require.Equal(t, string(types.WorldTypeRun), reply.Payload["world_type"], "the world entered is a run")

	sessionID, isString := reply.Payload["session_id"].(string)
	require.True(t, isString, "world_entered names the run by id")
	runID, err := uuid.Parse(sessionID)
	require.NoError(t, err)

	run, exists := server.GetGameSession(runID)
	require.True(t, exists, "the run world_entered names exists")

	// a run the test leaves unended stops with the test; Shutdown is idempotent
	t.Cleanup(run.Shutdown)

	return run
}

// startSoloAssertRefused checks the one reply a refused start_solo gets: an
// error on the start_solo action carrying the given copy, top-level and in
// the payload. The hub's "Unknown action" fallback is an error on the action
// too, so the text is what tells a refusal from an action the hub does not
// know. FS-NSV3D §Requirements 9; §WebSocket message surface.
func startSoloAssertRefused(t *testing.T, inbox *startSoloInbox, text string) {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), startSoloAction)
	require.True(t, answered, "start_solo was never answered")
	require.Equal(t, startSoloAction, reply.Action,
		"a refused start_solo is answered on its own action, not with %q", reply.Action)
	require.NotNil(t, reply.Error, "the refusal carries an error")
	assert.Equal(t, text, *reply.Error, "the refusal says why, in the words the delver can act on")
	assert.Equal(t, text, reply.Payload["message"], "and the same words reach the payload")
}

// startSoloBodyOf finds the member's body in a world.
func startSoloBodyOf(t *testing.T, world *game.Session, memberID uuid.UUID) *ecs.Entity {
	t.Helper()

	for _, entity := range world.EntityManager.GetAllEntities() {
		pc, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)
		if isPlayer && pc.(*components.PlayerComponent).MemberID == memberID {
			return entity
		}
	}

	require.FailNow(t, "the member has no body in the world", "member %s in world %s", memberID, world.ID)
	return nil
}

// startSoloKill resolves the member's body as dead. The run's tick reads the
// body's components with no lock the test could take, so the component the
// tick holds is never written to: a replacement is published through
// AddComponent, under the entity's own lock, and the tick sees it whole from
// its next read. Health at zero is what a monster's killing blow leaves.
func startSoloKill(t *testing.T, run *game.Session, memberID uuid.UUID) {
	t.Helper()

	body := startSoloBodyOf(t, run, memberID)
	body.AddComponent(&components.HealthComponent{CurrentHealth: 0, MaxHealth: 1})
}

// A hub member with a character in play who asks to descend alone is in a run
// at once: a run exists whose roster is that one member, they are no longer in
// the hub, their record names the run, they were told world_entered(run), and
// the queue was never asked to take them. FS-NSV3D §Requirements 8, 11, 12;
// §User Stories 1, 3, 11.
func TestStartSolo_CreatesARunOfOne(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub := startSoloServer(t, queue, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")
	require.True(t, hub.HasPlayer(wren.ID))
	worldsBefore := startSoloSessionCount(server)

	walkToSpireGate(t, server, wrenConn, wren.ID)
	startSoloSend(server, wrenConn)

	run := startSoloAwaitRun(t, server, wrenInbox)

	assert.NotEqual(t, hub.ID, run.ID, "the run is not the hub")
	assert.Equal(t, string(types.WorldTypeRun), string(run.WorldType()))
	assert.ElementsMatch(t, []uuid.UUID{wren.ID}, run.GetPlayerIDs(), "the roster is the one member")
	assert.False(t, hub.HasPlayer(wren.ID), "a solo start leaves the hub, as a match does")
	assert.Equal(t, run.ID, startSoloWorldOnRecord(t, server, wren.ID), "the record names the run")
	assert.Equal(t, worldsBefore+1, startSoloSessionCount(server), "exactly one run was built")

	assert.Zero(t, queue.joinCalls(), "a solo start never asks the queue to take the member")
	assert.False(t, queue.holds(wren), "and the member is not waiting in it")
}

// A member with no character in play cannot descend: the reply is the entry
// refusal find_game gives (FS-BDA7X R6), and nothing changes. Both a member
// standing in no world and one standing in the hub as nobody get it.
// FS-NSV3D §Requirements 9; §User Stories 6.
func TestStartSolo_RefusedWithoutCharacter(t *testing.T) {
	tests := []struct {
		name string
		// register puts a member with no character in play on record and
		// returns them, their connection, and the world their record names.
		register func(t *testing.T, server *Server) (*types.Player, *websocket.Conn, uuid.UUID)
	}{
		{
			name: "in no world",
			register: func(t *testing.T, server *Server) (*types.Player, *websocket.Conn, uuid.UUID) {
				conn := &websocket.Conn{}
				player := &types.Player{ID: uuid.New(), Username: "Nobody"}
				registerTestConn(server, conn, player)

				return player, conn, uuid.Nil
			},
		},
		{
			name: "standing in the hub as nobody",
			register: func(t *testing.T, server *Server) (*types.Player, *websocket.Conn, uuid.UUID) {
				conn := &websocket.Conn{}
				player := &types.Player{ID: uuid.New(), Username: "Nobody"}
				registerTestConn(server, conn, player)

				hub, err := server.JoinHub(conn, types.CharacterInPlay{})
				require.NoError(t, err)

				return player, conn, hub.ID
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			queue := newStartSoloQueue()
			server, hub := startSoloServer(t, queue, &MockEventEmitter{})
			player, conn, worldBefore := tt.register(t, server)
			inbox := startSoloListen(t, server, conn)
			require.Equal(t, uuid.Nil, player.Character.ID, "no character in play")
			wasInHub := hub.HasPlayer(player.ID)
			worldsBefore := startSoloSessionCount(server)

			startSoloSend(server, conn)

			startSoloAssertRefused(t, inbox, startSoloNoCharacterCopy)

			assert.Equal(t, worldsBefore, startSoloSessionCount(server), "no run was built")
			assert.Equal(t, worldBefore, startSoloWorldOnRecord(t, server, player.ID), "the record names the world it did")
			assert.Equal(t, wasInHub, hub.HasPlayer(player.ID), "the hub holds them exactly as before")
			assert.Zero(t, queue.joinCalls(), "the queue was never asked")
		})
	}
}

// A queued member cannot descend alone: the reply says to leave the queue
// first, they stay queued and in the hub, and no run is built. The queue's
// own entry is what says they are queued (QueuedCharacter), as FS-K2HKP R7a
// reads it. FS-NSV3D §Requirements 9, 12; §User Stories 4, 5.
func TestStartSolo_RefusedWhileQueued(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub := startSoloServer(t, queue, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")
	queue.hold(wren)
	require.True(t, queue.holds(wren))
	worldsBefore := startSoloSessionCount(server)

	walkToSpireGate(t, server, wrenConn, wren.ID)
	startSoloSend(server, wrenConn)

	startSoloAssertRefused(t, wrenInbox, startSoloQueuedCopy)

	assert.Equal(t, worldsBefore, startSoloSessionCount(server), "no run was built")
	assert.True(t, queue.holds(wren), "still queued")
	assert.True(t, hub.HasPlayer(wren.ID), "still standing in the hub")
	assert.Equal(t, hub.ID, startSoloWorldOnRecord(t, server, wren.ID), "the record still names the hub")
	assert.Zero(t, queue.joinCalls(), "the queue was never asked to take them again")
}

// A member already in a run is put back in it: start_solo answers
// world_entered for that run and builds nothing, as find_game resumes. This
// is also what the second of two start_solo presses gets. FS-NSV3D
// §Requirements 10; §User Stories 7; §Edge States "Starting".
func TestStartSolo_ResumesAnExistingRun(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub := startSoloServer(t, queue, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")

	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren}})
	t.Cleanup(run.Shutdown)
	require.True(t, run.HasPlayer(wren.ID))
	require.Equal(t, run.ID, startSoloWorldOnRecord(t, server, wren.ID))
	worldsBefore := startSoloSessionCount(server)

	startSoloSend(server, wrenConn)

	reply, answered := wrenInbox.await(string(constants.ActionWorldEntered), startSoloAction)
	require.True(t, answered, "start_solo was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
		"start_solo from a member in a run is answered with world_entered for it; got %q with error %q",
		reply.Action, startSoloErrorOf(reply))
	assert.Equal(t, run.ID.String(), reply.Payload["session_id"], "the run they are already in")
	assert.Equal(t, string(types.WorldTypeRun), reply.Payload["world_type"])

	assert.Equal(t, worldsBefore, startSoloSessionCount(server), "no second run was built")
	assert.True(t, run.HasPlayer(wren.ID), "still in the run")
	assert.ElementsMatch(t, []uuid.UUID{wren.ID}, run.GetPlayerIDs())
	assert.False(t, hub.HasPlayer(wren.ID), "not seated in the hub")
	assert.Equal(t, run.ID, startSoloWorldOnRecord(t, server, wren.ID), "the record still names the run")
	assert.Zero(t, queue.joinCalls())
}

// A queue that cannot be read (redis down) counts as "not queued", as entering
// the hub already treats it: the solo start goes ahead. FS-NSV3D §Requirements
// 9 [OD], 12; §User Stories 11; §Edge States "Starting".
func TestStartSolo_UnreadableQueueDoesNotBlock(t *testing.T) {
	queue := newStartSoloQueue()
	queue.unreadable(errors.New("redis: connection refused"))
	server, hub := startSoloServer(t, queue, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")
	worldsBefore := startSoloSessionCount(server)

	walkToSpireGate(t, server, wrenConn, wren.ID)
	startSoloSend(server, wrenConn)

	run := startSoloAwaitRun(t, server, wrenInbox)

	assert.ElementsMatch(t, []uuid.UUID{wren.ID}, run.GetPlayerIDs(), "the roster is the one member")
	assert.False(t, hub.HasPlayer(wren.ID), "they left the hub for the run")
	assert.Equal(t, run.ID, startSoloWorldOnRecord(t, server, wren.ID))
	assert.Equal(t, worldsBefore+1, startSoloSessionCount(server), "one run was built")
	assert.Zero(t, queue.joinCalls(), "the queue was never asked, readable or not")
}

// A solo run is an ordinary run: when its one delver dies it ends on that
// tick, they get end_game and are sent home, and the run reports its end with
// that one player. FS-NSV3D §Requirements 13; §User Stories 8, 14; §Edge
// States "The run".
func TestSoloRun_EndsWhenTheDelverDies(t *testing.T) {
	queue := newStartSoloQueue()
	spy := &startSoloEmitterSpy{}
	server, hub := startSoloServer(t, queue, spy)
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")

	walkToSpireGate(t, server, wrenConn, wren.ID)
	startSoloSend(server, wrenConn)
	run := startSoloAwaitRun(t, server, wrenInbox)
	require.Empty(t, spy.published(), "the run has not ended before anyone resolved")

	startSoloKill(t, run, wren.ID)

	eventually(t, "the solo run ends and reports its end once its one delver is dead", func() bool {
		return len(spy.published()) == 1
	})
	assert.True(t, run.Ended(), "the run is over")
	_, stillHeld := server.GetGameSession(run.ID)
	assert.False(t, stillHeld, "and no longer held by the server")

	// end_game lands before world_entered(hub): the run tells its delvers how
	// it ended while they are still in it, then sends them home
	endGame, told := wrenInbox.await(string(constants.ActionEndGame))
	require.True(t, told, "the delver is told the run ended")
	assert.Equal(t, "eliminated", endGame.Payload["result"])
	assert.Equal(t, wren.ID.String(), endGame.Payload["player_id"])

	home, sentHome := wrenInbox.await(string(constants.ActionWorldEntered))
	require.True(t, sentHome, "the delver is sent home")
	assert.Equal(t, string(types.WorldTypeHub), home.Payload["world_type"])
	assert.Equal(t, hub.ID.String(), home.Payload["session_id"])

	assert.True(t, hub.HasPlayer(wren.ID), "the delver is back in the hub")
	assert.Equal(t, hub.ID, startSoloWorldOnRecord(t, server, wren.ID), "and their record names it")

	ended := spy.published()[0]
	assert.Equal(t, run.ID, ended.SessionID)
	require.Len(t, ended.Players, 1, "match.ended carries the one delver")
	assert.Equal(t, wren.ID.String(), ended.Players[0].MemberID)
	position, eliminated := ended.EliminationOrder[wren.ID]
	assert.True(t, eliminated, "the delver fell")
	assert.Equal(t, 0, position, "first and only to fall")
	assert.Zero(t, queue.joinCalls(), "the queue had no part in it")
}
