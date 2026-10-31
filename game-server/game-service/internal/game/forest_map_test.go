package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-3QHQZ §B Requirements 9–14, 20, 21; Acceptance Criteria "Forest world (§B)"
// 1–4. I-3QHQZ-2.

// forestSeed is the fixed seed these tests rebuild one forest from.
const forestSeed uint64 = 20261030

// forestLayoutFor generates the Forest's layout for seed.
func forestLayoutFor(t *testing.T, seed uint64) levelgen.Layout {
	t.Helper()

	layout, err := levelgen.Generate(levelgen.ForestParams, seed)
	require.NoError(t, err)
	return layout
}

// builtForest is a channel of the Forest built from seed's layout, not started:
// the test is the only thing ticking it.
func builtForest(t *testing.T, seed uint64) (*Session, FieldPlace, levelgen.Layout) {
	t.Helper()
	return builtForestWith(t, seed, chestsOnly)
}

// builtForestWith is builtForest with each chest point's sack-share draw taken
// from kindRand.
func builtForestWith(t *testing.T, seed uint64, kindRand lootRand) (*Session, FieldPlace, levelgen.Layout) {
	t.Helper()

	generated := forestLayoutFor(t, seed)
	place := ForlornForest(generated)
	layout, err := place.Layout.Layout()
	require.NoError(t, err)

	forest := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, FieldBounds(place))
	forest.containerKindRand = kindRand
	forest.InitialFieldMapObjects(place, layout)
	return forest, place, generated
}

// Every layout rect is one wall entity of its own, at the rect, and the count
// stays inside the wall budget. R13, R21.
func TestForlornForest_WallsAreTheLayoutsRects(t *testing.T) {
	forest, _, generated := builtForest(t, forestSeed)

	var walls []levelgen.Rect
	houses := map[uuid.UUID]bool{}
	for _, entity := range forest.EntityManager.GetAllEntities() {
		wc, isWall := entity.GetComponent(ecs.ComponentTypeWall)
		if !isWall {
			continue
		}
		wall := wc.(*components.WallComponent)
		tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
		at := tc.(*components.TransformComponent)
		walls = append(walls, levelgen.Rect{X: at.X, Y: at.Y, W: wall.Width, H: wall.Height})
		houses[wall.HouseID] = true
	}

	assert.ElementsMatch(t, generated.Walls, walls, "one wall per layout rect, at the rect")
	assert.Len(t, houses, len(walls), "every wall has its own house id: no building")
	assert.LessOrEqual(t, len(walls), levelgen.ForestParams.WallBudget)
}

// The Forest is the generator's map: its bounds are the layout's, 3 120 x 2 000
// px, so the MovementSystem clamps at the forest's edge. FS-KSD6K R1.
func TestForlornForest_IsTheLayoutsSize(t *testing.T) {
	forest, place, generated := builtForest(t, forestSeed)

	assert.Equal(t, 3120.0, place.Width)
	assert.Equal(t, 2000.0, place.Height)
	assert.Equal(t, constants.ForestMapWidth, place.Width, "the constant matches the built Forest")
	assert.Equal(t, constants.ForestMapHeight, place.Height, "the constant matches the built Forest")
	assert.Equal(t, generated.Bounds.W, forest.mapWidth)
	assert.Equal(t, generated.Bounds.H, forest.mapHeight)
}

// The Forest's size is read from the layout it is built from, never fixed
// beside it: a layout of another size makes a Forest of that size. R11.
func TestForlornForest_TakesItsSizeFromTheLayout(t *testing.T) {
	generated := forestLayoutFor(t, forestSeed)
	generated.Bounds = levelgen.Size{W: 1600, H: 960}

	place := ForlornForest(generated)

	assert.Equal(t, 1600.0, place.Width)
	assert.Equal(t, 960.0, place.Height)
}

// Nothing of a run stands in the Forest: no building door, escape door,
// switch or stairs. Its only containers are its clearing chests (R19). R13.
func TestForlornForest_BuildsNoRunObject(t *testing.T) {
	forest, _, _ := builtForest(t, forestSeed)

	runOnly := []ecs.ComponentType{
		ecs.ComponentTypeDoor, ecs.ComponentTypeEscapeDoor, ecs.ComponentTypeSwitch,
		ecs.ComponentTypeStairs,
	}
	for _, entity := range forest.EntityManager.GetAllEntities() {
		for _, kind := range runOnly {
			assert.False(t, entity.HasComponent(kind), "the Forest holds a %s", kind)
		}
	}
}

// overlapsWall reports whether a circle of radius r at p reaches into any wall.
func overlapsWall(walls []levelgen.Rect, p FieldPoint, r float64) bool {
	for _, w := range walls {
		nx := max(w.X, min(p.X, w.X+w.W))
		ny := max(w.Y, min(p.Y, w.Y+w.H))
		inside := p.X > w.X && p.X < w.X+w.W && p.Y > w.Y && p.Y < w.Y+w.H
		if inside || (p.X-nx)*(p.X-nx)+(p.Y-ny)*(p.Y-ny) < r*r {
			return true
		}
	}
	return false
}

// Over many seeds, the entrance gate stands at the layout's entrance on the
// east edge, and the arrival (the respawn point) is beside it on open ground,
// beyond the gate's range so arriving never walks straight back out. R14.
func TestForlornForest_EntranceAndArrival(t *testing.T) {
	for seed := uint64(1); seed <= 1000; seed++ {
		generated := forestLayoutFor(t, seed)
		place := ForlornForest(generated)

		require.Equal(t, levelgen.SideEast, generated.Entrance.Side)
		require.Equal(t, generated.Entrance.At.X, place.Entrance.X, "seed %d", seed)
		require.Equal(t, generated.Entrance.At.Y, place.Entrance.Y, "seed %d", seed)
		require.Greater(t, place.Entrance.X, place.Width-levelgen.ForestParams.CellSize, "seed %d: the gate is not on the east edge", seed)
		require.False(t, overlapsWall(generated.Walls, place.Entrance, 0), "seed %d: the gate stands in a wall", seed)

		away := math.Hypot(place.Arrival.X-place.Entrance.X, place.Arrival.Y-place.Entrance.Y)
		require.Greater(t, away, place.EntranceRange, "seed %d: the arrival is inside the gate's range", seed)
		require.False(t, overlapsWall(generated.Walls, place.Arrival, constants.PlayerRadius), "seed %d: the arrival is not on open ground", seed)
	}
}

// The gate stands at the entrance, and it and every wall are recorded as
// occupied, so nothing placed later lands on a wall or the gate. R13.
func TestForlornForest_RecordsWhatStandsAsOccupied(t *testing.T) {
	forest, place, generated := builtForest(t, forestSeed)

	gates := 0
	for _, entity := range forest.EntityManager.GetAllEntities() {
		if gc, isGate := entity.GetComponent(ecs.ComponentTypeGate); isGate {
			gates++
			assert.Equal(t, components.GateDestinationHub, gc.(*components.GateComponent).Destination)
			at := transformOf(t, entity)
			assert.Equal(t, place.Entrance, FieldPoint{X: at.X, Y: at.Y})
		}
	}
	assert.Equal(t, 1, gates, "one entrance gate")

	for _, wall := range generated.Walls {
		assert.True(t, forest.IsAreaOccupied(PlaceArea{X: wall.X + 1, Y: wall.Y + 1, W: 1, H: 1}), "wall %+v is not occupied", wall)
	}
	assert.True(t, forest.IsAreaOccupied(PlaceArea{X: place.Entrance.X, Y: place.Entrance.Y, W: 1, H: 1}), "the gate is not occupied")
	assert.False(t, forest.IsAreaOccupied(PlaceArea{X: place.Arrival.X, Y: place.Arrival.Y, W: 1, H: 1}), "the arrival is not left free")
}

// A player in the Forest is clamped at its edge and stopped by its walls by
// the existing MovementSystem. AC "collides with its walls ... clamped at its bounds".
func TestForlornForest_PlayerIsClampedAndCollidesWithWalls(t *testing.T) {
	forest, place, generated := builtForest(t, forestSeed)

	// out through the mouth, east: the map's edge stops them
	walker := delverEntity(t, forest, seatAt(forest, place.Arrival))
	velocityOf(walker).VX = 1
	for range 120 {
		tick(forest)
	}
	assert.LessOrEqual(t, transformOf(t, walker).X, place.Width-constants.PlayerRadius, "walked off the forest's edge")

	// north and south from the arrival: the trail's walls stop them
	for _, vy := range []float64{-1, 1} {
		climber := delverEntity(t, forest, seatAt(forest, place.Arrival))
		velocityOf(climber).VY = vy
		for range 120 {
			tick(forest)
		}
		at := transformOf(t, climber)
		assert.False(t, overlapsWall(generated.Walls, FieldPoint{X: at.X, Y: at.Y}, constants.PlayerRadius-0.5), "walked into a wall heading %v", vy)
	}
}

// seatAt seats a fresh player at p and returns their id.
func seatAt(s *Session, p FieldPoint) uuid.UUID {
	playerID := uuid.New()
	s.AddPlayerAt(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 5}, "", p.X, p.Y)
	return playerID
}

func velocityOf(e *ecs.Entity) *components.VelocityComponent {
	vc, _ := e.GetComponent(ecs.ComponentTypeVelocity)
	return vc.(*components.VelocityComponent)
}
