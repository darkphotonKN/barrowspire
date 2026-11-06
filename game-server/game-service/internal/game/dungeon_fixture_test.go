package game

import (
	"fmt"
	"math"
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-KE075 §B Requirement 14: the switch, escape door and stairs each stand on
// a walkable, non-doorway cell of their room, clear of what is placed. A room
// whose random draws all miss is searched cell by cell; a room with no such
// spot at all fails the layout, so the floor build tries a fresh seed, then
// today's floor of buildings. A fixture is never forced onto a doorway.

// scriptedGenerator hands out its layouts in order, one per call, then fails.
type scriptedGenerator struct {
	layouts []levelgen.DungeonLayout
	calls   int
}

func (g *scriptedGenerator) generate(_ levelgen.DungeonParams, seed uint64) (levelgen.DungeonLayout, error) {
	g.calls++
	if g.calls > len(g.layouts) {
		return levelgen.DungeonLayout{}, fmt.Errorf("generate dungeon seed %d: %w", seed, levelgen.ErrNoLayout)
	}
	return g.layouts[g.calls-1], nil
}

// stuckRand draws 0 every time, so every random spot is the first corner of
// its region's first cell rect: a body centred there overhangs the region.
type stuckRand struct{}

func (stuckRand) IntN(int) int     { return 0 }
func (stuckRand) Float64() float64 { return 0 }

// floor1Layout is the real generator's floor-1 layout for seed.
func floor1Layout(t *testing.T, seed uint64) levelgen.DungeonLayout {
	t.Helper()
	l, err := levelgen.GenerateDungeon(levelgen.DungeonFloor1Params, seed)
	require.NoError(t, err)
	return l
}

// tightened is layout with every cell of room a doorway except keep, so R14
// leaves a fixture in room only keep's cell; none at all when keep is nil.
func tightened(layout levelgen.DungeonLayout, room int, keep *levelgen.Cell) levelgen.DungeonLayout {
	out := layout
	out.Rooms = slices.Clone(layout.Rooms)
	r := out.Rooms[room].Rect
	var doorways []levelgen.Cell
	for y := r.Y; y < r.Y+r.H; y++ {
		for x := r.X; x < r.X+r.W; x++ {
			if c := (levelgen.Cell{X: x, Y: y}); keep == nil || c != *keep {
				doorways = append(doorways, c)
			}
		}
	}
	out.Rooms[room].Doorways = doorways
	return out
}

// runFrom builds a run's first floor for one seated delver, its layouts from
// gen and its spawns from rng.
func runFrom(t *testing.T, gen *scriptedGenerator, rng populationRand) *Session {
	t.Helper()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.spawnRand = rng
	s.generateDungeon = gen.generate
	s.InitialSystems()
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	s.InitialMapObjects(nil)
	return s
}

// escapeDoorAt is where the floor's escape door stands.
func escapeDoorAt(t *testing.T, s *Session) point {
	t.Helper()
	at := transformOf(t, onlyEntity(t, s, ecs.ComponentTypeEscapeDoor))
	return point{at.X, at.Y}
}

// offDoorwaysIn reports whether a fixture's padded footprint centred on at
// lies wholly on cells of room's region, none of them a doorway.
func offDoorwaysIn(d *dungeonFloor, at point, room int) bool {
	rw := constants.ContainerWidthRadius + containerPadding
	rh := constants.ContainerHeightRadius + containerPadding
	cell := d.layout.CellSize
	c0, r0 := int(math.Floor((at.x-rw)/cell)), int(math.Floor((at.y-rh)/cell))
	c1, r1 := int(math.Ceil((at.x+rw)/cell))-1, int(math.Ceil((at.y+rh)/cell))-1
	for y := r0; y <= r1; y++ {
		for x := c0; x <= c1; x++ {
			c := y*d.layout.Cols + x
			if d.region[c] != d.roomRegion(room) || d.doorway[c] {
				return false
			}
		}
	}
	return true
}

// Every random draw misses, yet the one free cell of the escape door's room is
// found by searching the room: the door stands on it, off the doorways.
func TestDungeonFloor1_FixtureDrawsMiss_TheRoomIsSearched(t *testing.T) {
	layout := floor1Layout(t, 11)
	room := layout.Roles.EscapeDoor
	r := layout.Rooms[room].Rect
	// an inner cell, not the room's centre cell
	keep := levelgen.Cell{X: r.X + 1, Y: r.Y + 1}
	gen := &scriptedGenerator{layouts: []levelgen.DungeonLayout{tightened(layout, room, &keep)}}

	s := runFrom(t, gen, stuckRand{})

	require.NotNil(t, s.dungeon, "the layout has a spot for every fixture")
	at := escapeDoorAt(t, s)
	assert.Equal(t, keep, levelgen.Cell{X: int(at.x / layout.CellSize), Y: int(at.y / layout.CellSize)},
		"the escape door stands on its room's one free cell")
	assert.True(t, offDoorwaysIn(s.dungeon, at, room), "the escape door is off the doorways, at (%.0f, %.0f)", at.x, at.y)
}

// An escape door room with no non-doorway cell fails its layout: the floor
// build moves on to a fresh seed's layout, and the door stands off the
// doorways there.
func TestDungeonFloor1_FixtureRoomWithNoSpot_FreshSeedBuilt(t *testing.T) {
	tight := floor1Layout(t, 11)
	tight = tightened(tight, tight.Roles.EscapeDoor, nil)
	fresh := floor1Layout(t, 12)
	gen := &scriptedGenerator{layouts: []levelgen.DungeonLayout{tight, fresh}}

	s := runFrom(t, gen, seededSpawns(5))

	require.NotNil(t, s.dungeon, "the fresh seed's layout is built")
	assert.Equal(t, 2, gen.calls, "the tight layout, then a fresh seed")
	assert.Equal(t, fresh.Seed, s.dungeon.layout.Seed, "floor 1 is the fresh seed's layout")
	at := escapeDoorAt(t, s)
	assert.True(t, offDoorwaysIn(s.dungeon, at, fresh.Roles.EscapeDoor), "the escape door is off the doorways, at (%.0f, %.0f)", at.x, at.y)
}

// When both seeds' layouts leave a fixture no spot, floor 1 is today's floor
// of buildings, and the run still starts with its way out and its way up.
func TestDungeonFloor1_NoLayoutWithASpot_FloorOfBuildings(t *testing.T) {
	log := capturedLog(t)
	first, second := floor1Layout(t, 11), floor1Layout(t, 12)
	gen := &scriptedGenerator{layouts: []levelgen.DungeonLayout{
		tightened(first, first.Roles.Switch, nil),
		tightened(second, second.Roles.Stairs, nil),
	}}

	s := runFrom(t, gen, seededSpawns(5))

	assert.Nil(t, s.dungeon, "no dungeon layout was laid")
	assert.Equal(t, [2]float64{constants.MapWidth, constants.MapHeight}, [2]float64{s.mapWidth, s.mapHeight})
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeEscapeDoor), 1)
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeSwitch), 1)
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeStairs), 1)
	assert.NotEmpty(t, entityIDsWith(s, ecs.ComponentTypeWall), "a floor of buildings")
	assert.Contains(t, log.String(), `"level":"ERROR"`)
}
