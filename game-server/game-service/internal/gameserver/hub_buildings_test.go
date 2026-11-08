package gameserver

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
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

// The hub is a place, not a field. Its buildings are fixed, because a delver has
// to be able to say "in the Quartermaster's store" and be understood. Each is
// walked into through an open gap in its south wall: nothing hangs in it.
// FS-29KSH §Requirements 4, FS-B0H2D §Requirements 9.
func TestHub_HasBuildings(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()
	entities := hub.EntityManager.GetAllEntities()

	walls := wallsIn(entities)
	require.NotEmpty(t, walls, "the hub is still a bare field")

	t.Run("nothing to open", func(t *testing.T) {
		for _, entity := range entities {
			_, isDoor := entity.GetComponent(ecs.ComponentTypeDoor)
			assert.False(t, isDoor, "a town building's way in is an open gap, with no door entity")
		}
	})

	t.Run("fixed, so two clients see one hub", func(t *testing.T) {
		second := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
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

// A building is one house however many rooms it has: every wall standing in a
// town building's footprint, the Inn's partition and every furnishing
// included, carries that building's house id, so the client rebuilds each
// footprint from the walls and the Inn's two rooms lift one roof.
// FS-B0H2D §Requirements 10.
func TestHub_EveryWallInABuilding_CarriesItsHouseID(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()

	houses := map[uuid.UUID][]rect{}
	for _, entity := range hub.EntityManager.GetAllEntities() {
		wallComp, isWall := entity.GetComponent(ecs.ComponentTypeWall)
		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		if !isWall || !hasTransform {
			continue
		}
		wall := wallComp.(*components.WallComponent)
		at := transformComp.(*components.TransformComponent)
		require.NotEqual(t, uuid.Nil, wall.HouseID, "a hub wall at (%.0f, %.0f) belongs to no building", at.X, at.Y)
		houses[wall.HouseID] = append(houses[wall.HouseID], rect{X: at.X, Y: at.Y, W: wall.Width, H: wall.Height})
	}
	require.Len(t, houses, 3, "the town's buildings")

	footprint := func(walls []rect) rect {
		minX, minY, maxX, maxY := walls[0].X, walls[0].Y, walls[0].X+walls[0].W, walls[0].Y+walls[0].H
		for _, w := range walls {
			minX, minY = min(minX, w.X), min(minY, w.Y)
			maxX, maxY = max(maxX, w.X+w.W), max(maxY, w.Y+w.H)
		}
		return rect{X: minX, Y: minY, W: maxX - minX, H: maxY - minY}
	}

	for id, walls := range houses {
		foot := footprint(walls)
		for other, theirs := range houses {
			if other == id {
				continue
			}
			for _, w := range theirs {
				inside := foot.contains(w.X, w.Y) && foot.contains(w.X+w.W, w.Y+w.H)
				assert.False(t, inside, "a wall at %+v stands in the building at %+v but carries another house id", w, foot)
			}
		}
	}
}
