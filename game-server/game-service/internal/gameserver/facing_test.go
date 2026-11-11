package gameserver

import (
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-JS7C8 §E R30–R31: the message hub routes `face` to the sender's own world
// like the other in-game actions, and logs it at Debug, never at Info: a
// client may send up to 10 a second. A face from a player in no world is
// dropped with nothing sent back. I-JS7C8-2.

const faceAction = "face"

func faceFrom(conn *websocket.Conn, player *types.Player, facing string) types.ClientPackage {
	return types.ClientPackage{Conn: conn, Message: types.Message{
		Action:  faceAction,
		Payload: map[string]interface{}{"player_id": player.ID.String(), "facing": facing},
	}}
}

// debugLogs sends every log line, Debug up, to a sink for the test.
func debugLogs(t *testing.T) *lockedLog {
	t.Helper()
	sink := &lockedLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return sink
}

// assertFaceLoggedAtDebugOnly checks every log line that mentions a face.
func assertFaceLoggedAtDebugOnly(t *testing.T, sink *lockedLog) {
	t.Helper()
	for _, line := range strings.Split(sink.String(), "\n") {
		if strings.Contains(line, faceAction) {
			assert.Contains(t, line, "level=DEBUG", "a face is never logged above Debug: %s", line)
		}
	}
}

func TestHubRun_Face_RoutedToTheSendersOwnWorldAndLoggedAtDebug(t *testing.T) {
	sink := debugLogs(t)
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	ownID := uuid.New()
	own := registerRoutableSession(server, ownID)
	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren", CurrentGameSessionId: ownID}
	registerTestConn(server, conn, player)

	server.serverChan <- faceFrom(conn, player, "nw")

	select {
	case delivered := <-own.MessageCh:
		assert.Equal(t, faceAction, delivered.Message.Action)
		assert.Equal(t, "nw", delivered.Message.Payload["facing"])
	case <-time.After(2 * time.Second):
		t.Fatal("face was never routed to the player's world")
	}
	assertFaceLoggedAtDebugOnly(t, sink)
}

// A face from a player in no world is dropped: no refusal comes back, and
// nothing about it is logged above Debug. A move sent after it is still
// refused, so the first reply shows whether the face drew one.
func TestHubRun_Face_FromAPlayerInNoWorldIsDroppedQuietly(t *testing.T) {
	sink := debugLogs(t)
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	inbox := startSoloListen(t, server, conn)

	server.serverChan <- faceFrom(conn, player, "nw")
	server.serverChan <- types.ClientPackage{Conn: conn, Message: types.Message{
		Action:  string(constants.ActionMove),
		Payload: map[string]interface{}{"player_id": player.ID.String(), "vx": 1.0, "vy": 0.0},
	}}

	reply, answered := inbox.await(faceAction, string(constants.ActionMove))
	require.True(t, answered, "the move is refused")
	assert.Equal(t, string(constants.ActionMove), reply.Action, "the face drew no reply")
	assertFaceLoggedAtDebugOnly(t, sink)
}
