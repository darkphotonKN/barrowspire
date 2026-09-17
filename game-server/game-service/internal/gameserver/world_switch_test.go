package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// enterHub puts a fresh player in the hub and returns them with their connection.
func enterHub(t *testing.T, server *Server, name string) (*types.Player, *websocket.Conn) {
	t.Helper()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: name}
	registerTestConn(server, conn, player)

	_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: name})
	require.NoError(t, err)

	return player, conn
}

// A player is in one world at a time. Matching moves them; it does not copy them.
// FS-29KSH §Requirements 20-21, 23.
func TestCreateGameSession_MovesPlayersOutOfTheHub(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()

	wren, _ := enterHub(t, server, "Wren")
	kaelen, _ := enterHub(t, server, "Kaelen")

	require.True(t, hub.HasPlayer(wren.ID))
	require.True(t, hub.HasPlayer(kaelen.ID))

	run := server.CreateGameSession([]*types.Player{wren, kaelen})

	for _, player := range []*types.Player{wren, kaelen} {
		assert.True(t, run.HasPlayer(player.ID), "%s should be in the run", player.Username)
		assert.False(t, hub.HasPlayer(player.ID),
			"%s is still standing in the hub while delving", player.Username)
		assert.Equal(t, run.ID, player.CurrentGameSessionId)
	}
}

// A run ends and everyone comes home. Escape and death land in the same place;
// the world they were in no longer exists, so leaving them pointed at it would
// strand them. FS-29KSH §Requirements 22.
func TestRunEnds_ReturnsPlayersToTheHub(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()

	wren, _ := enterHub(t, server, "Wren")
	kaelen, _ := enterHub(t, server, "Kaelen")

	run := server.CreateGameSession([]*types.Player{wren, kaelen})
	require.False(t, hub.HasPlayer(wren.ID))

	server.ReturnPlayersToHub(run.ID)

	for _, player := range []*types.Player{wren, kaelen} {
		assert.True(t, hub.HasPlayer(player.ID), "%s never came home", player.Username)
		assert.Equal(t, hub.ID, player.CurrentGameSessionId,
			"%s still points at the run that ended", player.Username)
	}
}

// The connection is the thing that must not break. ADR-0015 chose one socket for
// the whole session over refactor_plan's two-connection handoff precisely so that
// nothing can fail between worlds — so the switch has to be observably internal.
// FS-29KSH §Requirements 20.
func TestWorldSwitch_KeepsTheSameConnection(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})

	wren, wrenConn := enterHub(t, server, "Wren")
	kaelen, kaelenConn := enterHub(t, server, "Kaelen")

	// The writer channel is the observable proxy for the socket itself: tearing a
	// connection down and standing a new one up replaces it. A handoff would.
	before := map[*websocket.Conn]chan interface{}{}
	for _, conn := range []*websocket.Conn{wrenConn, kaelenConn} {
		server.mu.RLock()
		before[conn] = server.msgChan[conn]
		server.mu.RUnlock()
	}

	run := server.CreateGameSession([]*types.Player{wren, kaelen})
	server.ReturnPlayersToHub(run.ID)

	for conn, original := range before {
		server.mu.RLock()
		current, stillRegistered := server.msgChan[conn]
		_, playerStillMapped := server.connToPlayer[conn]
		server.mu.RUnlock()

		require.True(t, stillRegistered, "the connection was torn down during the round trip")
		require.True(t, playerStillMapped, "the connection lost its player during the round trip")
		assert.Equal(t, original, current,
			"the writer channel was replaced, so this was a handoff and not a world switch")
	}
}

// Being in a run means being absent from the hub, not merely marked as away:
// the hub broadcasts what it holds, so anyone still held is still seen.
// FS-29KSH §Requirements 23.
func TestDelvingPlayer_IsAbsentFromTheHubBroadcast(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()

	wren, _ := enterHub(t, server, "Wren")
	kaelen, _ := enterHub(t, server, "Kaelen")
	watcher, _ := enterHub(t, server, "Watcher")

	require.ElementsMatch(t, []uuid.UUID{wren.ID, kaelen.ID, watcher.ID}, hub.GetPlayerIDs())

	run := server.CreateGameSession([]*types.Player{wren, kaelen})

	assert.ElementsMatch(t, []uuid.UUID{watcher.ID}, hub.GetPlayerIDs(),
		"the hub should broadcast only the delver who stayed behind")
	assert.ElementsMatch(t, []uuid.UUID{wren.ID, kaelen.ID}, run.GetPlayerIDs())

	server.ReturnPlayersToHub(run.ID)

	assert.ElementsMatch(t, []uuid.UUID{wren.ID, kaelen.ID, watcher.ID}, hub.GetPlayerIDs(),
		"and everyone again once the run resolves")
	assert.Empty(t, run.GetPlayerIDs(), "the finished run holds nobody")
}
