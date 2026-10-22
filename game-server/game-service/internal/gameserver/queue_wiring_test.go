package gameserver

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
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

// queuedInHub sets up a player standing in the hub with a character, ready to
// send find_game / leave_queue.
func queuedInHub(t *testing.T, queue *mockQueueService) (*Server, *websocket.Conn, *types.Player, chan interface{}) {
	t.Helper()
	server := NewServer(context.Background(), &MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	msgCh := registerTestConn(server, conn, player)
	_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Wren"})
	require.NoError(t, err)

	return server, conn, player, msgCh
}

func send(server *Server, conn *websocket.Conn, action constants.Action) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: string(action), Payload: map[string]interface{}{}},
	}
}

// Queueing twice is refused quietly, as before the queue moved to Redis; the
// refusal is not reported as a failure to queue. FS-K2HKP §Requirements 6.
func TestFindGame_Twice_IsNotReportedAsAQueueFailure(t *testing.T) {
	queue := NewMockQueueService()
	server, conn, _, msgCh := queuedInHub(t, queue)

	send(server, conn, constants.ActionFindGame)
	joined := awaitAction(t, msgCh, constants.ActionFindGame)
	require.Nil(t, joined.Error)

	send(server, conn, constants.ActionFindGame)

	timeout := time.After(500 * time.Millisecond)
	for {
		select {
		case raw := <-msgCh:
			msg, ok := raw.(types.Message)
			if ok && msg.Action == string(constants.ActionFindGame) {
				assert.Nil(t, msg.Error, "a double join must not surface as a queue failure: %v", msg.Payload)
			}
		case <-timeout:
			return
		}
	}
}

// leave_queue removes the player before it says so. FS-K2HKP §Requirements 7.
func TestLeaveQueue_RemovesThePlayerBeforeReplying(t *testing.T) {
	queue := NewMockQueueService()
	server, conn, player, msgCh := queuedInHub(t, queue)

	send(server, conn, constants.ActionLeaveQueue)
	reply := awaitAction(t, msgCh, constants.ActionLeaveQueue)

	assert.Nil(t, reply.Error)
	assert.Equal(t, []uuid.UUID{player.ID}, queue.removedPlayers(), "replied without removing anyone")
}

func TestLeaveQueue_RemovalFails_RepliesWithAnError(t *testing.T) {
	queue := NewMockQueueService()
	queue.removeErr = errors.New("redis down")
	server, conn, _, msgCh := queuedInHub(t, queue)

	send(server, conn, constants.ActionLeaveQueue)
	reply := awaitAction(t, msgCh, constants.ActionLeaveQueue)

	require.NotNil(t, reply.Error, "a failed removal must not be reported as success")
}

// serverSideConn returns the server end of a real websocket, so cleanUpClient
// can close it.
func serverSideConn(t *testing.T) *websocket.Conn {
	t.Helper()
	conns := make(chan *websocket.Conn, 1)
	upgrader := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := upgrader.Upgrade(w, r, nil)
		if err == nil {
			conns <- c
		}
	}))
	t.Cleanup(srv.Close)

	client, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = client.Close() })

	select {
	case c := <-conns:
		return c
	case <-time.After(2 * time.Second):
		t.Fatal("websocket never upgraded")
		return nil
	}
}

func cleanUpWithin(t *testing.T, server *Server, conn *websocket.Conn) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		server.cleanUpClient(conn)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("cleanUpClient never returned")
	}
}

// A normal close is leaving: the player is dequeued and forgotten, and the
// server lock is released for everyone else. FS-K2HKP §Requirements 8.
func TestCleanUpClient_KnownPlayer_DequeuesForgetsAndReleasesTheLock(t *testing.T) {
	queue := NewMockQueueService()
	server := NewServer(context.Background(), &MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	conn := serverSideConn(t)
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)

	cleanUpWithin(t, server, conn)

	require.True(t, server.mu.TryLock(), "cleanUpClient left the server lock held")
	_, connKnown := server.connToPlayer[conn]
	_, playerKnown := server.players[player.ID]
	server.mu.Unlock()

	assert.False(t, connKnown)
	assert.False(t, playerKnown)
	require.Eventually(t, func() bool {
		return len(queue.removedPlayers()) == 1
	}, 2*time.Second, 10*time.Millisecond, "player never dequeued")
	assert.Equal(t, player.ID, queue.removedPlayers()[0])
}

func TestCleanUpClient_UnknownConn_ReleasesTheLockWithoutPanicking(t *testing.T) {
	queue := NewMockQueueService()
	server := NewServer(context.Background(), &MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	conn := serverSideConn(t)

	cleanUpWithin(t, server, conn)

	require.True(t, server.mu.TryLock(), "cleanUpClient left the server lock held")
	server.mu.Unlock()
	assert.Empty(t, queue.removedPlayers(), "nobody to dequeue")
}
