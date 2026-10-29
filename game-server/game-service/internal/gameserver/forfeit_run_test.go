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

// FS-9K8EZ §Requirements 9–14; §WebSocket message surface; §Edge States
// "Dying", "Refusals". I-9K8EZ-1, RED half: the implementation is human lane.
//
// forfeit_run is an inbound action on the message hub's loop, beside
// leave_run. From a member in play in a run it sets their body's health to 0
// and does nothing else: the ordinary death path records the elimination on
// the next tick, ends the run if nobody is left in play, and settles it. The
// tests drive the hub exactly as a client would: a message on the server
// channel, routed on the sender's record, answered (or not) on the sender's
// writer channel, and read the run through its state frames and its end
// report rather than the entities the tick is writing.

// forfeitRunAction is the inbound action under test, spelled as the client
// sends it. The constant beside leave_run is the implementation's to add.
const forfeitRunAction = "forfeit_run"

// forfeitLeaveRunAction is FS-QPDKN's leave_run, which a fallen delver may
// then send like any dead one.
const forfeitLeaveRunAction = "leave_run"

// The refusals, word for word. FS-9K8EZ §Requirements 12.
const (
	forfeitNotInDelve = "You are not in a delve."
	forfeitAlreadyOut = "You are already out of the delve."
)

// forfeitSettle bounds every wait on the hub's loop and on a live run's tick,
// so a server that never answers fails the test instead of hanging the suite.
const forfeitSettle = 3 * time.Second

// forfeitQuiet is how long a test listens for a message that must not come:
// about eighteen ticks, plenty for anything already in flight to land.
const forfeitQuiet = 300 * time.Millisecond

// forfeitServer is a server with a live hub, over the usual mocks.
func forfeitServer(t *testing.T, emitter game.EventEmitter) (*Server, *game.Session) {
	t.Helper()

	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), emitter, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, ok := server.HubSession()
	require.True(t, ok, "the server builds a hub at startup")

	return server, hub
}

// forfeitInbox reads everything the server writes to one connection, as its
// writer goroutine would, so the ten-slot writer channel never fills and drops
// a reply behind the sixty state frames a second a live world sends. Replies
// are kept; state frames are counted per world and the latest one kept, which
// is how a test learns what the tick has seen.
type forfeitInbox struct {
	messages chan types.Message

	mu     sync.Mutex
	frames map[uuid.UUID]int
	latest map[uuid.UUID]*types.ClientGameState
}

// forfeitListen starts reading the connection's writer channel.
func forfeitListen(t *testing.T, server *Server, conn *websocket.Conn) *forfeitInbox {
	t.Helper()

	server.mu.RLock()
	msgCh, ok := server.msgChan[conn]
	server.mu.RUnlock()
	require.True(t, ok, "the connection has a writer channel")

	inbox := &forfeitInbox{
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
// other, or reports false once forfeitSettle has passed.
func (in *forfeitInbox) await(actions ...string) (types.Message, bool) {
	deadline := time.After(forfeitSettle)
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

// quiet listens for forfeitQuiet and returns every reply whose action is one
// of actions; a test asserts on the list.
func (in *forfeitInbox) quiet(actions ...string) []types.Message {
	var matched []types.Message
	deadline := time.After(forfeitQuiet)
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
func (in *forfeitInbox) framesFrom(worldID uuid.UUID) int {
	in.mu.Lock()
	defer in.mu.Unlock()

	return in.frames[worldID]
}

// awaitFrame waits until a frame from the world satisfies seen, or fails.
func (in *forfeitInbox) awaitFrame(t *testing.T, worldID uuid.UUID, what string, seen func(*types.ClientGameState) bool) {
	t.Helper()

	deadline := time.Now().Add(forfeitSettle)
	for time.Now().Before(deadline) {
		in.mu.Lock()
		frame := in.latest[worldID]
		in.mu.Unlock()
		if frame != nil && seen(frame) {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}

	t.Fatalf("%s: no such frame from world %s within %s", what, worldID, forfeitSettle)
}

// awaitTicks waits until the world has delivered n more frames here: the tick
// has read the world at least that many times since the call.
func (in *forfeitInbox) awaitTicks(t *testing.T, worldID uuid.UUID, n int) {
	t.Helper()

	target := in.framesFrom(worldID) + n
	in.awaitFrame(t, worldID, "waiting for the tick", func(*types.ClientGameState) bool {
		return in.framesFrom(worldID) >= target
	})
}

// awaitFallen waits until the run's frame shows the recipient at 0 health:
// the tick has seen the death.
func (in *forfeitInbox) awaitFallen(t *testing.T, runID uuid.UUID, who string) {
	t.Helper()

	in.awaitFrame(t, runID, who+" is at 0 health in the next frame", func(frame *types.ClientGameState) bool {
		return frame.CurrentPlayer != nil && frame.CurrentPlayer.CurrentHealth == 0
	})
}

// ownHealth is the recipient's health as the latest frame from the world shows it.
func (in *forfeitInbox) ownHealth(t *testing.T, worldID uuid.UUID) int {
	t.Helper()

	in.mu.Lock()
	defer in.mu.Unlock()

	frame := in.latest[worldID]
	require.NotNil(t, frame, "no frame from world %s yet", worldID)
	require.NotNil(t, frame.CurrentPlayer, "the frame carries the recipient's own state")

	return frame.CurrentPlayer.CurrentHealth
}

// escapedCount is the run's escaped count as the latest frame shows it.
func (in *forfeitInbox) escapedCount(t *testing.T, worldID uuid.UUID) int {
	t.Helper()

	in.mu.Lock()
	defer in.mu.Unlock()

	frame := in.latest[worldID]
	require.NotNil(t, frame, "no frame from world %s yet", worldID)

	return frame.EscapedCount
}

// forfeitEnter seats a fresh member in the hub and listens on their connection.
func forfeitEnter(t *testing.T, server *Server, name string) (*types.Player, *websocket.Conn, *forfeitInbox) {
	t.Helper()

	player, conn := enterHub(t, server, name)

	return player, conn, forfeitListen(t, server, conn)
}

// forfeitSend sends an action as the client does: no payload, routed on the
// member's record (FS-29KSH R16; FS-9K8EZ R9).
func forfeitSend(server *Server, conn *websocket.Conn, action string) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: action},
	}
}

// forfeitErrorOf is the reply's error text, for failure messages.
func forfeitErrorOf(reply types.Message) string {
	if reply.Error == nil {
		return "<nil>"
	}
	return *reply.Error
}

// forfeitBodyOf finds the member's body in a world.
func forfeitBodyOf(t *testing.T, world *game.Session, memberID uuid.UUID) *ecs.Entity {
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

// The two ways a delver resolves without choosing to, applied to a body in a
// live run. The run's tick reads the body's components with no lock the test
// could take, so the component the tick holds is never written to: a
// replacement is published through AddComponent, under the entity's own lock,
// and the tick sees it whole from its next read.

// forfeitKill is a monster's killing blow: health at zero.
func forfeitKill(t *testing.T, world *game.Session, memberID uuid.UUID) {
	t.Helper()

	body := forfeitBodyOf(t, world, memberID)
	body.AddComponent(&components.HealthComponent{CurrentHealth: 0, MaxHealth: 1})
}

// forfeitEscape marks the body escaped. Identity fields are copied: nothing on
// the tick writes them.
func forfeitEscape(t *testing.T, world *game.Session, memberID uuid.UUID) {
	t.Helper()

	body := forfeitBodyOf(t, world, memberID)
	pc, ok := body.GetComponent(ecs.ComponentTypePlayer)
	require.True(t, ok)
	was := pc.(*components.PlayerComponent)

	body.AddComponent(&components.PlayerComponent{
		MemberID:    was.MemberID,
		CharacterID: was.CharacterID,
		Class:       was.Class,
		Username:    was.Username,
		Escape:      true,
	})
}

// forfeitWorldsOnRecord is the world every copy of the member's record names,
// read under the lock the server writes them under. MapConnToPlayer keeps a
// copy per connection beside the one in players, and routing reads the
// connection's, so all of them have to agree.
func forfeitWorldsOnRecord(t *testing.T, server *Server, memberID uuid.UUID) []uuid.UUID {
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

// forfeitEmitterSpy captures what a run reports at its end.
type forfeitEmitterSpy struct {
	mu       sync.Mutex
	captured []*types.RawMatchState
	ended    chan *types.RawMatchState
}

func newForfeitEmitterSpy() *forfeitEmitterSpy {
	return &forfeitEmitterSpy{ended: make(chan *types.RawMatchState, 4)}
}

func (s *forfeitEmitterSpy) PublishMatchComplete(_ context.Context, data *types.RawMatchState) {
	s.mu.Lock()
	s.captured = append(s.captured, data)
	s.mu.Unlock()

	select {
	case s.ended <- data:
	default:
	}
}

// published is how many run-end reports the spy has seen.
func (s *forfeitEmitterSpy) published() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	return len(s.captured)
}

// awaitEnd waits for the run's end report, or fails.
func (s *forfeitEmitterSpy) awaitEnd(t *testing.T) *types.RawMatchState {
	t.Helper()

	select {
	case ended := <-s.ended:
		return ended
	case <-time.After(forfeitSettle):
		t.Fatal("the run never reported its end")
		return nil
	}
}

// forfeitAssertRefused checks the one reply a refused forfeit_run gets: an
// error on the forfeit_run action carrying the given copy, top-level and in
// the payload. The hub's "Unknown action" fallback is an error on the action
// too, so the text is what tells a refusal from an action the hub does not
// know. FS-9K8EZ §Requirements 12; §WebSocket message surface.
func forfeitAssertRefused(t *testing.T, inbox *forfeitInbox, text string) {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), forfeitRunAction)
	require.True(t, answered, "forfeit_run was never answered")
	require.Equal(t, forfeitRunAction, reply.Action,
		"a refused forfeit_run is answered on its own action, not with %q", reply.Action)
	require.NotNil(t, reply.Error, "the refusal carries an error")
	assert.Equal(t, text, *reply.Error, "the refusal says why, in the words the delver can act on")
	assert.Equal(t, text, reply.Payload["message"], "and the same words reach the payload")
}

// forfeitAssertAccepted checks that forfeit_run got no reply at all: an
// accepted forfeit is answered by the next state frame, not a message.
// FS-9K8EZ §Requirements 10.
func forfeitAssertAccepted(t *testing.T, inbox *forfeitInbox) {
	t.Helper()

	replies := inbox.quiet(forfeitRunAction)
	for _, reply := range replies {
		assert.Fail(t, "an accepted forfeit_run sends no message",
			"got a reply on %q with error %q", reply.Action, forfeitErrorOf(reply))
	}
}

// forfeitPosition is the member's elimination position in the run's end
// report, and whether they fell at all.
func forfeitPosition(ended *types.RawMatchState, memberID uuid.UUID) (int, bool) {
	position, fell := ended.EliminationOrder[memberID]
	return position, fell
}

// forfeitMembersOf is every member the run's end report carries.
func forfeitMembersOf(ended *types.RawMatchState) []string {
	members := make([]string, 0, len(ended.Players))
	for _, player := range ended.Players {
		members = append(members, player.MemberID)
	}
	return members
}

// A member in play who forfeits is at 0 health in the next frame, with no
// reply of their own; the tick records their elimination with the next index
// (a teammate fell before them, so theirs is 1); the run goes on for the
// teammate still in play and ends, once, when that teammate resolves; the end
// report carries the fallen member with the position they died with.
// FS-9K8EZ §Requirements 10, 11, 14; §User Stories 11, 13, 14.
func TestForfeitRun_InPlayMemberFallsAndIsEliminated(t *testing.T) {
	spy := newForfeitEmitterSpy()
	server, hub := forfeitServer(t, spy)
	wren, wrenConn, wrenInbox := forfeitEnter(t, server, "Wren")
	kaelen, _, kaelenInbox := forfeitEnter(t, server, "Kaelen")
	mira, _, miraInbox := forfeitEnter(t, server, "Mira")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen, mira}})

	// Kaelen falls to a monster first and takes the first index
	forfeitKill(t, run, kaelen.ID)
	kaelenInbox.awaitFallen(t, run.ID, "Kaelen")
	kaelenInbox.awaitTicks(t, run.ID, 2)
	require.Positive(t, wrenInbox.ownHealth(t, run.ID), "Wren is in play before choosing to fall")

	forfeitSend(server, wrenConn, forfeitRunAction)

	forfeitAssertAccepted(t, wrenInbox)
	wrenInbox.awaitFallen(t, run.ID, "Wren")

	// the fallen member is where they were: in the run, not the hub
	for _, world := range forfeitWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, run.ID, world, "the record still names the run")
	}
	assert.True(t, run.HasPlayer(wren.ID), "the run keeps the fallen member's body")
	assert.False(t, hub.HasPlayer(wren.ID), "a chosen death does not seat anyone in the hub")

	// the run goes on for the teammate still in play
	miraInbox.awaitTicks(t, run.ID, 2)
	assert.Positive(t, miraInbox.ownHealth(t, run.ID), "the teammate is still in play")
	assert.False(t, run.Ended(), "the run goes on while a teammate is in play")
	assert.Zero(t, spy.published(), "the run ended while a member was still in play")

	// and ends, once, when that teammate resolves
	forfeitEscape(t, run, mira.ID)
	ended := spy.awaitEnd(t)

	home, sentHome := miraInbox.await(string(constants.ActionWorldEntered))
	require.True(t, sentHome, "the last member is sent home")
	assert.Equal(t, hub.ID.String(), home.Payload["session_id"])
	assert.Equal(t, 1, spy.published(), "the run ends once")

	assert.Equal(t, run.ID, ended.SessionID)
	assert.ElementsMatch(t, []string{wren.ID.String(), kaelen.ID.String(), mira.ID.String()}, forfeitMembersOf(ended),
		"match.ended carries every delver who was in the run, the one who chose to fall included")

	kaelenPosition, kaelenFell := forfeitPosition(ended, kaelen.ID)
	assert.True(t, kaelenFell)
	assert.Equal(t, 0, kaelenPosition, "first to fall")
	wrenPosition, wrenFell := forfeitPosition(ended, wren.ID)
	assert.True(t, wrenFell, "the chosen death is recorded as an elimination")
	assert.Equal(t, 1, wrenPosition, "with the next index")
	_, miraFell := forfeitPosition(ended, mira.ID)
	assert.False(t, miraFell, "the one who escaped did not fall")
}

// In a run of one, forfeiting ends the run on that tick: it reports its end
// once with the one player at elimination index 0, tells them end_game
// eliminated, and sends them home. FS-9K8EZ §Requirements 11; §User Stories 7;
// §Edge States "Dying" (solo run).
func TestForfeitRun_RunOfOneEndsAndSettles(t *testing.T) {
	spy := newForfeitEmitterSpy()
	server, hub := forfeitServer(t, spy)
	wren, wrenConn, wrenInbox := forfeitEnter(t, server, "Wren")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren}})
	t.Cleanup(run.Shutdown)
	wrenInbox.awaitTicks(t, run.ID, 1)
	require.Positive(t, wrenInbox.ownHealth(t, run.ID), "in play before choosing to fall")

	forfeitSend(server, wrenConn, forfeitRunAction)

	ended := spy.awaitEnd(t)

	// end_game lands before world_entered(hub): the run tells its delver how
	// it ended while they are still in it, then sends them home
	endGame, told := wrenInbox.await(string(constants.ActionEndGame))
	require.True(t, told, "the delver is told the run ended")
	assert.Equal(t, "eliminated", endGame.Payload["result"], "a chosen death ends the run as a death")
	assert.Equal(t, wren.ID.String(), endGame.Payload["player_id"])

	home, sentHome := wrenInbox.await(string(constants.ActionWorldEntered))
	require.True(t, sentHome, "the delver is sent home")
	assert.Equal(t, string(types.WorldTypeHub), home.Payload["world_type"])
	assert.Equal(t, hub.ID.String(), home.Payload["session_id"])

	assert.True(t, run.Ended(), "the run is over")
	_, stillHeld := server.GetGameSession(run.ID)
	assert.False(t, stillHeld, "and no longer held by the server")
	assert.True(t, hub.HasPlayer(wren.ID), "the delver is back in the hub")
	for _, world := range forfeitWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, hub.ID, world, "every record of the delver names the hub")
	}

	assert.Equal(t, run.ID, ended.SessionID)
	require.Len(t, ended.Players, 1, "match.ended carries the one delver")
	assert.Equal(t, wren.ID.String(), ended.Players[0].MemberID)
	position, fell := forfeitPosition(ended, wren.ID)
	assert.True(t, fell, "the chosen death is recorded as an elimination")
	assert.Equal(t, 0, position, "first and only to fall")

	// nothing further: the run ended once
	time.Sleep(forfeitQuiet)
	assert.Equal(t, 1, spy.published(), "the run ends once")
	assert.Empty(t, wrenInbox.quiet(forfeitRunAction), "an accepted forfeit_run sends no message of its own")
}

// A member standing in the hub is in no delve to forfeit: refused with the
// words for it, and they stay where they are. FS-9K8EZ §Requirements 12;
// §User Stories 12; §Edge States "Refusals".
func TestForfeitRun_RefusedFromTheHub(t *testing.T) {
	server, hub := forfeitServer(t, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := forfeitEnter(t, server, "Wren")
	require.True(t, hub.HasPlayer(wren.ID))

	forfeitSend(server, wrenConn, forfeitRunAction)

	forfeitAssertRefused(t, wrenInbox, forfeitNotInDelve)

	for _, world := range forfeitWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, hub.ID, world, "the record still names the hub")
	}
	assert.True(t, hub.HasPlayer(wren.ID), "still standing in the hub")
}

// A member already resolved, dead or escaped, cannot forfeit: refused with the
// words for it, and nothing changes. The run goes on for the teammate, and
// when it ends the resolved member is settled exactly as they were: the dead
// one with the one elimination they already had, the escaped one with none.
// FS-9K8EZ §Requirements 12; §User Stories 12; §Edge States "Refusals".
func TestForfeitRun_RefusedWhenResolved(t *testing.T) {
	tests := []struct {
		name string
		// resolve puts the member out of play and waits for the tick to see it
		resolve func(t *testing.T, run *game.Session, inbox *forfeitInbox, memberID uuid.UUID)
		// unchanged checks the frame after the refusal shows the same resolution
		unchanged func(t *testing.T, run *game.Session, inbox *forfeitInbox)
		// settled checks the end report shows the same resolution
		settled func(t *testing.T, ended *types.RawMatchState, memberID uuid.UUID)
	}{
		{
			name: "dead",
			resolve: func(t *testing.T, run *game.Session, inbox *forfeitInbox, memberID uuid.UUID) {
				forfeitKill(t, run, memberID)
				inbox.awaitFallen(t, run.ID, "the dead member")
			},
			unchanged: func(t *testing.T, run *game.Session, inbox *forfeitInbox) {
				assert.Zero(t, inbox.ownHealth(t, run.ID), "still dead")
				assert.Zero(t, inbox.escapedCount(t, run.ID), "nobody escaped")
			},
			settled: func(t *testing.T, ended *types.RawMatchState, memberID uuid.UUID) {
				position, fell := forfeitPosition(ended, memberID)
				assert.True(t, fell, "the death they already had")
				assert.Equal(t, 0, position)
				assert.Len(t, ended.EliminationOrder, 1, "and no second elimination")
			},
		},
		{
			name: "escaped",
			resolve: func(t *testing.T, run *game.Session, inbox *forfeitInbox, memberID uuid.UUID) {
				forfeitEscape(t, run, memberID)
				// an escaped delver is left out of the frame and counted instead
				inbox.awaitFrame(t, run.ID, "the tick has seen the escape", func(frame *types.ClientGameState) bool {
					return frame.EscapedCount > 0
				})
			},
			unchanged: func(t *testing.T, run *game.Session, inbox *forfeitInbox) {
				assert.Equal(t, 1, inbox.escapedCount(t, run.ID), "still escaped")
			},
			settled: func(t *testing.T, ended *types.RawMatchState, memberID uuid.UUID) {
				_, fell := forfeitPosition(ended, memberID)
				assert.False(t, fell, "an escaped delver did not fall")
				assert.Empty(t, ended.EliminationOrder, "nobody fell")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := newForfeitEmitterSpy()
			server, hub := forfeitServer(t, spy)
			wren, wrenConn, wrenInbox := forfeitEnter(t, server, "Wren")
			kaelen, _, kaelenInbox := forfeitEnter(t, server, "Kaelen")
			run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})

			tt.resolve(t, run, wrenInbox, wren.ID)

			forfeitSend(server, wrenConn, forfeitRunAction)

			forfeitAssertRefused(t, wrenInbox, forfeitAlreadyOut)

			for _, world := range forfeitWorldsOnRecord(t, server, wren.ID) {
				assert.Equal(t, run.ID, world, "the record still names the run")
			}
			assert.True(t, run.HasPlayer(wren.ID), "still in the run")
			assert.False(t, hub.HasPlayer(wren.ID), "no body in the hub")
			wrenInbox.awaitTicks(t, run.ID, 2)
			tt.unchanged(t, run, wrenInbox)
			assert.Positive(t, kaelenInbox.ownHealth(t, run.ID), "the teammate is untouched")
			assert.False(t, run.Ended(), "the run goes on")
			assert.Zero(t, spy.published())

			// the run ends when the teammate resolves, and settles the refused
			// member exactly as they were
			forfeitEscape(t, run, kaelen.ID)
			ended := spy.awaitEnd(t)
			tt.settled(t, ended, wren.ID)
		})
	}
}

// Two forfeit_run before the tick records the death: the first is accepted
// silently, the second finds health 0 and is refused as already out, and the
// run records one elimination. FS-9K8EZ §Edge States "Dying"; §User Stories 11.
func TestForfeitRun_TwiceIsOneDeath(t *testing.T) {
	spy := newForfeitEmitterSpy()
	server, hub := forfeitServer(t, spy)
	wren, wrenConn, wrenInbox := forfeitEnter(t, server, "Wren")
	kaelen, _, _ := forfeitEnter(t, server, "Kaelen")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})
	wrenInbox.awaitTicks(t, run.ID, 1)
	require.Positive(t, wrenInbox.ownHealth(t, run.ID), "in play before choosing to fall")

	forfeitSend(server, wrenConn, forfeitRunAction)
	forfeitSend(server, wrenConn, forfeitRunAction)

	replies := wrenInbox.quiet(forfeitRunAction)
	require.Len(t, replies, 1,
		"two forfeit_run get exactly one reply, the second's refusal; got %d", len(replies))
	require.NotNil(t, replies[0].Error, "the second forfeit_run is refused")
	assert.Equal(t, forfeitAlreadyOut, *replies[0].Error, "the second finds them already out")
	assert.Equal(t, forfeitAlreadyOut, replies[0].Payload["message"])

	wrenInbox.awaitFallen(t, run.ID, "Wren")
	assert.True(t, run.HasPlayer(wren.ID), "still in the run")
	assert.False(t, hub.HasPlayer(wren.ID), "no body in the hub")

	// one death, recorded once, settled once the teammate resolves
	forfeitEscape(t, run, kaelen.ID)
	ended := spy.awaitEnd(t)

	assert.Len(t, ended.EliminationOrder, 1, "one elimination record for two forfeits")
	position, fell := forfeitPosition(ended, wren.ID)
	assert.True(t, fell)
	assert.Equal(t, 0, position)
	assert.Equal(t, 1, spy.published(), "the run ends once")
}

// After falling by choice the member is a dead delver like any other: their
// leave_run (FS-QPDKN R13–14) is answered with world_entered(hub), they are
// seated in the hub, and the run keeps their body for settlement while the
// teammate plays on. FS-9K8EZ §Requirements 11; §User Stories 6.
func TestForfeitRun_ThenLeaveRunIsAccepted(t *testing.T) {
	server, hub := forfeitServer(t, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := forfeitEnter(t, server, "Wren")
	kaelen, _, kaelenInbox := forfeitEnter(t, server, "Kaelen")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})
	wrenInbox.awaitTicks(t, run.ID, 1)
	require.Positive(t, wrenInbox.ownHealth(t, run.ID), "in play before choosing to fall")

	forfeitSend(server, wrenConn, forfeitRunAction)
	wrenInbox.awaitFallen(t, run.ID, "Wren")

	forfeitSend(server, wrenConn, forfeitLeaveRunAction)

	reply, answered := wrenInbox.await(string(constants.ActionWorldEntered), forfeitLeaveRunAction)
	require.True(t, answered, "leave_run was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
		"a fallen delver's leave_run is answered with world_entered(hub); got %q with error %q",
		reply.Action, forfeitErrorOf(reply))
	assert.Equal(t, string(types.WorldTypeHub), reply.Payload["world_type"])
	assert.Equal(t, hub.ID.String(), reply.Payload["session_id"])

	for _, world := range forfeitWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, hub.ID, world, "every record of the leaver names the hub")
	}
	assert.True(t, hub.HasPlayer(wren.ID), "the leaver has a body in the hub")
	assert.True(t, run.HasPlayer(wren.ID), "the run keeps the leaver's body until it ends")

	kaelenInbox.awaitTicks(t, run.ID, 1)
	assert.Positive(t, kaelenInbox.ownHealth(t, run.ID), "the teammate plays on")
	assert.True(t, run.HasPlayer(kaelen.ID))
	assert.False(t, hub.HasPlayer(kaelen.ID))
	assert.False(t, run.Ended())
}
