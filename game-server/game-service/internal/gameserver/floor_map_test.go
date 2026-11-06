package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// awaitFloorMapOf waits for the run's floor_map on inbox, after whatever was
// already read from it, and checks it is run's current floor's.
func awaitFloorMapOf(t *testing.T, inbox *startSoloInbox, run *game.Session, who string) types.Message {
	t.Helper()
	floorMap, got := inbox.await(string(constants.ActionFloorMap))
	require.True(t, got, "%s was never sent the run's floor_map", who)
	want, ok := run.FloorMapMessage()
	require.True(t, ok, "the run has a floor map")
	assert.Equal(t, want, floorMap, "%s: the run's current floor", who)
	assert.Equal(t, run.ID.String(), floorMap.Payload["session_id"], who)
	return floorMap
}

// drained is everything queued on msgChan, in order.
func drained(msgChan chan interface{}) []types.Message {
	close(msgChan)
	var out []types.Message
	for raw := range msgChan {
		if msg, ok := raw.(types.Message); ok {
			out = append(out, msg)
		}
	}
	return out
}

// A run entered on a fresh connection after a drop is announced, then mapped:
// world_entered and the floor's map, in that order, ahead of anything else.
// FS-KE075 §F Requirement 32 (reconnect, incl. FS-MCYWK's holding pod).
func TestReconnect_IntoARun_WorldEnteredThenFloorMap(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren", Character: types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "mage"}}
	registerTestConn(server, conn, player)
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{player}})
	t.Cleanup(run.Shutdown)
	record := recordOf(t, server, player.ID)

	msgChan := make(chan interface{}, clientWriterBuffer)
	server.announceCurrentWorld(msgChan, &record)

	sent := drained(msgChan)
	require.Len(t, sent, 2)
	assert.Equal(t, worldEnteredMessage(run), sent[0])
	floorMap, _ := run.FloorMapMessage()
	assert.Equal(t, floorMap, sent[1])
}

// The hub and the fields have no floor map: a reconnect into one is announced
// alone, as today.
func TestReconnect_IntoTheHub_NoFloorMap(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Wren"})
	require.NoError(t, err)

	msgChan := make(chan interface{}, clientWriterBuffer)
	server.announceCurrentWorld(msgChan, player)

	sent := drained(msgChan)
	require.Len(t, sent, 1)
	assert.Equal(t, string(constants.ActionWorldEntered), sent[0].Action)
}

// A member already in a run who asks to descend again is told the run and
// sent its map. FS-KE075 §F Requirement 32 (hub.go's resume).
func TestStartSolo_ResumedRunIsMappedAgain(t *testing.T) {
	server, _ := startSoloServer(t, newStartSoloQueue(), &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren}})
	t.Cleanup(run.Shutdown)

	startSoloSend(server, wrenConn)

	reply, answered := wrenInbox.await(string(constants.ActionWorldEntered), startSoloAction)
	require.True(t, answered)
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action)
	awaitFloorMapOf(t, wrenInbox, run, "Wren")
}

// sendRequestFloorMap sends request_floor_map as the client does: no payload
// but the player id its socket adds.
func sendRequestFloorMap(server *Server, conn *websocket.Conn) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: string(constants.ActionRequestFloorMap), Payload: map[string]interface{}{}},
	}
}

// A delver in a run who asks for the floor's map is sent it. FS-KE075 §F R33.
func TestRequestFloorMap_InARun_Answered(t *testing.T) {
	server, _ := startSoloServer(t, newStartSoloQueue(), &MockEventEmitter{})
	wren, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")
	walkToSpireGate(t, server, wrenConn, wren.ID)
	startSoloSend(server, wrenConn)
	run := startSoloAwaitRun(t, server, wrenInbox)

	sendRequestFloorMap(server, wrenConn)

	awaitFloorMapOf(t, wrenInbox, run, "Wren")
}

// Outside a run the request is ignored: no map, and no refusal either.
func TestRequestFloorMap_OutsideARun_Ignored(t *testing.T) {
	server, _ := startSoloServer(t, newStartSoloQueue(), &MockEventEmitter{})
	_, wrenConn, wrenInbox := startSoloEnter(t, server, "Wren")

	sendRequestFloorMap(server, wrenConn)

	reply, got := wrenInbox.await(string(constants.ActionFloorMap), string(constants.ActionRequestFloorMap))
	assert.False(t, got, "answered with %q", reply.Action)
}

// One connection's requests are answered at most once a second; another
// connection has its own second. FS-KE075 §F Requirement 33.
func TestFloorMapAnswers_AtMostOnceASecondPerConnection(t *testing.T) {
	t0 := time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	wren, kaelen := &websocket.Conn{}, &websocket.Conn{}

	tests := []struct {
		name string
		conn *websocket.Conn
		at   time.Duration
		want bool
	}{
		{"the first ask", wren, 0, true},
		{"again at once", wren, 0, false},
		{"again inside the second", wren, 999 * time.Millisecond, false},
		{"another connection inside it", kaelen, 500 * time.Millisecond, true},
		{"a second after the answer", wren, time.Second, true},
		{"the other, a second after its own", kaelen, 1500 * time.Millisecond, true},
	}

	var answers floorMapAnswers
	for _, tt := range tests {
		assert.Equal(t, tt.want, answers.allow(tt.conn, t0.Add(tt.at)), tt.name)
	}
	assert.LessOrEqual(t, len(answers.last), 2, "only the last second's answers are kept")
}
