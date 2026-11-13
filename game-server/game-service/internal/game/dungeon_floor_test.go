package game

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// dungeonRun builds a run's first floor in the server's order, from seed:
// seated delvers first, then the floor for them and the expected members still
// connecting (FS-K2HKP R18).
func dungeonRun(t *testing.T, seed uint64, seated, expected int) (*Session, []uuid.UUID) {
	t.Helper()

	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.spawnRand = seededSpawns(seed)
	s.InitialSystems()
	fixSpireHeight(t, s)

	ids := make([]uuid.UUID, seated)
	for i := range ids {
		ids[i] = uuid.New()
		s.AddPlayer(ids[i], types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	}
	coming := make([]types.CharacterInPlay, expected)
	for i := range coming {
		coming[i] = types.CharacterInPlay{ID: uuid.New(), Name: "Arriving", Class: "mage"}
	}
	s.InitialMapObjects(coming)

	return s, ids
}

// assertOnRegion checks a body of half-size (rw, rh) at (x, y) lies wholly on
// walkable cells of region: inside it, clear of every wall by its size.
func assertOnRegion(t *testing.T, d *dungeonFloor, region int, x, y, rw, rh float64, what string) {
	t.Helper()
	area := centredArea(x, y, rw, rh)
	assert.True(t, d.stands(area, region, onDoorways), "%s at (%.0f, %.0f) is not wholly on region %d", what, x, y, region)
}

// Every arrival slot of floor 1, the seated party's and those kept for the
// expected members, is on walkable cells of the start room, a body's radius
// clear of its walls. FS-KE075 §B Requirement 13.
func TestDungeonFloor1_PartySlotsInTheStartRoom(t *testing.T) {
	for seed := uint64(1); seed <= 40; seed++ {
		s, ids := dungeonRun(t, seed, 2, 2)
		require.NotNil(t, s.dungeon, "seed %d: floor 1 is a dungeon floor", seed)
		start := s.dungeon.roomRegion(s.dungeon.layout.Roles.Start)

		for _, id := range ids {
			at := transformOf(t, delverEntity(t, s, id))
			assertOnRegion(t, s.dungeon, start, at.X, at.Y, constants.PlayerRadius, constants.PlayerRadius, "a seated delver")
		}
		kept := s.arrivalSlotPositions()
		require.Len(t, kept, 2, "seed %d: a slot for each expected member", seed)
		for _, slot := range kept {
			assertOnRegion(t, s.dungeon, start, slot.x, slot.y, constants.PlayerRadius, constants.PlayerRadius, "a kept arrival slot")
		}
	}
}

// roomOf is the room whose region holds (x, y) on d, -1 on none.
func roomOf(d *dungeonFloor, x, y float64) int {
	region := d.regionAt(x, y)
	for i, room := range d.layout.Rooms {
		if room.Region == region {
			return i
		}
	}
	return -1
}

// onlyEntity is the one entity carrying componentType.
func onlyEntity(t *testing.T, s *Session, componentType ecs.ComponentType) *ecs.Entity {
	t.Helper()
	ids := entityIDsWith(s, componentType)
	require.Len(t, ids, 1)
	e, _ := s.EntityManager.GetEntity(ids[0])
	return e
}

// Every Spire floor is built from floor 1's parameter set: the generator takes
// no depth. FS-M8CSE §C Requirements 12-13.
func TestDungeonParams_EveryFloorIsFloor1s(t *testing.T) {
	for depth := firstFloor; depth <= 10; depth++ {
		params, isDungeon := dungeonParams(depth)
		assert.True(t, isDungeon, "floor %d is a dungeon", depth)
		assert.Equal(t, levelgen.DungeonFloor1Params, params, "floor %d", depth)
	}
}

// Every floor of the climb is the dungeon's 5 760 x 3 840 with its 80 px cell
// grid and its own layout. FS-M8CSE §C Requirements 12-13.
func TestDungeonFloors_SizeAndCellSizeOnEveryFloor(t *testing.T) {
	s, _ := dungeonRun(t, 3, 2, 0)

	width, height := floorSize(firstFloor)
	assert.Equal(t, [2]float64{5760, 3840}, [2]float64{width, height})
	assert.Equal(t, RunBounds().Width, width, "a run is created at its first floor's normal size")
	assert.Equal(t, RunBounds().Height, height)
	assert.Equal(t, [2]float64{5760, 3840}, [2]float64{s.mapWidth, s.mapHeight})
	assert.Equal(t, s.dungeon.layout.Bounds.W, s.mapWidth, "the map and the layout are one build")
	assert.Equal(t, 80.0, currentFloor(t, s).CellSize)

	for depth := 2; depth <= testSpireHeight; depth++ {
		previous := s.dungeon.layout.Seed
		require.NoError(t, s.regenerateFloor())
		require.NotNil(t, s.dungeon, "floor %d is a dungeon", depth)
		assert.NotEqual(t, previous, s.dungeon.layout.Seed, "floor %d has a layout of its own", depth)
		assert.Equal(t, [2]float64{5760, 3840}, [2]float64{s.mapWidth, s.mapHeight}, "floor %d", depth)
		assert.Equal(t, 80.0, currentFloor(t, s).CellSize, "floor %d", depth)
		assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeDoor), "floor %d has no buildings", depth)
	}
}

// Floors above the first hold floor 1's 30-45 monsters besides their bosses,
// none in the start room. FS-M8CSE §C Requirement 12.
func TestDungeonFloors_AboveTheFirstHoldTheFullPopulation(t *testing.T) {
	for seed := uint64(1); seed <= 30; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)

		for depth := 2; depth <= testSpireHeight; depth++ {
			require.NoError(t, s.regenerateFloor())
			require.NotNil(t, s.dungeon, "seed %d floor %d is a dungeon", seed, depth)

			standard := standardMonstersIn(s)
			assert.GreaterOrEqual(t, len(standard), DungeonMonstersMin, "seed %d floor %d: too few monsters", seed, depth)
			assert.LessOrEqual(t, len(standard), DungeonMonstersMax, "seed %d floor %d: too many monsters", seed, depth)
			for _, m := range monstersIn(s) {
				at := transformOf(t, m)
				assert.NotEqual(t, s.dungeon.layout.Roles.Start, roomOf(s.dungeon, at.X, at.Y),
					"seed %d floor %d: a monster in the start room", seed, depth)
			}
		}
	}
}

// A climb whose generation fails builds a floor of buildings rather than
// stopping the run: logged, with today's size, its cell size cleared so it is
// not cut by distance, no regions on its map, and its stairs below the top.
// The top floor falls back the same way, with no stairs and with its demon.
// FS-M8CSE §C Requirement 15, FS-KE075 §B R17.
func TestDungeonFloors_GenerationFailureOnAClimbBuildsAFloorOfBuildings(t *testing.T) {
	log := capturedLog(t)
	s, _ := dungeonRun(t, 21, 2, 0)
	require.NotNil(t, s.dungeon)
	failGeneration(s)

	for depth := 2; depth <= testSpireHeight; depth++ {
		require.NoError(t, s.regenerateFloor())

		assert.Nil(t, s.dungeon, "floor %d", depth)
		assert.Equal(t, [2]float64{constants.MapWidth, constants.MapHeight}, [2]float64{s.mapWidth, s.mapHeight}, "floor %d", depth)
		assert.Zero(t, currentFloor(t, s).CellSize, "floor %d is not cut by distance", depth)
		assert.NotEmpty(t, entityIDsWith(s, ecs.ComponentTypeDoor), "floor %d has its buildings", depth)
		message, ok := s.FloorMapMessage()
		require.True(t, ok, "floor %d has a map", depth)
		assert.NotContains(t, message.Payload, "regions", "floor %d", depth)

		if depth < testSpireHeight {
			assert.Len(t, entityIDsWith(s, ecs.ComponentTypeStairs), 1, "floor %d has its stairs", depth)
			continue
		}
		assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeStairs), "the top floor has none")
		demons := 0
		for _, m := range monstersIn(s) {
			if monsterOf(m).Archetype == components.MonsterArchetypeDemon {
				demons++
			}
		}
		assert.Equal(t, 1, demons, "the top floor keeps its demon")
	}
	assert.Contains(t, log.String(), `"level":"ERROR"`)
	assert.Contains(t, log.String(), "fell back to a floor of buildings")
}

// failGeneration makes every later floor of s the floor of buildings a failed
// generation leaves (FS-KE075 §B R17, FS-M8CSE §C R15).
func failGeneration(s *Session) {
	s.generateDungeon = (&failingGenerator{}).generate
}

// The switch, escape door and stairs each stand in their own role room, three
// different rooms at least the median room's walk from the start, on walkable
// cells off the doorways; each treasure room holds a chest. FS-KE075 §B
// Requirements 12, 14, 15.
func TestDungeonFloor1_RolesPlaced(t *testing.T) {
	for seed := uint64(1); seed <= 40; seed++ {
		s, _ := dungeonRun(t, seed, 2, 0)
		d := s.dungeon
		roles := d.layout.Roles

		fixtures := []struct {
			what   string
			kind   ecs.ComponentType
			room   int
			rw, rh float64
		}{
			{"escape door", ecs.ComponentTypeEscapeDoor, roles.EscapeDoor, constants.ContainerWidthRadius, constants.ContainerHeightRadius},
			{"switch", ecs.ComponentTypeSwitch, roles.Switch, constants.ContainerWidthRadius, constants.ContainerHeightRadius},
			{"stairs", ecs.ComponentTypeStairs, roles.Stairs, constants.StairsWidthRadius, constants.StairsHeightRadius},
		}
		rooms := map[int]bool{}
		for _, f := range fixtures {
			at := transformOf(t, onlyEntity(t, s, f.kind))
			assert.Equal(t, f.room, roomOf(d, at.X, at.Y), "seed %d: the %s stands in its room", seed, f.what)
			assert.True(t, d.stands(centredArea(at.X, at.Y, f.rw, f.rh), d.roomRegion(f.room), offDoorways),
				"seed %d: the %s is on walkable cells off the doorways", seed, f.what)
			rooms[f.room] = true
		}
		assert.Len(t, rooms, 3, "seed %d: three different rooms", seed)
		assert.NotContains(t, rooms, roles.Start, "seed %d", seed)

		assert.GreaterOrEqual(t, len(roles.Treasure), 3, "seed %d", seed)
		assert.LessOrEqual(t, len(roles.Treasure), 4, "seed %d", seed)
		chestsIn := map[int]components.ContainerKind{}
		for _, c := range containers(s) {
			at := transformOf(t, c)
			chestsIn[roomOf(d, at.X, at.Y)] = kindOf(t, c)
		}
		for _, room := range roles.Treasure {
			assert.Equal(t, components.ContainerKindChest, chestsIn[room], "seed %d: treasure room %d holds a chest", seed, room)
		}
	}
}

// Floor 1 holds clamp(round(rooms / 2), 10, 14) containers: one chest per
// treasure room, then at most one per room among the rest, never the start
// room's, each a sack at today's share. FS-KE075 §B Requirement 15.
func TestDungeonFloor1_ContainersPerRoom(t *testing.T) {
	for seed := uint64(1); seed <= 40; seed++ {
		s, _ := dungeonRun(t, seed, 2, 0)
		d := s.dungeon
		found := containers(s)

		assert.Equal(t, dungeonContainers(len(d.layout.Rooms)), len(found), "seed %d", seed)
		assert.GreaterOrEqual(t, len(found), 10, "seed %d", seed)
		assert.LessOrEqual(t, len(found), 14, "seed %d", seed)

		perRoom := map[int]int{}
		for _, c := range found {
			at := transformOf(t, c)
			room := roomOf(d, at.X, at.Y)
			require.NotEqual(t, -1, room, "seed %d: a container stands in a room", seed)
			perRoom[room]++
		}
		assert.Zero(t, perRoom[d.layout.Roles.Start], "seed %d: none in the start room", seed)
		for room, n := range perRoom {
			assert.Equal(t, 1, n, "seed %d: room %d holds one container", seed, room)
		}
	}

	tests := []struct {
		name string
		f    float64
		want components.ContainerKind
	}{
		{"a share hit places sacks outside the treasure rooms", SackShare - 1e-9, components.ContainerKindSack},
		{"a share miss places chests", SackShare, components.ContainerKindChest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
			s.spawnRand = seededSpawns(11)
			s.containerKindRand = fixedRand{f: tt.f}
			s.InitialSystems()
			s.InitialMapObjects(nil)

			treasure := map[int]bool{}
			for _, room := range s.dungeon.layout.Roles.Treasure {
				treasure[room] = true
			}
			for _, c := range containers(s) {
				at := transformOf(t, c)
				want := tt.want
				if treasure[roomOf(s.dungeon, at.X, at.Y)] {
					want = components.ContainerKindChest
				}
				assert.Equal(t, want, kindOf(t, c))
			}
		})
	}
}

// Every body on floor 1, delvers, monsters, containers and fixtures, stands on
// walkable cells of one region, inset from every wall by its size; monsters
// are in rooms other than the start room or in corridors, off doorways, clear
// of the delvers and of each other. FS-KE075 §B Requirement 16, §C R18–20.
func TestDungeonFloor1_EveryBodyOnWalkableCells(t *testing.T) {
	for seed := uint64(1); seed <= 40; seed++ {
		s, ids := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		r := constants.PlayerRadius

		var delvers []point
		for _, id := range ids {
			at := transformOf(t, delverEntity(t, s, id))
			delvers = append(delvers, point{at.X, at.Y})
		}

		monsters := monstersIn(s)
		require.NotEmpty(t, monsters, "seed %d", seed)
		for i, m := range monsters {
			at := transformOf(t, m)
			region := d.regionAt(at.X, at.Y)
			require.NotZero(t, region, "seed %d: monster %d stands on walkable cells", seed, i)
			assert.NotEqual(t, d.roomRegion(d.layout.Roles.Start), region, "seed %d: monster %d in the start room", seed, i)
			assert.True(t, d.stands(centredArea(at.X, at.Y, r, r), region, offDoorways),
				"seed %d: monster %d is not wholly on walkable cells off the doorways", seed, i)
			for _, p := range delvers {
				assert.GreaterOrEqual(t, dist(at.X, at.Y, p.x, p.y), MonsterDelverExclusion, "seed %d", seed)
			}
			for _, other := range monsters[i+1:] {
				o := transformOf(t, other)
				assert.GreaterOrEqual(t, dist(at.X, at.Y, o.X, o.Y), MonsterSpacing, "seed %d", seed)
			}
		}

		for _, c := range containers(s) {
			at := transformOf(t, c)
			room := roomOf(d, at.X, at.Y)
			require.NotEqual(t, -1, room, "seed %d", seed)
			assertOnRegion(t, d, d.roomRegion(room), at.X, at.Y, constants.ContainerWidthRadius, constants.ContainerHeightRadius, "a container")
		}
	}
}

// A handoff arrival with no kept slot left is seated on the start room's
// walkable cells, not at a random point in the rock. FS-KE075 §B R13, R16.
func TestDungeonFloor1_ArrivalWithNoSlotStandsInTheStartRoom(t *testing.T) {
	s, _ := dungeonRun(t, 5, 1, 0)
	start := s.dungeon.roomRegion(s.dungeon.layout.Roles.Start)
	for range 50 {
		s.mu.Lock()
		x, y := s.spawnPoint()
		s.mu.Unlock()
		assertOnRegion(t, s.dungeon, start, x, y, constants.PlayerRadius, constants.PlayerRadius, "an arrival")
	}
}

func dist(ax, ay, bx, by float64) float64 { return math.Hypot(ax-bx, ay-by) }

// A climbed floor's map carries the cell size and regions of its own layout,
// not the floor below's. FS-M8CSE §C Requirement 14.
func TestDungeonFloors_ClimbedFloorMapCarriesItsOwnRegions(t *testing.T) {
	s, _ := dungeonRun(t, 9, 2, 0)
	require.NoError(t, s.regenerateFloor())
	require.NotNil(t, s.dungeon)

	message, ok := s.FloorMapMessage()
	require.True(t, ok)
	payload := wireOf(t, message)["payload"].(map[string]any)

	assert.Equal(t, 2.0, payload["floor"])
	assert.Equal(t, 80.0, payload["cell_size"])
	raw, err := json.Marshal(s.dungeon.layout.Regions)
	require.NoError(t, err)
	var want []any
	require.NoError(t, json.Unmarshal(raw, &want))
	assert.Equal(t, want, payload["regions"])
}

// Floor 1's map carries its cell size and regions from the one layout it was
// built from, and its shell walls, top-left as WallState's, with no house id
// and nothing else: no room roles. FS-KE075 §F Requirement 31.
func TestDungeonFloor1_FloorMapCarriesCellSizeAndRegions(t *testing.T) {
	s, _ := dungeonRun(t, 9, 2, 0)
	message, ok := s.FloorMapMessage()
	require.True(t, ok)

	wire := wireOf(t, message)
	payload := wire["payload"].(map[string]any)
	keys := make([]string, 0, len(payload))
	for k := range payload {
		keys = append(keys, k)
	}
	assert.ElementsMatch(t, []string{"session_id", "floor", "width", "height", "cell_size", "regions", "walls"}, keys,
		"no room roles on the wire")
	assert.Equal(t, 80.0, payload["cell_size"])
	assert.Equal(t, 5760.0, payload["width"])
	assert.Equal(t, 3840.0, payload["height"])

	raw, err := json.Marshal(s.dungeon.layout.Regions)
	require.NoError(t, err)
	var want []any
	require.NoError(t, json.Unmarshal(raw, &want))
	assert.Equal(t, want, payload["regions"], "the regions are the build's own")

	walls := payload["walls"].([]any)
	require.Len(t, walls, len(s.dungeon.layout.Walls))
	byCorner := map[[4]float64]bool{}
	for _, w := range s.dungeon.layout.Walls {
		byCorner[[4]float64{w.X, w.Y, w.W, w.H}] = true
	}
	for _, w := range walls {
		wall := w.(map[string]any)
		assert.NotContains(t, wall, "house_id", "a shell wall belongs to no building")
		pos := wall["position"].(map[string]any)
		corner := [4]float64{pos["x"].(float64), pos["y"].(float64), wall["width"].(float64), wall["height"].(float64)}
		assert.True(t, byCorner[corner], "wall %v is a shell rect, top-left", corner)
	}
}

// floorMapLimit is the most a floor's map may weigh on the wire. FS-KE075 AC
// "its map at most 128 KB".
const floorMapLimit = 128 * 1024

// Floor 1's floor_map, encoded as the writer encodes it, stays within 128 KB on
// every one of 200 builds; the mean and largest are logged for the slice's
// record. FS-KE075 §F R31, AC "the floor-1 floor_map size".
func TestDungeonFloor1_FloorMapAtMost128KB(t *testing.T) {
	const builds = 200
	sum, largest := 0, 0
	for seed := uint64(1); seed <= builds; seed++ {
		s, _ := dungeonRun(t, seed, 1, 0)
		message, ok := s.FloorMapMessage()
		require.True(t, ok, "seed %d: the run has its floor map", seed)
		raw, err := json.Marshal(message)
		require.NoError(t, err)

		assert.LessOrEqual(t, len(raw), floorMapLimit, "seed %d: the floor map is %d B", seed, len(raw))
		sum += len(raw)
		largest = max(largest, len(raw))
	}
	t.Logf("floor-1 floor_map over %d builds: mean %d B, largest %d B (limit %d B)",
		builds, sum/builds, largest, floorMapLimit)
}

// capturedLog collects every record the default logger takes while a test runs.
func capturedLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

// failingGenerator is a dungeon generator that never finds a layout, counting
// the seeds it was asked for.
type failingGenerator struct{ seeds []uint64 }

func (f *failingGenerator) generate(_ levelgen.DungeonParams, seed uint64) (levelgen.DungeonLayout, error) {
	f.seeds = append(f.seeds, seed)
	return levelgen.DungeonLayout{}, fmt.Errorf("generate dungeon seed %d: %w", seed, levelgen.ErrNoLayout)
}

// A generator that exhausts its retries is asked again with a fresh seed; when
// that fails too, floor 1 is today's floor of buildings at 1 440 x 960 and the
// run still starts, with an error logged. FS-KE075 §B Requirement 17.
func TestDungeonFloor1_GeneratorFailureStillStartsTheRun(t *testing.T) {
	log := capturedLog(t)
	gen := &failingGenerator{}

	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.generateDungeon = gen.generate
	s.InitialSystems()
	id := uuid.New()
	s.AddPlayer(id, types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	s.InitialMapObjects(nil)

	require.Len(t, gen.seeds, dungeonGenerations, "the drawn seed, then a fresh one")
	assert.NotEqual(t, gen.seeds[0], gen.seeds[1], "the second try is a fresh seed")
	assert.Nil(t, s.dungeon)
	assert.Equal(t, [2]float64{constants.MapWidth, constants.MapHeight}, [2]float64{s.mapWidth, s.mapHeight})
	assert.Zero(t, currentFloor(t, s).CellSize, "a floor of buildings is not cut")
	assert.NotEmpty(t, entityIDsWith(s, ecs.ComponentTypeDoor), "today's floor: buildings")
	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeStairs), 1)

	message, ok := s.FloorMapMessage()
	require.True(t, ok, "the run has its floor map")
	assert.NotContains(t, message.Payload, "regions")
	assert.Equal(t, constants.MapWidth, message.Payload["width"])

	at := transformOf(t, delverEntity(t, s, id))
	assert.True(t, at.X <= constants.MapWidth && at.Y <= constants.MapHeight, "the delver stands on the small floor")
	assert.Contains(t, log.String(), `"level":"ERROR"`)
	assert.Contains(t, log.String(), "fell back to a floor of buildings")
}

// The fallback is reached only through a failed generation: the real generator
// builds floor 1 as a dungeon on every seed tried, its seed logged at debug so
// the floor can be rebuilt from it. FS-KE075 §A Requirement 9, §B R17.
func TestDungeonFloor1_FallbackOnlyOnError(t *testing.T) {
	log := capturedLog(t)
	for seed := uint64(1); seed <= 100; seed++ {
		s, _ := dungeonRun(t, seed, 1, 0)
		require.NotNil(t, s.dungeon, "seed %d fell back", seed)
	}
	assert.NotContains(t, log.String(), `"level":"ERROR"`)

	// the seed logged is the seed the layout came from
	log.Reset()
	s, _ := dungeonRun(t, 77, 1, 0)
	var logged struct {
		Msg  string `json:"msg"`
		Seed uint64 `json:"seed"`
	}
	for _, line := range bytes.Split(log.Bytes(), []byte("\n")) {
		if bytes.Contains(line, []byte("Dungeon floor generated")) {
			require.NoError(t, json.Unmarshal(line, &logged))
		}
	}
	require.NotZero(t, logged.Seed, "the seed is logged")
	again, err := levelgen.GenerateDungeon(levelgen.DungeonFloor1Params, logged.Seed)
	require.NoError(t, err)
	assert.Equal(t, s.dungeon.layout, again, "the logged seed rebuilds the floor")
}

// blockingGenerator holds the floor build inside the generator until released,
// then fails, so the build falls back to today's smaller floor.
type blockingGenerator struct {
	entered, release chan struct{}
}

func (b *blockingGenerator) generate(_ levelgen.DungeonParams, seed uint64) (levelgen.DungeonLayout, error) {
	select {
	case b.entered <- struct{}{}:
	default:
	}
	<-b.release
	return levelgen.DungeonLayout{}, fmt.Errorf("generate dungeon seed %d: %w", seed, levelgen.ErrNoLayout)
}

// The first floor is built on the server's goroutine while the loop already
// ticks, and a fallback floor changes the map's size mid-build. No tick runs
// while the build is under way: the loop stops broadcasting until the floor
// stands, then carries on, on the fallback floor's size. FS-KE075 §B R11, R17.
func TestFirstFloorBuild_NeverOverlapsATick(t *testing.T) {
	tick := time.Second / time.Duration(constants.GameFrameRate)
	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, serializer.NewStateSerializer(em, nil), em, &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	sender := &orderedSender{}
	s.sender = sender
	gen := &blockingGenerator{entered: make(chan struct{}, 1), release: make(chan struct{})}
	s.generateDungeon = gen.generate
	s.InitialSystems()
	id := uuid.New()
	s.AddPlayer(id, types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	go s.Start()
	defer s.Shutdown()

	require.Eventually(t, func() bool { return len(sender.to(id)) > 0 }, time.Second, time.Millisecond, "the loop ticks")

	built := make(chan struct{})
	go func() {
		defer close(built)
		s.InitialMapObjects(nil)
	}()
	<-gen.entered

	// a tick already in flight as the build began may still deliver
	time.Sleep(2 * tick)
	before := len(sender.to(id))
	time.Sleep(6 * tick)
	assert.Equal(t, before, len(sender.to(id)), "no tick while the floor is being built")

	close(gen.release)
	<-built
	require.Eventually(t, func() bool { return len(sender.to(id)) > before }, time.Second, time.Millisecond, "the loop ticks again")

	s.mu.RLock()
	defer s.mu.RUnlock()
	assert.Equal(t, constants.MapWidth, s.mapWidth, "the fallback floor's size")
}
