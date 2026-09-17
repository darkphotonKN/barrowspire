package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fillHub admits players until the hub holds n of them.
func fillHub(t *testing.T, server *Server, n int) {
	t.Helper()

	for i := 0; i < n; i++ {
		conn := &websocket.Conn{}
		player := &types.Player{ID: uuid.New(), Username: "Delver"}
		registerTestConn(server, conn, player)

		_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: "Delver"})
		require.NoError(t, err, "the hub refused someone before it was full")
	}
}

// JoinHub hands the decision to the world and passes its refusal back, so a
// client hears "full" rather than silence. FS-29KSH §Requirements 31-32.
func TestJoinHub_PassesTheWorldsRefusalOn(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()

	fillHub(t, server, constants.HubOccupancyCap)

	conn := &websocket.Conn{}
	latecomer := &types.Player{ID: uuid.New(), Username: "Latecomer"}
	registerTestConn(server, conn, latecomer)

	_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: "Latecomer"})

	assert.ErrorIs(t, err, game.ErrWorldFull)
	assert.False(t, hub.HasPlayer(latecomer.ID), "refused, but let in anyway")
	assert.Equal(t, uuid.Nil, latecomer.CurrentGameSessionId,
		"a refused delver is in no world")
}

// Coming home is not arriving. A delver who left the hub to descend already had
// a place; refusing them at the door on the way back would strand them in a run
// that no longer exists. FS-29KSH §Requirements 33.
func TestReturnPlayersToHub_IsNotGatedByTheCap(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	delver := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, delver)
	_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: "Wren"})
	require.NoError(t, err)

	run := server.CreateGameSession([]*types.Player{delver})
	require.False(t, hub.HasPlayer(delver.ID), "they left to descend")

	// the hub fills up while they are away
	fillHub(t, server, constants.HubOccupancyCap)

	server.ReturnPlayersToHub(run.ID)

	assert.True(t, hub.HasPlayer(delver.ID),
		"a returning delver was shut out of the hub they set off from")
}
