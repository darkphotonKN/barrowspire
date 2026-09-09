package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// positionOf finds where a session placed a player.
func positionOf(t *testing.T, entities []*ecs.Entity, playerID uuid.UUID) (x, y float64) {
	t.Helper()

	for _, entity := range entities {
		playerComp, hasPlayer := entity.GetComponent(ecs.ComponentTypePlayer)
		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)

		if !hasPlayer || !hasTransform {
			continue
		}

		if playerComp.(*components.PlayerComponent).MemberID != playerID {
			continue
		}

		transform := transformComp.(*components.TransformComponent)
		return transform.X, transform.Y
	}

	t.Fatalf("no entity for player %s", playerID)
	return 0, 0
}

// Everyone enters and returns at the same place, so the hub has a front door
// rather than scattering arrivals. FS-0008 §Requirements 22.
func TestJoinHub_SpawnsAtTheFixedPoint(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()

	for _, name := range []string{"Wren", "Kaelen"} {
		conn := &websocket.Conn{}
		player := &types.Player{ID: uuid.New(), Username: name}
		registerTestConn(server, conn, player)

		_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: name})
		require.NoError(t, err)

		x, y := positionOf(t, hub.EntityManager.GetAllEntities(), player.ID)

		assert.Equal(t, constants.HubSpawnX, x, "%s did not arrive at the spawn point", name)
		assert.Equal(t, constants.HubSpawnY, y, "%s did not arrive at the spawn point", name)
	}
}
