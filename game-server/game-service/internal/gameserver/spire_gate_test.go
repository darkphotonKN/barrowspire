package gameserver

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-0XMCP §Requirements 12–14; §Acceptance Criteria 7–10; §Edge States
// "Already in a run", "Unauthorized / modified client". I-0XMCP-4.
//
// The Spire is entered at its door. find_game and start_solo are refused from
// anywhere else in the hub, so a client that skips the walk queues nobody.
//
// At the door both behave exactly as before: that is proven by the existing
// find_game and start_solo tests, which now walk to the door first
// (TestFindGame_FromTheHub_Queues, TestTwoDelversDescend_MatchIntoOneRun,
// TestStartSolo_CreatesARunOfOne and the rest).

// spireGateRefusalCopy is the walk refusal, word for word. FS-0XMCP R12.
const spireGateRefusalCopy = "Walk to the Spire's door first."

// spireGateWalk bounds a walk from the spawn to the Spire's door: about 670 px
// at walking pace, with room for a slow machine under -race.
const spireGateWalk = 10 * time.Second

// walkToSpireGate walks the member north from the spawn until the hub, on its
// own tick, has them standing at the Spire's door. The walk keeps pressing
// north, so the world's edge holds them inside the door's range.
func walkToSpireGate(t *testing.T, server *Server, conn *websocket.Conn, playerID uuid.UUID) {
	t.Helper()

	hub := headForSpireGate(t, server, conn, playerID)

	require.Eventually(t, func() bool {
		return hub.AtGate(playerID, components.GateDestinationSpire)
	}, spireGateWalk, 20*time.Millisecond, "never reached the Spire's door on foot")
}

// headForSpireGate sets the member walking north, toward the Spire's door, and
// returns the hub they walk in. It does not wait for them to arrive.
func headForSpireGate(t *testing.T, server *Server, conn *websocket.Conn, playerID uuid.UUID) *game.Session {
	t.Helper()

	hub, ok := server.HubSession()
	require.True(t, ok, "the server builds a hub at startup")

	hub.MessageCh <- types.ClientPackage{
		Conn: conn,
		Message: types.Message{
			Action: string(constants.ActionMove),
			Payload: map[string]interface{}{
				"player_id": playerID.String(),
				"vx":        0.0,
				"vy":        -1.0,
			},
		},
	}

	return hub
}

// drainWriter empties a test connection's writer channel. Nothing reads it
// during a walk, and a full channel drops the next reply.
func drainWriter(msgCh chan interface{}) {
	for {
		select {
		case <-msgCh:
		default:
			return
		}
	}
}

// find_game from the spawn, nowhere near the door: refused with the walk
// message, and the queue is never asked to take them. FS-0XMCP R12, R14.
func TestFindGame_AwayFromTheSpireGate_IsRefused(t *testing.T) {
	queue := newStartSoloQueue()
	server, _ := startSoloServer(t, queue, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")

	send(server, wrenConn, constants.ActionFindGame)

	reply, answered := wrenInbox.await(string(constants.ActionFindGame))
	require.True(t, answered, "find_game was never answered")
	require.NotNil(t, reply.Error, "find_game away from the door was accepted")
	assert.Equal(t, spireGateRefusalCopy, *reply.Error)
	assert.Equal(t, spireGateRefusalCopy, reply.Payload["message"], "the same words on the error and in the payload")

	assert.Zero(t, queue.joinCalls(), "the queue was asked to take them")
	assert.False(t, queue.holds(wren), "they were queued")
}

// start_solo from the spawn: refused with the walk message, and no run is
// built. FS-0XMCP R12.
func TestStartSolo_AwayFromTheSpireGate_IsRefused(t *testing.T) {
	queue := newStartSoloQueue()
	server, hub := startSoloServer(t, queue, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")
	worldsBefore := startSoloSessionCount(server)

	startSoloSend(server, wrenConn)

	startSoloAssertRefused(t, wrenInbox, spireGateRefusalCopy)

	assert.Equal(t, worldsBefore, startSoloSessionCount(server), "a run was built")
	assert.True(t, hub.HasPlayer(wren.ID), "still standing in the hub")
	assert.Equal(t, hub.ID, startSoloWorldOnRecord(t, server, wren.ID), "the record still names the hub")
	assert.Zero(t, queue.joinCalls())
}

// A member already in a run is resumed, wherever they last stood in the hub:
// the resume comes before the gate is looked at. FS-0XMCP R12; §Edge States
// "Already in a run".
func TestFindGame_InARun_ResumesWhereverTheyStood(t *testing.T) {
	queue := newStartSoloQueue()
	server, _ := startSoloServer(t, queue, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")

	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren}})
	t.Cleanup(run.Shutdown)
	require.Equal(t, run.ID, startSoloWorldOnRecord(t, server, wren.ID))

	send(server, wrenConn, constants.ActionFindGame)

	reply, answered := wrenInbox.await(string(constants.ActionWorldEntered), string(constants.ActionFindGame))
	require.True(t, answered, "find_game was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
		"find_game from a member in a run resumes it; got %q with error %q", reply.Action, startSoloErrorOf(reply))
	assert.Equal(t, run.ID.String(), reply.Payload["session_id"], "the run they are already in")
	assert.Zero(t, queue.joinCalls(), "a member in a run is never queued")
}

// leave_queue is not bound to the door: a queued member leaves from the spawn.
// FS-0XMCP R13.
func TestLeaveQueue_AwayFromTheSpireGate_Leaves(t *testing.T) {
	queue := newStartSoloQueue()
	server, _ := startSoloServer(t, queue, &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")
	queue.hold(wren)

	send(server, wrenConn, constants.ActionLeaveQueue)

	reply, answered := wrenInbox.await(string(constants.ActionLeaveQueue))
	require.True(t, answered, "leave_queue was never answered")
	assert.Nil(t, reply.Error, "leave_queue away from the door was refused: %q", startSoloErrorOf(reply))
	assert.Equal(t, []uuid.UUID{wren.ID}, queue.removedPlayers(), "they were not taken out of the queue")
}
