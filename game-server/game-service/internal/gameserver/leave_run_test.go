package gameserver

import (
	"context"
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

// FS-QPDKN §Requirements 13–14, 18, 21–23; §WebSocket message surface; §Edge
// States "Leaving". I-QPDKN-3, RED half: the implementation is human lane.

// leaveRunAction is the inbound action under test, spelled as the client
// sends it. The constant beside leave_queue is the implementation's to add.
const leaveRunAction = "leave_run"

// leaveRunSettle bounds every wait on a live run's tick, so a run that never
// answers fails the test instead of hanging the suite.
const leaveRunSettle = 3 * time.Second

// leaveRunQuiet is how long a test listens for a message that must not come:
// about eighteen ticks, plenty for anything already in flight to land.
const leaveRunQuiet = 300 * time.Millisecond

// leaveRunServer is a server with a live hub, over the usual mocks.
func leaveRunServer(t *testing.T, emitter game.EventEmitter) (*Server, *game.Session) {
	t.Helper()

	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), emitter, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, ok := server.HubSession()
	require.True(t, ok, "the server builds a hub at startup")

	return server, hub
}

// leaveRunInbox reads everything the server writes to one connection, as its
// writer goroutine would, so the writer channel never fills and drops a reply
// behind sixty state frames a second. Replies are kept; state frames are
// counted per world and the latest one kept, which is how a test learns what
// the tick has seen without reading the entities the tick is writing.
type leaveRunInbox struct {
	messages chan types.Message

	mu     sync.Mutex
	frames map[uuid.UUID]int
	latest map[uuid.UUID]*types.ClientGameState
}

// leaveRunListen starts reading the connection's writer channel.
func leaveRunListen(t *testing.T, server *Server, conn *websocket.Conn) *leaveRunInbox {
	t.Helper()

	server.mu.RLock()
	msgCh, ok := server.msgChan[conn]
	server.mu.RUnlock()
	require.True(t, ok, "the connection has a writer channel")

	inbox := &leaveRunInbox{
		messages: make(chan types.Message, 256),
		frames:   map[uuid.UUID]int{},
		latest:   map[uuid.UUID]*types.ClientGameState{},
	}
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
				switch msg := raw.(type) {
				case types.Message:
					select {
					case inbox.messages <- msg:
					default:
					}
				case *types.ClientGameState:
					inbox.mu.Lock()
					inbox.frames[msg.SessionID]++
					inbox.latest[msg.SessionID] = msg
					inbox.mu.Unlock()
				}
			}
		}
	}()

	return inbox
}

// await returns the next reply whose action is one of actions, dropping any
// other, or reports false once leaveRunSettle has passed.
func (in *leaveRunInbox) await(actions ...string) (types.Message, bool) {
	deadline := time.After(leaveRunSettle)
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

// quiet listens for leaveRunQuiet and returns every reply whose action is one
// of actions; a test asserts the list is empty.
func (in *leaveRunInbox) quiet(actions ...string) []types.Message {
	var matched []types.Message
	deadline := time.After(leaveRunQuiet)
	for {
		select {
		case msg := <-in.messages:
			for _, action := range actions {
				if msg.Action == action {
					matched = append(matched, msg)
				}
			}
		case <-deadline:
			return matched
		}
	}
}

// framesFrom is how many state frames the world has delivered here so far.
func (in *leaveRunInbox) framesFrom(worldID uuid.UUID) int {
	in.mu.Lock()
	defer in.mu.Unlock()

	return in.frames[worldID]
}

// awaitFrame waits until a frame from the world satisfies seen, or fails.
func (in *leaveRunInbox) awaitFrame(t *testing.T, worldID uuid.UUID, what string, seen func(*types.ClientGameState) bool) {
	t.Helper()

	deadline := time.Now().Add(leaveRunSettle)
	for time.Now().Before(deadline) {
		in.mu.Lock()
		frame := in.latest[worldID]
		in.mu.Unlock()
		if frame != nil && seen(frame) {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}

	t.Fatalf("%s: no such frame from world %s within %s", what, worldID, leaveRunSettle)
}

// awaitTicks waits until the world has delivered n more frames here: the tick
// has read the world at least that many times since the call.
func (in *leaveRunInbox) awaitTicks(t *testing.T, worldID uuid.UUID, n int) {
	t.Helper()

	target := in.framesFrom(worldID) + n
	in.awaitFrame(t, worldID, "waiting for the tick", func(*types.ClientGameState) bool {
		return in.framesFrom(worldID) >= target
	})
}

// ownHealth is the recipient's health as the latest frame from the world shows it.
func (in *leaveRunInbox) ownHealth(t *testing.T, worldID uuid.UUID) int {
	t.Helper()

	in.mu.Lock()
	defer in.mu.Unlock()

	frame := in.latest[worldID]
	require.NotNil(t, frame, "no frame from world %s yet", worldID)
	require.NotNil(t, frame.CurrentPlayer, "the frame carries the recipient's own state")

	return frame.CurrentPlayer.CurrentHealth
}

// leaveRunEnter seats a fresh member in the hub and listens on their connection.
func leaveRunEnter(t *testing.T, server *Server, name string) (*types.Player, *websocket.Conn, *leaveRunInbox) {
	t.Helper()

	player, conn := enterHub(t, server, name)

	return player, conn, leaveRunListen(t, server, conn)
}

// leaveRunSend sends leave_run as the client does: no payload, routed on the
// member's record (FS-29KSH R16).
func leaveRunSend(server *Server, conn *websocket.Conn) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: leaveRunAction},
	}
}

// leaveRunErrorOf is the reply's error text, for failure messages.
func leaveRunErrorOf(reply types.Message) string {
	if reply.Error == nil {
		return "<nil>"
	}
	return *reply.Error
}

// leaveRunBodyOf finds the member's body in a world.
func leaveRunBodyOf(t *testing.T, world *game.Session, memberID uuid.UUID) *ecs.Entity {
	t.Helper()

	for _, entity := range world.EntityManager.GetAllEntities() {
		pc, ok := entity.GetComponent(ecs.ComponentTypePlayer)
		if ok && pc.(*components.PlayerComponent).MemberID == memberID {
			return entity
		}
	}

	t.Fatalf("member %s has no body in world %s", memberID, world.ID)
	return nil
}

// The three ways a delver resolves, applied to a body in a live run.
//
// The run's tick reads the body's components with no lock the test could
// take, so the component the tick holds is never written to. A replacement
// is published through AddComponent, under the entity's own lock, and the
// tick sees it whole from its next read. Death is a health of zero: the
// EliminationSystem marks the elimination and records the order on the tick,
// exactly as a monster's killing blow would.

func leaveRunKill(t *testing.T, world *game.Session, memberID uuid.UUID) {
	t.Helper()

	body := leaveRunBodyOf(t, world, memberID)
	body.AddComponent(&components.HealthComponent{CurrentHealth: 0, MaxHealth: 1})
}

// leaveRunResolvedAs replaces the body's player component with escape and
// left-behind set as given. Identity fields are copied: nothing on the tick
// writes them.
func leaveRunResolvedAs(t *testing.T, world *game.Session, memberID uuid.UUID, escaped, leftBehind bool) {
	t.Helper()

	body := leaveRunBodyOf(t, world, memberID)
	pc, ok := body.GetComponent(ecs.ComponentTypePlayer)
	require.True(t, ok)
	was := pc.(*components.PlayerComponent)

	body.AddComponent(&components.PlayerComponent{
		MemberID:    was.MemberID,
		CharacterID: was.CharacterID,
		Class:       was.Class,
		Username:    was.Username,
		Escape:      escaped,
		LeftBehind:  leftBehind,
	})
}

func leaveRunEscape(t *testing.T, world *game.Session, memberID uuid.UUID) {
	t.Helper()
	leaveRunResolvedAs(t, world, memberID, true, false)
}

// leaveRunStrand leaves the body behind on a floor below: out of play, not
// dead, not escaped (FS-F6F88 R15; FS-QPDKN §Edge States "Resolving").
func leaveRunStrand(t *testing.T, world *game.Session, memberID uuid.UUID) {
	t.Helper()
	leaveRunResolvedAs(t, world, memberID, false, true)
}

// leaveRunWorldsOnRecord is the world every copy of the member's record names,
// read under the lock the server writes them under. MapConnToPlayer keeps a
// copy per connection beside the one in players, and routing reads the
// connection's, so all of them have to agree.
func leaveRunWorldsOnRecord(t *testing.T, server *Server, memberID uuid.UUID) []uuid.UUID {
	t.Helper()

	server.mu.RLock()
	defer server.mu.RUnlock()

	record, ok := server.players[memberID]
	require.True(t, ok, "member %s is on record", memberID)
	worlds := []uuid.UUID{record.CurrentGameSessionId}

	for _, mapped := range server.connToPlayer {
		if mapped.ID == memberID {
			worlds = append(worlds, mapped.CurrentGameSessionId)
		}
	}

	return worlds
}

// leaveRunEmitterSpy captures what the run reports at its end.
type leaveRunEmitterSpy struct {
	mu       sync.Mutex
	captured []*types.RawMatchState
	ended    chan *types.RawMatchState
}

func newLeaveRunEmitterSpy() *leaveRunEmitterSpy {
	return &leaveRunEmitterSpy{ended: make(chan *types.RawMatchState, 4)}
}

func (s *leaveRunEmitterSpy) PublishMatchComplete(_ context.Context, data *types.RawMatchState) {
	s.mu.Lock()
	s.captured = append(s.captured, data)
	s.mu.Unlock()

	select {
	case s.ended <- data:
	default:
	}
}

func (s *leaveRunEmitterSpy) published() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	return len(s.captured)
}

// A dead delver's leave_run is answered with world_entered(hub): they are
// seated in the hub, every record of them names it, and the run keeps their
// body for settlement. A delver left behind on a lower floor is treated the
// same. FS-QPDKN §Requirements 14, 18; §Edge States "Resolving".
func TestLeaveRun_DeadDelverGoesHomeAndBodyStays(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(t *testing.T, run *game.Session, inbox *leaveRunInbox, memberID uuid.UUID)
	}{
		{
			name: "dead",
			resolve: func(t *testing.T, run *game.Session, inbox *leaveRunInbox, memberID uuid.UUID) {
				leaveRunKill(t, run, memberID)
				inbox.awaitFrame(t, run.ID, "the tick has seen the death", func(frame *types.ClientGameState) bool {
					return frame.CurrentPlayer != nil && frame.CurrentPlayer.CurrentHealth == 0
				})
			},
		},
		{
			name: "left behind",
			resolve: func(t *testing.T, run *game.Session, inbox *leaveRunInbox, memberID uuid.UUID) {
				leaveRunStrand(t, run, memberID)
				inbox.awaitTicks(t, run.ID, 2)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, hub := leaveRunServer(t, &MockEventEmitter{})
			wren, wrenConn, wrenInbox := leaveRunEnter(t, server, "Wren")
			kaelen, _, _ := leaveRunEnter(t, server, "Kaelen")
			run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})

			tt.resolve(t, run, wrenInbox, wren.ID)

			leaveRunSend(server, wrenConn)

			reply, answered := wrenInbox.await(string(constants.ActionWorldEntered), leaveRunAction)
			require.True(t, answered, "leave_run was never answered")
			require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
				"a resolved delver's leave_run is answered with world_entered(hub); got %q with error %q",
				reply.Action, leaveRunErrorOf(reply))
			assert.Equal(t, string(types.WorldTypeHub), reply.Payload["world_type"])
			assert.Equal(t, hub.ID.String(), reply.Payload["session_id"])

			for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
				assert.Equal(t, hub.ID, world, "every record of the leaver names the hub")
			}
			assert.True(t, hub.HasPlayer(wren.ID), "the leaver has a body in the hub")
			assert.True(t, run.HasPlayer(wren.ID), "the run keeps the leaver's body until it ends")

			assert.True(t, run.HasPlayer(kaelen.ID), "the teammate is untouched")
			assert.False(t, hub.HasPlayer(kaelen.ID))
		})
	}
}

// leaveRunAssertRefused checks the one reply a refused leave_run gets: an
// error on the leave_run action, and not the hub's "Unknown action" fallback,
// since leave_run is part of the contract and refused for who sent it.
// FS-QPDKN §Requirements 14; §WebSocket message surface.
func leaveRunAssertRefused(t *testing.T, inbox *leaveRunInbox) {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), leaveRunAction)
	require.True(t, answered, "leave_run was never answered")
	require.Equal(t, leaveRunAction, reply.Action, "a refused leave_run is answered on its own action, not with %q", reply.Action)
	require.NotNil(t, reply.Error, "the refusal carries an error")
	assert.NotEqual(t, "Unknown action", *reply.Error,
		"leave_run is a known action refused for this sender, not an unknown one")
	assert.NotEmpty(t, reply.Payload["message"], "the refusal says why")
}

// A delver still in play cannot leave: the reply is an error on leave_run and
// nothing moves. FS-QPDKN §Requirements 14; §User Stories 23.
func TestLeaveRun_RefusedWhileInPlay(t *testing.T) {
	server, hub := leaveRunServer(t, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := leaveRunEnter(t, server, "Wren")
	kaelen, _, _ := leaveRunEnter(t, server, "Kaelen")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})
	wrenInbox.awaitTicks(t, run.ID, 1)

	leaveRunSend(server, wrenConn)

	leaveRunAssertRefused(t, wrenInbox)

	for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, run.ID, world, "the record still names the run")
	}
	assert.True(t, run.HasPlayer(wren.ID), "still in the run")
	assert.False(t, hub.HasPlayer(wren.ID), "no body in the hub")
	wrenInbox.awaitTicks(t, run.ID, 1)
	assert.Positive(t, wrenInbox.ownHealth(t, run.ID), "still in play")
}

// An escaped delver cannot leave early: their plunder is settled from the
// run-end snapshot. FS-QPDKN §Requirements 14; §Out of Scope.
func TestLeaveRun_RefusedAfterEscape(t *testing.T) {
	server, hub := leaveRunServer(t, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := leaveRunEnter(t, server, "Wren")
	kaelen, _, _ := leaveRunEnter(t, server, "Kaelen")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})

	leaveRunEscape(t, run, wren.ID)
	// an escaped delver is left out of the frame and counted instead
	wrenInbox.awaitFrame(t, run.ID, "the tick has seen the escape", func(frame *types.ClientGameState) bool {
		return frame.EscapedCount > 0
	})

	leaveRunSend(server, wrenConn)

	leaveRunAssertRefused(t, wrenInbox)

	for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, run.ID, world, "the record still names the run")
	}
	assert.True(t, run.HasPlayer(wren.ID), "still in the run")
	assert.False(t, hub.HasPlayer(wren.ID), "no body in the hub")
}

// A member standing in the hub is in no run to leave. This is also what the
// second of two leave_run presses, and one that lost the race with the run's
// end, get. FS-QPDKN §Edge States "Leaving".
func TestLeaveRun_RefusedFromTheHub(t *testing.T) {
	server, hub := leaveRunServer(t, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := leaveRunEnter(t, server, "Wren")

	leaveRunSend(server, wrenConn)

	leaveRunAssertRefused(t, wrenInbox)

	for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, hub.ID, world, "the record still names the hub")
	}
	assert.True(t, hub.HasPlayer(wren.ID), "still standing in the hub")
}

// Once a member has left, the run sends them nothing more: not its per-tick
// state, not end_game, not a second world_entered when it ends. The member
// still in it receives all of them. FS-QPDKN §Requirements 21; §User Stories 24.
func TestRunBroadcast_SkipsMembersWhoLeft(t *testing.T) {
	server, hub := leaveRunServer(t, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := leaveRunEnter(t, server, "Wren")
	kaelen, _, kaelenInbox := leaveRunEnter(t, server, "Kaelen")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})

	leaveRunKill(t, run, wren.ID)
	wrenInbox.awaitFrame(t, run.ID, "the tick has seen the death", func(frame *types.ClientGameState) bool {
		return frame.CurrentPlayer != nil && frame.CurrentPlayer.CurrentHealth == 0
	})

	leaveRunSend(server, wrenConn)
	reply, answered := wrenInbox.await(string(constants.ActionWorldEntered), leaveRunAction)
	require.True(t, answered, "leave_run was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
		"the leave must be accepted before its recipients can be checked; got %q with error %q",
		reply.Action, leaveRunErrorOf(reply))

	// frames serialized before the leave may still be landing
	time.Sleep(100 * time.Millisecond)
	wrenFrames, kaelenFrames := wrenInbox.framesFrom(run.ID), kaelenInbox.framesFrom(run.ID)
	time.Sleep(leaveRunQuiet)
	assert.Equal(t, wrenFrames, wrenInbox.framesFrom(run.ID),
		"the run's state broadcast still reaches a member who left")
	assert.Greater(t, kaelenInbox.framesFrom(run.ID), kaelenFrames,
		"the run's state broadcast must still reach the member in it")

	// the run goes on for the member left in it, and ends when they resolve
	leaveRunEscape(t, run, kaelen.ID)

	endGame, got := kaelenInbox.await(string(constants.ActionEndGame))
	require.True(t, got, "the member still in the run gets end_game")
	assert.Equal(t, "escaped", endGame.Payload["result"])
	home, got := kaelenInbox.await(string(constants.ActionWorldEntered))
	require.True(t, got, "the member still in the run is sent home")
	assert.Equal(t, hub.ID.String(), home.Payload["session_id"])

	stale := wrenInbox.quiet(string(constants.ActionEndGame), string(constants.ActionWorldEntered))
	assert.Empty(t, stale, "the run's end reached a member who had already left")
}

// At its end a run moves home only the members whose record still names it.
// A member who left and entered another run meanwhile is not pulled out of
// it. The member who left is set up directly: a record naming a second run
// with a body still in the first is exactly the state leave_run plus a new
// match produces, and this guard has to hold whether or not leave_run exists.
// FS-QPDKN §Requirements 22; §User Stories 16.
func TestRunEnd_SkipsMembersWhoLeft(t *testing.T) {
	server, hub := leaveRunServer(t, &MockEventEmitter{})
	wren, _, wrenInbox := leaveRunEnter(t, server, "Wren")
	kaelen, _, kaelenInbox := leaveRunEnter(t, server, "Kaelen")

	first := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})
	leaveRunKill(t, first, wren.ID)
	wrenInbox.awaitFrame(t, first.ID, "the tick has seen the death", func(frame *types.ClientGameState) bool {
		return frame.CurrentPlayer != nil && frame.CurrentPlayer.CurrentHealth == 0
	})

	// Wren is matched again while their body lies in the first run
	second := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren}})
	require.True(t, first.HasPlayer(wren.ID), "the first run keeps the body")
	require.True(t, second.HasPlayer(wren.ID))
	for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
		require.Equal(t, second.ID, world, "the record names the second run")
	}

	// the first run ends once Kaelen resolves
	leaveRunEscape(t, first, kaelen.ID)

	home, got := kaelenInbox.await(string(constants.ActionWorldEntered))
	require.True(t, got, "the member still in the first run is sent home")
	assert.Equal(t, hub.ID.String(), home.Payload["session_id"])
	assert.True(t, hub.HasPlayer(kaelen.ID))

	for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, second.ID, world, "the first run's end repointed a record that named another run")
	}
	assert.True(t, second.HasPlayer(wren.ID), "still seated in the second run")
	assert.False(t, hub.HasPlayer(wren.ID), "the first run's end seated a member of another run in the hub")
	assert.Empty(t, wrenInbox.quiet(string(constants.ActionWorldEntered)),
		"the first run's end sent world_entered to a member whose record names another run")
}

// Leaving changes nothing about the result: the leaver is in match.ended with
// the elimination position they died with and in run progress with their
// character, and the run ends exactly once, when the last member resolves.
// FS-QPDKN §Requirements 18, 23; §User Stories 17, 22, 25.
func TestLeaveRun_LeaverSettledWithTheRun(t *testing.T) {
	spy := newLeaveRunEmitterSpy()
	server, hub := leaveRunServer(t, spy)
	wren, wrenConn, wrenInbox := leaveRunEnter(t, server, "Wren")
	kaelen, _, kaelenInbox := leaveRunEnter(t, server, "Kaelen")
	wrenCharacter := wren.Character.ID
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})

	leaveRunKill(t, run, wren.ID)
	wrenInbox.awaitFrame(t, run.ID, "the tick has seen the death", func(frame *types.ClientGameState) bool {
		return frame.CurrentPlayer != nil && frame.CurrentPlayer.CurrentHealth == 0
	})

	leaveRunSend(server, wrenConn)
	reply, answered := wrenInbox.await(string(constants.ActionWorldEntered), leaveRunAction)
	require.True(t, answered, "leave_run was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
		"the leave must be accepted before settlement can be checked; got %q with error %q",
		reply.Action, leaveRunErrorOf(reply))

	// the run goes on for Kaelen alone, and ends when they resolve
	assert.Zero(t, spy.published(), "the run ended while a member was still in play")
	leaveRunEscape(t, run, kaelen.ID)

	var ended *types.RawMatchState
	select {
	case ended = <-spy.ended:
	case <-time.After(leaveRunSettle):
		t.Fatal("the run never reported its end")
	}

	home, got := kaelenInbox.await(string(constants.ActionWorldEntered))
	require.True(t, got, "the last member is sent home")
	assert.Equal(t, hub.ID.String(), home.Payload["session_id"])
	assert.Equal(t, 1, spy.published(), "the run ends once")

	assert.Equal(t, run.ID, ended.SessionID)

	members := make([]string, 0, len(ended.Players))
	for _, player := range ended.Players {
		members = append(members, player.MemberID)
	}
	assert.ElementsMatch(t, []string{wren.ID.String(), kaelen.ID.String()}, members,
		"match.ended carries every delver who was in the run, the leaver included")

	position, eliminated := ended.EliminationOrder[wren.ID]
	assert.True(t, eliminated, "the leaver keeps the elimination they died with")
	assert.Equal(t, 0, position, "first and only to fall")
	_, kaelenEliminated := ended.EliminationOrder[kaelen.ID]
	assert.False(t, kaelenEliminated)

	var leaverProgress *types.RunProgress
	for i := range ended.Progress {
		if ended.Progress[i].MemberID == wren.ID {
			leaverProgress = &ended.Progress[i]
		}
	}
	require.NotNil(t, leaverProgress, "run progress carries the leaver")
	assert.Equal(t, wrenCharacter, leaverProgress.CharacterID)
	assert.True(t, leaverProgress.Seated, "settled from the body the run kept, as if they had stayed")
}
