package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type rect struct{ X, Y, W, H float64 }

func (r rect) contains(x, y float64) bool {
	return x >= r.X && x <= r.X+r.W && y >= r.Y && y <= r.Y+r.H
}

// wallsIn collects every wall as a rectangle in world space.
func wallsIn(entities []*ecs.Entity) []rect {
	found := make([]rect, 0)

	for _, entity := range entities {
		wallComp, isWall := entity.GetComponent(ecs.ComponentTypeWall)
		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)

		if !isWall || !hasTransform {
			continue
		}

		wall := wallComp.(*components.WallComponent)
		transform := transformComp.(*components.TransformComponent)
		found = append(found, rect{X: transform.X, Y: transform.Y, W: wall.Width, H: wall.Height})
	}

	return found
}

// The hub is a place, not a field. Its buildings are fixed — a delver has to be
// able to say "left of the Quartermaster" and be understood — and they are
// exteriors: walls with no way in. FS-0008 §Requirements 4.
func TestHub_HasBuildings(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()
	entities := hub.EntityManager.GetAllEntities()

	walls := wallsIn(entities)
	require.NotEmpty(t, walls, "the hub is still a bare field")

	t.Run("nothing to open", func(t *testing.T) {
		for _, entity := range entities {
			_, isDoor := entity.GetComponent(ecs.ComponentTypeDoor)
			assert.False(t, isDoor, "hub buildings are exteriors; there is nothing to go into")
		}
	})

	t.Run("fixed, so two clients see one hub", func(t *testing.T) {
		second := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
		otherHub, _ := second.HubSession()

		assert.ElementsMatch(t, walls, wallsIn(otherHub.EntityManager.GetAllEntities()))
	})

	t.Run("open ground where delvers arrive and gather", func(t *testing.T) {
		clear := map[string][2]float64{
			"the spawn point": {constants.HubSpawnX, constants.HubSpawnY},
		}
		for function, at := range npcPositions(entities) {
			clear[string(function)+" NPC"] = at
		}

		for what, at := range clear {
			for _, wall := range walls {
				assert.False(t, wall.contains(at[0], at[1]),
					"a building sits on %s", what)
			}
		}
	})
}
