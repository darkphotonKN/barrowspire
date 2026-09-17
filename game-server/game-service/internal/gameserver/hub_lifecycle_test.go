package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func entityCountFor(entities []*ecs.Entity, playerID uuid.UUID) int {
	count := 0
	for _, entity := range entities {
		comp, ok := entity.GetComponent(ecs.ComponentTypePlayer)
		if ok && comp.(*components.PlayerComponent).MemberID == playerID {
			count++
		}
	}
	return count
}

// The hub is never torn down, so anything it fails to clean up accumulates for
// the life of the process. A run hid both of these behind its teardown.
func TestHubMembership(t *testing.T) {
	t.Run("entering twice does not duplicate the delver", func(t *testing.T) {
		server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
		hub, _ := server.HubSession()

		conn := &websocket.Conn{}
		player := &types.Player{ID: uuid.New(), Username: "Wren"}
		registerTestConn(server, conn, player)

		for range 3 {
			_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: "Wren"})
			require.NoError(t, err)
		}

		assert.Equal(t, 1, entityCountFor(hub.EntityManager.GetAllEntities(), player.ID),
			"already in the world means nothing to build")
	})

	t.Run("disconnecting leaves the hub", func(t *testing.T) {
		server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
		hub, _ := server.HubSession()

		conn := &websocket.Conn{}
		player := &types.Player{ID: uuid.New(), Username: "Wren"}
		registerTestConn(server, conn, player)
		_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: "Wren"})
		require.NoError(t, err)

		server.cleanUpPlayerFromSession(player)

		assert.False(t, hub.HasPlayer(player.ID))
		assert.Equal(t, 0, entityCountFor(hub.EntityManager.GetAllEntities(), player.ID))
	})

	t.Run("the hub outlives its last delver", func(t *testing.T) {
		server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
		hub, _ := server.HubSession()

		conn := &websocket.Conn{}
		player := &types.Player{ID: uuid.New(), Username: "Wren"}
		registerTestConn(server, conn, player)
		_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: "Wren"})
		require.NoError(t, err)

		server.cleanUpPlayerFromSession(player)

		stillThere, exists := server.HubSession()
		require.True(t, exists, "an empty hub is still the hub")
		assert.Equal(t, hub.ID, stillThere.ID)
	})
}

// Being in a world is a fact, not an instruction to build another body. The
// guard belongs to the world rather than to whoever is asking, so a route added
// later cannot forget it — JoinHub remembered and ReturnPlayersToHub did not.
// FS-29KSH §Requirements 1.
func TestAddPlayer_IsIdempotentWhoeverAsks(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)

	_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: "Wren"})
	require.NoError(t, err)

	// any other route into the same world, asking again
	hub.AddPlayer(player.ID, player.Username, player.Class)

	assert.Equal(t, 1, entityCountFor(hub.EntityManager.GetAllEntities(), player.ID),
		"asking twice gave the delver two bodies")
}
