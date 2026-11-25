package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// FS-X2CMM §J R51, FS-5FZ4J §E R33. I-X2CMM-16: an afloat delver walks a
// chasm's pits as open ground; every other wall, gate and door still stops them.

// pitX, pitW are a pit band's left edge and width: two cells, the map's height.
const pitX, pitW = 400.0, 160.0

// addPit lays a shut pit barrier over the rect, as the Chasm's build does.
func addPit(em *ecs.EntityManager, x, y, w, h float64) *ecs.Entity {
	pit := em.CreateEntity()
	pit.AddComponent(&components.BarrierComponent{Kind: components.BarrierPit})
	pit.AddComponent(components.NewDoorComponent(w, h))
	pit.AddComponent(components.NewTransformComponent(x, y))
	pit.AddComponent(components.NewOpenableComponent(false))
	return pit
}

// walkingDelver stands an in-play delver at (x, y), walking (vx, vy).
func walkingDelver(em *ecs.EntityManager, x, y, vx, vy float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewPlayerComponent(uuid.New(), "mage", "Delver", false))
	e.AddComponent(components.NewHealthComponent(100, 100))
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(vx, vy, constants.DefaultSpeed))
	return e
}

// walkFor ticks the movement for d seconds.
func walkFor(sys *MovementSystem, em *ecs.EntityManager, d float64) {
	for range int(d / tickSeconds) {
		sys.Update(tickSeconds, em.GetAllEntities())
	}
}

// An afloat delver walks across a shut pit; a grounded one beside them is
// stopped at its edge.
func TestMovement_AfloatCrossesAShutPit_AGroundedDelverIsStopped(t *testing.T) {
	em := ecs.NewEntityManager()
	sys := NewMovementSystem()
	addPit(em, pitX, 0, pitW, constants.MapHeight)
	floating := lift(walkingDelver(em, 300, 200, 1, 0), 60)
	grounded := walkingDelver(em, 300, 600, 1, 0)

	walkFor(sys, em, 2)

	assert.Greater(t, transformOfEntity(floating).X, pitX+pitW+constants.PlayerRadius, "across the pit")
	assert.InDelta(t, pitX-constants.PlayerRadius, transformOfEntity(grounded).X, 1e-9, "stopped at its edge")
}

// Afloat passes pits only: a wall, a shut gate and a shut door stop an
// afloat delver as they stop anyone.
func TestMovement_AfloatIsStoppedByWallsGatesAndShutDoors(t *testing.T) {
	cases := []struct {
		name string
		lay  func(em *ecs.EntityManager)
	}{
		{"a wall", func(em *ecs.EntityManager) { addWall(em, pitX, 0, 20, constants.MapHeight) }},
		{"a shut gate", func(em *ecs.EntityManager) {
			gate := addDoor(em, pitX, 0, 20, constants.MapHeight, false)
			gate.AddComponent(&components.BarrierComponent{Kind: components.BarrierGate})
		}},
		{"a shut door", func(em *ecs.EntityManager) { addDoor(em, pitX, 0, 20, constants.MapHeight, false) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			sys := NewMovementSystem()
			tc.lay(em)
			floating := lift(walkingDelver(em, 300, 200, 1, 0), 60)

			walkFor(sys, em, 2)

			assert.InDelta(t, pitX-constants.PlayerRadius, transformOfEntity(floating).X, 1e-9)
		})
	}
}

// An afloat delver standing over a pit stays there: the pit pushes them
// nowhere. A wall at the pit's edge they overlap still pushes them out of it,
// over the pit.
func TestMovement_AfloatOverAPit_IsPushedOutOfWallsOnly(t *testing.T) {
	em := ecs.NewEntityManager()
	sys := NewMovementSystem()
	addPit(em, pitX, 0, pitW, constants.MapHeight)
	addWall(em, pitX+pitW, 0, 20, constants.MapHeight)
	still := lift(walkingDelver(em, pitX+pitW/2, 200, 0, 0), 60)
	againstWall := lift(walkingDelver(em, pitX+pitW-constants.PlayerRadius+5, 600, 0, 0), 60)

	sys.Update(tickSeconds, em.GetAllEntities())

	assert.Equal(t, [2]float64{pitX + pitW/2, 200}, [2]float64{transformOfEntity(still).X, transformOfEntity(still).Y}, "left over the pit")
	assert.Equal(t, [2]float64{pitX + pitW - constants.PlayerRadius, 600}, [2]float64{transformOfEntity(againstWall).X, transformOfEntity(againstWall).Y}, "out of the wall, over the pit")
}

// Once afloat lapses the pit is rock again: a delver walking from beside it
// is stopped at its edge.
func TestMovement_AfloatOver_ThePitStopsThemAgain(t *testing.T) {
	em := ecs.NewEntityManager()
	sys := NewMovementSystem()
	addPit(em, pitX, 0, pitW, constants.MapHeight)
	floating := lift(walkingDelver(em, 300, 200, 1, 0), 0.1)
	NewBookSystem(em).Update(0.2, em.GetAllEntities(), BookGround{})

	walkFor(sys, em, 2)

	assert.InDelta(t, pitX-constants.PlayerRadius, transformOfEntity(floating).X, 1e-9)
}

// Afloat and grounded movers share the one index, built once: the afloat
// view passes pits over the same buckets.
func TestMovement_AfloatMovers_KeepTheOneIndex(t *testing.T) {
	em := ecs.NewEntityManager()
	sys := NewMovementSystem()
	addPit(em, pitX, 0, pitW, constants.MapHeight)
	lift(walkingDelver(em, 300, 200, 1, 0), 60)
	walkingDelver(em, 300, 600, 1, 0)

	sys.Update(tickSeconds, em.GetAllEntities())
	built := sys.walls
	walkFor(sys, em, 1)

	assert.Same(t, built, sys.walls)
}
