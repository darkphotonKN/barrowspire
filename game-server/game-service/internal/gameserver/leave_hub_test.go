package gameserver

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-G4VMQ §Requirements 23–24, 26–28 (Amendment 2026-10-29); §WebSocket
// message surface. I-G4VMQ-3, RED half: the implementation is human lane.
//
// leave_hub is an inbound action on the message hub's loop, beside leave_run.
// A hub member who is not queued leaves the hub for no world at all: their
// body goes, their record names uuid.Nil, and the record itself (token,
// character) stays so a later enter_hub seats them again. The tests drive the
// hub exactly as a client would: a message on the server channel, routed on
// the sender's record, answered on the sender's writer channel.

// leaveHubAction is the inbound action under test, spelled as the client sends
// it; leaveHubWorldLeft is its reply. The constants beside leave_run are the
// implementation's to add.
const (
	leaveHubAction    = "leave_hub"
	leaveHubWorldLeft = "world_left"
)

// The refusals, word for word. FS-G4VMQ §Requirements 24.
const (
	leaveHubQueuedCopy  = "Leave the queue first."
	leaveHubInRunCopy   = "You are in a delve."
	leaveHubNoWorldCopy = "You are not in the hub."
)

// leaveHubServer is a server with a live hub over the given queue, the
// characters it resolves entry against, and the rest the usual mocks. The
// queue is the start_solo one: its hold/holds are how a test says "queued".
func leaveHubServer(t *testing.T, queue *startSoloQueue) (*Server, *game.Session, *fakeCharacters) {
	t.Helper()

	characters := newFakeCharacters()
	server := newTestServer(t, context.Background(), &MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, characters, testPodID, testPodAddr, noopAnnouncer{})
	hub, ok := server.HubSession()
	require.True(t, ok, "the server builds a hub at startup")

	return server, hub, characters
}

// leaveHubEnter seats a fresh member in the hub as a character
// character-service knows (so enter_hub can resolve it again later) and
// listens on their connection.
func leaveHubEnter(t *testing.T, server *Server, characters *fakeCharacters, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: name}
	registerTestConn(server, conn, player)

	character := characters.give(player.ID, "mage", name, 1, 0)
	_, err := server.JoinHub(conn, character)
	require.NoError(t, err)
	require.Equal(t, character, player.Character, "the character in play is on the record")

	return player, conn, startSoloListen(t, server, conn)
}

// leaveHubSend sends leave_hub as the client does: no payload, routed on the
// sender's record (FS-G4VMQ §Requirements 23).
func leaveHubSend(server *Server, conn *websocket.Conn) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: leaveHubAction},
	}
}

// leaveHubAwaitLeft waits for leave_hub to be answered with world_left. Any
// other answer, including the hub's "Unknown action" fallback and a refusal,
// fails here with its text. FS-G4VMQ §Requirements 23.
func leaveHubAwaitLeft(t *testing.T, inbox *startSoloInbox) {
	t.Helper()

	reply, answered := inbox.await(leaveHubWorldLeft, leaveHubAction)
	require.True(t, answered, "leave_hub was never answered")
	require.Equal(t, leaveHubWorldLeft, reply.Action,
		"an accepted leave_hub is answered with world_left; got %q with error %q",
		reply.Action, startSoloErrorOf(reply))
	assert.Nil(t, reply.Error, "world_left is not an error")
}

// leaveHubAssertRefused checks the one reply a refused leave_hub gets: an
// error on the leave_hub action carrying the given copy, top-level and in the
// payload. The hub's "Unknown action" fallback is an error on the action too,
// so the text is what tells a refusal from an action the hub does not know.
// FS-G4VMQ §Requirements 24.
func leaveHubAssertRefused(t *testing.T, inbox *startSoloInbox, text string) {
	t.Helper()

	reply, answered := inbox.await(leaveHubWorldLeft, leaveHubAction)
	require.True(t, answered, "leave_hub was never answered")
	require.Equal(t, leaveHubAction, reply.Action,
		"a refused leave_hub is answered on its own action, not with %q", reply.Action)
	require.NotNil(t, reply.Error, "the refusal carries an error")
	assert.Equal(t, text, *reply.Error, "the refusal says why, in the words the delver can act on")
	assert.Equal(t, text, reply.Payload["message"], "and the same words reach the payload")
}

// A hub member who is not queued leaves: the reply is world_left, their body
// is gone from the hub, every copy of their record names no world, and the
// record itself stays with the character they entered as.
// FS-G4VMQ §Requirements 23, 27; §User Stories 4.
func TestLeaveHub_FreesTheHubAndForgetsTheWorld(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub, characters := leaveHubServer(t, queue)
	wren, wrenConn, wrenInbox := leaveHubEnter(t, server, characters, "Wren")
	character := wren.Character
	require.True(t, hub.HasPlayer(wren.ID))

	leaveHubSend(server, wrenConn)

	leaveHubAwaitLeft(t, wrenInbox)

	assert.False(t, hub.HasPlayer(wren.ID), "the hub no longer holds their body")
	assert.Zero(t, entityCountFor(hub.EntityManager.GetAllEntities(), wren.ID), "no body left standing in the hub")
	for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, uuid.Nil, world, "every copy of the record names no world")
	}

	record, onRecord := server.PlayerByID(wren.ID)
	require.True(t, onRecord, "leaving the hub is not leaving the server: the record stays")
	assert.Equal(t, character, record.Character, "with the character they entered as")
	assert.Equal(t, constants.Connected, connStateOf(t, server, wren.ID), "still connected")

	assert.Zero(t, queue.joinCalls(), "the queue had no part in it")
}

// After leaving, enter_hub with a character seats them in the hub again,
// through the ordinary entry: world_entered(hub), a body, a record naming the
// hub. FS-G4VMQ §Requirements 23, 27; §User Stories 5, 7.
func TestLeaveHub_ThenEnterHubSeatsAgain(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub, characters := leaveHubServer(t, queue)
	wren, wrenConn, wrenInbox := leaveHubEnter(t, server, characters, "Wren")
	character := wren.Character

	leaveHubSend(server, wrenConn)
	leaveHubAwaitLeft(t, wrenInbox)
	require.False(t, hub.HasPlayer(wren.ID), "the leave must have freed the hub before re-entry can be checked")

	sendEnterHub(server, wrenConn, map[string]interface{}{"characterId": character.ID.String()})

	reply, answered := wrenInbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterHub))
	require.True(t, answered, "enter_hub was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
		"enter_hub after leaving is answered with world_entered(hub); got %q with error %q",
		reply.Action, startSoloErrorOf(reply))
	assert.Equal(t, string(types.WorldTypeHub), reply.Payload["world_type"])
	assert.Equal(t, hub.ID.String(), reply.Payload["session_id"])

	assert.True(t, hub.HasPlayer(wren.ID), "seated in the hub again")
	assert.Equal(t, 1, entityCountFor(hub.EntityManager.GetAllEntities(), wren.ID), "with one body")
	for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, hub.ID, world, "every copy of the record names the hub")
	}
	record, onRecord := server.PlayerByID(wren.ID)
	require.True(t, onRecord)
	assert.Equal(t, character, record.Character, "as the character they picked")
}

// A member who left the hub and then reconnects is announced no world: their
// record names uuid.Nil, so announceCurrentWorld sends nothing and the client
// boots to the main menu. FS-G4VMQ §Requirements 26.
func TestLeaveHub_ThenReconnectAnnouncesNoWorld(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub, characters := leaveHubServer(t, queue)
	wren, wrenConn, wrenInbox := leaveHubEnter(t, server, characters, "Wren")

	leaveHubSend(server, wrenConn)
	leaveHubAwaitLeft(t, wrenInbox)

	// the socket drops (a refresh) and comes back within the grace
	_, _, held := server.holdForReconnect(wrenConn)
	require.True(t, held, "the connection carried the member")

	record, reconnected := server.connectPlayer(wren.ID, "Wren", "token")
	require.True(t, reconnected, "a member who left the hub is still on record, so this is a reconnect")
	assert.Equal(t, uuid.Nil, record.CurrentGameSessionId, "their record names no world")

	msgChan := make(chan interface{}, clientWriterBuffer)
	server.announceCurrentWorld(msgChan, &record)

	newConn := &websocket.Conn{}
	_, mapped := server.MapConnToPlayer(newConn, wren.ID, msgChan)
	require.True(t, mapped)

	world, announced := resolvedDropWorldEntered(t, msgChan)
	assert.False(t, announced, "a member in no world is announced nothing; got world_entered for %v", world.Payload["session_id"])

	assert.False(t, hub.HasPlayer(wren.ID), "the reconnect seats nobody in the hub")
	assert.Equal(t, constants.Connected, connStateOf(t, server, wren.ID))
	routed, ok := server.GetPlayerFromConn(newConn)
	require.True(t, ok)
	assert.Equal(t, uuid.Nil, routed.CurrentGameSessionId, "the new connection routes to no world")
}

// A queued member cannot leave the hub: the reply says to leave the queue
// first, and they stay in the hub, still queued. The queue's own entry is what
// says they are queued, as start_solo reads it. FS-G4VMQ §Requirements 24;
// §User Stories 8.
func TestLeaveHub_RefusedWhileQueued(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub, characters := leaveHubServer(t, queue)
	wren, wrenConn, wrenInbox := leaveHubEnter(t, server, characters, "Wren")
	queue.hold(wren)
	require.True(t, queue.holds(wren))

	leaveHubSend(server, wrenConn)

	leaveHubAssertRefused(t, wrenInbox, leaveHubQueuedCopy)

	assert.True(t, queue.holds(wren), "still queued")
	assert.True(t, hub.HasPlayer(wren.ID), "still standing in the hub")
	for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, hub.ID, world, "the record still names the hub")
	}
	assert.Empty(t, queue.removedPlayers(), "the queue was not asked to drop them")
}

// A member whose record names a run is not in the hub to leave: refused, and
// nothing moves. FS-G4VMQ §Requirements 24.
func TestLeaveHub_RefusedFromARun(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub, characters := leaveHubServer(t, queue)
	wren, wrenConn, wrenInbox := leaveHubEnter(t, server, characters, "Wren")

	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren}})
	t.Cleanup(run.Shutdown)
	require.True(t, run.HasPlayer(wren.ID))
	require.False(t, hub.HasPlayer(wren.ID))

	leaveHubSend(server, wrenConn)

	leaveHubAssertRefused(t, wrenInbox, leaveHubInRunCopy)

	assert.True(t, run.HasPlayer(wren.ID), "still in the run")
	assert.False(t, hub.HasPlayer(wren.ID), "no body in the hub")
	for _, world := range leaveRunWorldsOnRecord(t, server, wren.ID) {
		assert.Equal(t, run.ID, world, "the record still names the run")
	}
	_, onRecord := server.PlayerByID(wren.ID)
	assert.True(t, onRecord, "the record stays")
}

// A connected member who never entered any world has no hub to leave:
// refused, and nothing changes. FS-G4VMQ §Requirements 24.
func TestLeaveHub_RefusedInNoWorld(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub, _ := leaveHubServer(t, queue)

	conn := &websocket.Conn{}
	nobody := &types.Player{ID: uuid.New(), Username: "Nobody"}
	registerTestConn(server, conn, nobody)
	inbox := startSoloListen(t, server, conn)
	require.Equal(t, uuid.Nil, nobody.CurrentGameSessionId, "in no world")

	leaveHubSend(server, conn)

	leaveHubAssertRefused(t, inbox, leaveHubNoWorldCopy)

	assert.False(t, hub.HasPlayer(nobody.ID), "not seated anywhere")
	for _, world := range leaveRunWorldsOnRecord(t, server, nobody.ID) {
		assert.Equal(t, uuid.Nil, world, "the record still names no world")
	}
	_, onRecord := server.PlayerByID(nobody.ID)
	assert.True(t, onRecord, "the record stays")
}

// A member who left the hub and then drops past the reconnect grace is
// cleaned up as any dropped member in no world: their record goes, and there
// is nothing in any world to remove. FS-G4VMQ §Requirements 28.
func TestLeaveHub_ThenGraceEndCleansUp(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub, characters := leaveHubServer(t, queue)
	wren, wrenConn, wrenInbox := leaveHubEnter(t, server, characters, "Wren")
	bystander, _, _ := leaveHubEnter(t, server, characters, "Bystander")

	leaveHubSend(server, wrenConn)
	leaveHubAwaitLeft(t, wrenInbox)
	require.False(t, hub.HasPlayer(wren.ID), "the leave must have freed the hub before the grace end can be checked")

	resolvedDropPastGrace(t, server, wrenConn)

	_, onRecord := server.PlayerByID(wren.ID)
	assert.False(t, onRecord, "a member in no world is off record at grace end")
	assert.False(t, hub.HasPlayer(wren.ID), "and has no body in the hub")
	assert.Zero(t, entityCountFor(hub.EntityManager.GetAllEntities(), wren.ID))
	_, mapped := server.GetPlayerFromConn(wrenConn)
	assert.False(t, mapped, "the dropped connection is unmapped")

	assert.True(t, hub.HasPlayer(bystander.ID), "the member still in the hub is untouched")
	assert.Equal(t, hub.ID, recordOf(t, server, bystander.ID).CurrentGameSessionId)
}
