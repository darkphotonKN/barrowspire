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
// FS-0008 §Requirements 20-21, 23.
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
// strand them. FS-0008 §Requirements 22.
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
