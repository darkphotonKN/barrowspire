package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// residentIn builds one ambient NPC confined to a region.
func residentIn(em *ecs.EntityManager, region components.WanderRegion, x, y float64) *ecs.Entity {
	entity := em.CreateEntity()
	npc := components.NewNPCComponent("Cottar", components.NPCFunctionNone)
	npc.Wander = &region
	entity.AddComponent(npc)
	entity.AddComponent(components.NewTransformComponent(x, y))
	entity.AddComponent(components.NewVelocityComponent(0, 0, constants.NPCWanderSpeed))
	return entity
}

func transformOf(t *testing.T, entity *ecs.Entity) *components.TransformComponent {
	t.Helper()
	comp, ok := entity.GetComponent(ecs.ComponentTypeTransform)
	require.True(t, ok)
	return comp.(*components.TransformComponent)
}

// run ticks the wander and movement systems together, the way a world does.
func run(em *ecs.EntityManager, ticks int) {
	deltaTime := 1.0 / float64(constants.GameFrameRate)
	wander := NewWanderSystem()
	move := MovementSystem{MapWidth: constants.HubMapWidth, MapHeight: constants.HubMapHeight}

	for range ticks {
		entities := em.GetAllEntities()
		wander.Update(deltaTime, entities)
		move.Update(deltaTime, entities)
	}
}

// A resident walks. Not far, and not out of the quarter they belong to, but
// enough that the hub reads as inhabited rather than staged.
// FS-29KSH §Requirements 10.
func TestWanderSystem_ResidentsMoveWithinTheirRegion(t *testing.T) {
	em := ecs.NewEntityManager()
	region := components.WanderRegion{X: 600, Y: 600, W: 240, H: 200}
	resident := residentIn(em, region, 700, 700)

	start := *transformOf(t, resident)
	run(em, 400)
	end := transformOf(t, resident)

	assert.False(t, start.X == end.X && start.Y == end.Y,
		"the resident never moved")

	assert.GreaterOrEqual(t, end.X, region.X)
	assert.LessOrEqual(t, end.X, region.X+region.W)
	assert.GreaterOrEqual(t, end.Y, region.Y)
	assert.LessOrEqual(t, end.Y, region.Y+region.H)
}

// A random walk against hard collision corners a resident permanently. Walled in
// on two sides and given a destination it cannot reach, one has to give up and
// pick somewhere else. FS-29KSH §Requirements 12.
func TestWanderSystem_ResidentsEscapeACorner(t *testing.T) {
	em := ecs.NewEntityManager()
	region := components.WanderRegion{X: 600, Y: 600, W: 240, H: 200}

	// the corner: walls to the west and to the north
	for _, wall := range []struct{ x, y, w, h float64 }{
		{600, 600, 20, 200},
		{600, 600, 240, 20},
	} {
		entity := em.CreateEntity()
		entity.AddComponent(components.NewWallComponent(uuid.New(), uuid.New(), wall.w, wall.h))
		entity.AddComponent(components.NewTransformComponent(wall.x, wall.y))
	}

	resident := residentIn(em, region, 640, 640)

	// send them hard into the corner and hold them there
	comp, _ := resident.GetComponent(ecs.ComponentTypeNPC)
	npc := comp.(*components.NPCComponent)
	npc.Wander.DestinationX, npc.Wander.DestinationY = 601, 601
	npc.Wander.HasDestination = true
	npc.Wander.LastDistanceSq = 0 // already as close as it will get

	run(em, 120)

	assert.False(t,
		npc.Wander.DestinationX == 601 && npc.Wander.DestinationY == 601,
		"the resident is still pushing at the corner it cannot reach")
}
