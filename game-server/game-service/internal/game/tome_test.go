package game

import (
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// At height 3 the only plan is the tome on floor 1 and the altar on floor 2:
// neither is ever the top floor. FS-3103M §B R6.
func TestRollTomePlan_Height3_TomeOnFloor1AltarOnFloor2(t *testing.T) {
	tome, altar, ok := rollTomePlan(seededSpawns(1), 3, 1)

	assert.True(t, ok, "a chance of 1 always plans a tome")
	assert.Equal(t, 1, tome, "the tome's floor")
	assert.Equal(t, 2, altar, "the altar's floor")
}

// TomeRunChance 1 plans a tome in every run, 0 in none, and the default plans
// one in about 1 run in 50. FS-3103M §B R5.
func TestRollTomePlan_ChanceDecidesTheShareOfTomeRuns(t *testing.T) {
	const runs = 20000
	tests := []struct {
		name     string
		chance   float64
		min, max int
	}{
		{"forced", 1, runs, runs},
		{"never", 0, 0, 0},
		{"the default, about 2%", TomeRunChance, runs * 15 / 1000, runs * 25 / 1000},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rng := seededSpawns(7)
			planned := 0
			for range runs {
				if _, _, ok := rollTomePlan(rng, 3+rng.IntN(8), tt.chance); ok {
					planned++
				}
			}
			assert.GreaterOrEqual(t, planned, tt.min)
			assert.LessOrEqual(t, planned, tt.max)
		})
	}
}

// At every height the tome lies in [1, height - 2] and the altar stands in
// [tome + 1, height - 1]; every such floor is drawn. FS-3103M §B R6.
func TestRollTomePlan_FloorsAlwaysInRange(t *testing.T) {
	for height := 3; height <= MasterSpireHeight; height++ {
		rng := seededSpawns(uint64(height))
		tomes, altars := map[int]bool{}, map[int]bool{}
		for range 2000 {
			tome, altar, ok := rollTomePlan(rng, height, 1)
			assert.True(t, ok)
			assert.GreaterOrEqual(t, tome, 1, "height %d", height)
			assert.LessOrEqual(t, tome, height-2, "height %d", height)
			assert.Greater(t, altar, tome, "height %d", height)
			assert.LessOrEqual(t, altar, height-1, "height %d: the altar is never on the top floor", height)
			tomes[tome], altars[altar] = true, true
		}
		assert.Len(t, tomes, height-2, "height %d: every tome floor drawn", height)
		assert.Len(t, altars, height-2, "height %d: every altar floor drawn", height)
	}
}

// A run's tome plan is rolled when the run is created, with its height, and
// held on the run-level entity; most runs have none. FS-3103M §B R5, R7.
func TestInitialSystems_RollsTheTomePlanOntoTheRunLevelEntity(t *testing.T) {
	planned := 0
	for seed := uint64(1); seed <= 500; seed++ {
		s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
		s.spawnRand = seededSpawns(seed)
		s.InitialSystems()

		plan, ok := s.tomePlan()
		if !ok {
			continue
		}
		planned++
		height := currentFloor(t, s).Count
		assert.GreaterOrEqual(t, plan.TomeFloor, 1, "seed %d", seed)
		assert.Greater(t, plan.AltarFloor, plan.TomeFloor, "seed %d", seed)
		assert.Less(t, plan.AltarFloor, height, "seed %d", seed)
		assert.False(t, plan.Carried, "seed %d", seed)
		assert.False(t, plan.Burned, "seed %d", seed)
		runLevel := onlyEntity(t, s, ecs.ComponentTypeTomePlan)
		assert.True(t, runLevel.HasComponent(ecs.ComponentTypeFloor), "seed %d: the plan sits beside the floor", seed)
	}
	assert.NotZero(t, planned, "some of 500 runs are tome runs")
	assert.Less(t, planned, 50, "most runs are not")
}

// The plan can be set in place of the roll, as the endgame test run sets it,
// and survives every floor change. FS-3103M §B R7, FS-BDRTJ.
func TestSetTomePlan_SurvivesTheFloorChange(t *testing.T) {
	s, _ := dungeonRun(t, 3, 1, 0)
	s.setTomePlan(1, 2)

	require.NoError(t, s.regenerateFloor())

	plan, ok := s.tomePlan()
	require.True(t, ok)
	assert.Equal(t, 1, plan.TomeFloor)
	assert.Equal(t, 2, plan.AltarFloor)
}

// tomeRun is a run of height floors whose tome lies on tomeFloor and whose
// altar stands on altarFloor, its first floor built for one delver.
func tomeRun(t *testing.T, seed uint64, height, tomeFloor, altarFloor int) (*Session, uuid.UUID) {
	t.Helper()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.spawnRand = seededSpawns(seed)
	s.InitialSystems()
	currentFloor(t, s).Count = height
	s.setTomePlan(tomeFloor, altarFloor)
	id := uuid.New()
	s.AddPlayer(id, types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	s.InitialMapObjects(nil)
	return s, id
}

// paddedAt is the ground a placed object of half-size (rw, rh) at e keeps.
func paddedAt(t *testing.T, e *ecs.Entity, rw, rh float64) PlaceArea {
	t.Helper()
	at := transformOf(t, e)
	return centredArea(at.X, at.Y, rw+containerPadding, rh+containerPadding)
}

// assertPlacedAlone checks the one entity with marker stands in a room that
// is not the start room, off its doorways, overlapping no other placed object.
func assertPlacedAlone(t *testing.T, s *Session, marker ecs.ComponentType, seed uint64) {
	t.Helper()
	e := onlyEntity(t, s, marker)
	at := transformOf(t, e)
	d := s.dungeon
	room := d.roomAt(at.X, at.Y)
	require.NotEqual(t, -1, room, "seed %d: %s stands in a room", seed, marker)
	assert.NotEqual(t, d.layout.Roles.Start, room, "seed %d: %s is not in the start room", seed, marker)
	assert.True(t, offDoorwaysIn(d, point{at.X, at.Y}, room), "seed %d: %s off the doorways", seed, marker)

	mine := paddedAt(t, e, constants.ContainerWidthRadius, constants.ContainerHeightRadius)
	others := map[ecs.ComponentType][2]float64{
		ecs.ComponentTypeContainer:  {constants.ContainerWidthRadius, constants.ContainerHeightRadius},
		ecs.ComponentTypeEscapeDoor: {constants.ContainerWidthRadius, constants.ContainerHeightRadius},
		ecs.ComponentTypeSwitch:     {constants.ContainerWidthRadius, constants.ContainerHeightRadius},
		ecs.ComponentTypeStairs:     {constants.StairsWidthRadius, constants.StairsHeightRadius},
		ecs.ComponentTypeTome:       {constants.ContainerWidthRadius, constants.ContainerHeightRadius},
		ecs.ComponentTypeAltar:      {constants.ContainerWidthRadius, constants.ContainerHeightRadius},
	}
	for kind, r := range others {
		for _, id := range entityIDsWith(s, kind) {
			if id == e.ID {
				continue
			}
			other, _ := s.EntityManager.GetEntity(id)
			assert.False(t, overlaps(mine, paddedAt(t, other, r[0], r[1])), "seed %d: %s overlaps a %s", seed, marker, kind)
		}
	}
}

// A tome run's tome floor holds exactly one tome and its altar floor exactly
// one altar, each in a non-start room, off doorways and overlapping nothing;
// no other floor holds either. FS-3103M §C R8-R9.
func TestBuildFloor_TomeRunPlacesTheTomeAndTheAltarOnTheirFloors(t *testing.T) {
	for seed := uint64(1); seed <= 8; seed++ {
		s, _ := tomeRun(t, seed, 4, 1, 3)
		for depth := 1; depth <= 4; depth++ {
			if depth > 1 {
				require.NoError(t, s.regenerateFloor(), "seed %d floor %d", seed, depth)
			}
			require.NotNil(t, s.dungeon, "seed %d floor %d: a dungeon floor", seed, depth)

			tomes, altars := entityIDsWith(s, ecs.ComponentTypeTome), entityIDsWith(s, ecs.ComponentTypeAltar)
			switch depth {
			case 1:
				assert.Empty(t, altars, "seed %d: no altar on the tome's floor", seed)
				assertPlacedAlone(t, s, ecs.ComponentTypeTome, seed)
			case 3:
				assert.Empty(t, tomes, "seed %d: no tome on the altar's floor", seed)
				assertPlacedAlone(t, s, ecs.ComponentTypeAltar, seed)
			default:
				assert.Empty(t, tomes, "seed %d floor %d", seed, depth)
				assert.Empty(t, altars, "seed %d floor %d", seed, depth)
			}
		}
	}
}

// A tome floor that falls back to a floor of buildings places neither the tome
// nor the altar, and says so in the log. FS-3103M §C R10.
func TestBuildFloor_TomeFloorFallbackPlacesNeitherAndWarns(t *testing.T) {
	log := capturedLog(t)
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.generateDungeon = (&failingGenerator{}).generate
	s.InitialSystems()
	currentFloor(t, s).Count = 3
	s.setTomePlan(1, 2)
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	s.InitialMapObjects(nil)

	require.Nil(t, s.dungeon, "the floor fell back to buildings")
	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeTome))
	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeAltar))
	warned := false
	for _, line := range strings.Split(log.String(), "\n") {
		if strings.Contains(line, `"level":"WARN"`) && strings.Contains(line, "neither tome nor altar") {
			warned = true
		}
	}
	assert.True(t, warned, "a warning is logged: %s", log.String())
}
