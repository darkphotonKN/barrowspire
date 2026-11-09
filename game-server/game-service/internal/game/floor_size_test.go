package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	The session's map size is the current floor's, and every reader reads it
	(FS-KE075 §B Requirement 11). No floor changes size yet: until floor 1 is a
	dungeon (I-KE075-6) every floor is today's 1440×960. The tests that catch a
	constant read build a run at floor 1's coming size, 5760×3840, where a reader
	still on the constants would stop at 1440×960.
*/

// dungeonSize is floor 1's size once it is a dungeon (FS-KE075 §B R11).
var dungeonSize = WorldBounds{Type: types.WorldTypeRun, Width: 5760, Height: 3840}

func runOfSize(t *testing.T, bounds WorldBounds) *Session {
	t.Helper()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, bounds)
	s.InitialSystems()
	s.endSessionCh = make(chan bool, 1)
	return s
}

// tallestSpire is the last row of the height odds (FS-M8CSE §A Requirement 1).
const tallestSpire = 10

// A run is built at its first floor's size, and every floor of the climb is
// that size (FS-M8CSE §C R13).
func TestFloorSize_RunBoundsAreEveryFloors(t *testing.T) {
	w, h := floorSize(firstFloor)
	assert.Equal(t, WorldBounds{Type: types.WorldTypeRun, Width: w, Height: h}, RunBounds())

	for depth := firstFloor + 1; depth <= tallestSpire; depth++ {
		dw, dh := floorSize(depth)
		assert.Equal(t, [2]float64{w, h}, [2]float64{dw, dh}, "floor %d", depth)
	}
}

// The chest is placed anywhere on the session's own map, not on the constants'.
func TestCreateContainer_PlacesAcrossTheSessionsMap(t *testing.T) {
	s := runOfSize(t, dungeonSize)

	beyondX, beyondY := false, false
	for range 60 {
		s.objectOccupiedPlaceAreas = nil
		s.CreateContainer()
	}
	for _, id := range entityIDsWith(s, ecs.ComponentTypeContainer) {
		e, _ := s.EntityManager.GetEntity(id)
		at := transformOf(t, e)
		assert.True(t, at.X > 0 && at.X < dungeonSize.Width && at.Y > 0 && at.Y < dungeonSize.Height, "a chest off the map at %v", *at)
		beyondX = beyondX || at.X > constants.MapWidth
		beyondY = beyondY || at.Y > constants.MapHeight
	}
	assert.True(t, beyondX, "no chest past x %v: placed on the constant map", constants.MapWidth)
	assert.True(t, beyondY, "no chest past y %v: placed on the constant map", constants.MapHeight)
}

// walkTo stands a delver at (x, y), walking (vx, vy), and ticks the world n times.
func walkTo(t *testing.T, s *Session, x, y, vx, vy float64, n int) *components.TransformComponent {
	t.Helper()
	playerID := uuid.New()
	s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")
	e := delverEntity(t, s, playerID)
	at := transformOf(t, e)
	at.X, at.Y = x, y
	vc, _ := e.GetComponent(ecs.ComponentTypeVelocity)
	v := vc.(*components.VelocityComponent)
	v.VX, v.VY = vx, vy
	for range n {
		tick(s)
	}
	return at
}

// A delver reaches the session's own edge, and no further.
func TestSession_ClampsToItsOwnMap(t *testing.T) {
	s := runOfSize(t, dungeonSize)

	at := walkTo(t, s, dungeonSize.Width-100, dungeonSize.Height-100, 1, 1, 120)

	r := constants.PlayerRadius
	assert.InDelta(t, dungeonSize.Width-r, at.X, 1e-9, "clamped short of the session's map")
	assert.InDelta(t, dungeonSize.Height-r, at.Y, 1e-9, "clamped short of the session's map")
}

// The floor build sets the session to the floor's size, and the clamp follows:
// a run at the dungeon's size whose generation fails shrinks to a floor of
// buildings.
func TestBuildFloor_SetsTheFloorsSize(t *testing.T) {
	s := runOfSize(t, dungeonSize)
	failGeneration(s)

	s.buildFloor(firstFloor+1, nil)

	w, h := constants.MapWidth, constants.MapHeight
	assert.Equal(t, [2]float64{w, h}, [2]float64{s.mapWidth, s.mapHeight})
	// clear the floor's random layout out of the walk
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeEnemy) || e.HasComponent(ecs.ComponentTypeWall) || e.HasComponent(ecs.ComponentTypeDoor) {
			s.EntityManager.RemoveEntity(e.ID)
		}
	}
	at := walkTo(t, s, w-100, 300, 1, 0, 120)
	assert.InDelta(t, w-constants.PlayerRadius, at.X, 1e-9, "the clamp kept the earlier floor's size")
}

// Every floor, and floor 1 at its dungeon size, stays within the rows the
// spatial hash's key keeps apart. FS-KE075 §E R30, FS-QG1HR D4.
func TestFloorSize_FitsTheSpatialHash(t *testing.T) {
	assert.Equal(t, 96, systems.SpatialHashRows(dungeonSize.Height))
	assert.Less(t, systems.SpatialHashRows(dungeonSize.Height), systems.SpatialHashMaxRows)
	for depth := firstFloor; depth <= tallestSpire; depth++ {
		_, h := floorSize(depth)
		assert.Less(t, systems.SpatialHashRows(h), systems.SpatialHashMaxRows, "floor %d", depth)
	}
}

// The wall index a tick built on one floor is gone after the climb: a delver
// walks straight through where an old wall stood. Unlike the floor test above
// it, the world ticks before the climb, so the index already held the old floor.
// FS-KE075 AC "rebuilt on a floor change".
func TestRegenerateFloor_RebuildsTheWallIndex(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s

	const spacing, thickness = 100.0, 10.0
	for x := spacing; x < constants.MapWidth; x += spacing {
		CreateWallEntity(s.EntityManager, WallConfig{X: x, Y: 0, Width: thickness, Height: constants.MapHeight}, uuid.New())
	}
	s.endSessionCh = make(chan bool, 1)
	// the index now holds the old floor, fence included
	tick(s)

	oldFloor := p.floorIDs(t)
	require.NoError(t, s.regenerateFloor())
	*transformOf(t, delverEntity(t, s, p.fallen)) = components.TransformComponent{X: 5, Y: 5}

	x, y, found := 0.0, 0.0, false
	for fx := spacing; fx < constants.MapWidth-spacing && !found; fx += spacing {
		for cy := 2 * constants.PlayerRadius; cy < constants.MapHeight-2*constants.PlayerRadius && !found; cy += 2 * constants.PlayerRadius {
			cx := fx - constants.PlayerRadius - 3
			if clearOfNewFloorObstacles(s, oldFloor, cx-60, cy-60, 160, 120) {
				x, y, found = cx, cy, true
			}
		}
	}
	require.True(t, found, "the new floor leaves some open ground")

	carrier := delverEntity(t, s, p.carrier)
	*transformOf(t, carrier) = components.TransformComponent{X: x, Y: y}
	vc, _ := carrier.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).VX = 1
	tick(s)

	assert.Greater(t, transformOf(t, carrier).X-x, 5.0, "the index still held an old-floor wall")
}
