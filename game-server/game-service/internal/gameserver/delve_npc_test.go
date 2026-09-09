package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// npcsIn collects the NPCs a world holds.
func npcsIn(entities []*ecs.Entity) []*components.NPCComponent {
	found := make([]*components.NPCComponent, 0)
	for _, entity := range entities {
		if comp, ok := entity.GetComponent(ecs.ComponentTypeNPC); ok {
			found = append(found, comp.(*components.NPCComponent))
		}
	}
	return found
}

// A function NPC is how anything in the hub is reached, and the delve is the
// first of them. It stands still, so its placement is map data.
// FS-0008 §Requirements 9.
func TestHub_HoldsTheDelveNPC(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()

	npcs := npcsIn(hub.EntityManager.GetAllEntities())

	require.Len(t, npcs, 1, "the hub should hold exactly the delve NPC for now")
	assert.Equal(t, components.NPCFunctionDelve, npcs[0].Function)
	assert.NotEmpty(t, npcs[0].Name, "a delver has to be able to tell who they are talking to")

	t.Run("and stands where the map put them", func(t *testing.T) {
		second := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
		otherHub, _ := second.HubSession()

		assert.Equal(t,
			positionOfNPC(t, hub.EntityManager.GetAllEntities()),
			positionOfNPC(t, otherHub.EntityManager.GetAllEntities()),
			"two clients must find them in the same place")
	})

	t.Run("and is close enough to talk to", func(t *testing.T) {
		for _, entity := range hub.EntityManager.GetAllEntities() {
			if _, isNPC := entity.GetComponent(ecs.ComponentTypeNPC); !isNPC {
				continue
			}
			comp, ok := entity.GetComponent(ecs.ComponentTypeInteractable)
			require.True(t, ok, "an NPC nobody can reach is decoration")
			assert.Greater(t, comp.(*components.InteractableComponent).Range, 0.0)
		}
	})

	_ = constants.HubSpawnX
}

func positionOfNPC(t *testing.T, entities []*ecs.Entity) [2]float64 {
	t.Helper()
	for _, entity := range entities {
		if _, ok := entity.GetComponent(ecs.ComponentTypeNPC); !ok {
			continue
		}
		comp, ok := entity.GetComponent(ecs.ComponentTypeTransform)
		require.True(t, ok)
		transform := comp.(*components.TransformComponent)
		return [2]float64{transform.X, transform.Y}
	}
	t.Fatal("no NPC in the world")
	return [2]float64{}
}
