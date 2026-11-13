package game

import (
	"context"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
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
	s, ids := tomeRunOf(t, seed, height, tomeFloor, altarFloor, 1)
	return s, ids[0]
}

// tomeRunOf is tomeRun for a party of delvers, every reply to them recorded.
func tomeRunOf(t *testing.T, seed uint64, height, tomeFloor, altarFloor, delvers int) (*Session, []uuid.UUID) {
	t.Helper()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.sender = &recordingSender{}
	s.spawnRand = seededSpawns(seed)
	s.InitialSystems()
	currentFloor(t, s).Count = height
	s.setTomePlan(tomeFloor, altarFloor)
	ids := make([]uuid.UUID, delvers)
	for i := range ids {
		ids[i] = uuid.New()
		s.AddPlayer(ids[i], types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	}
	s.InitialMapObjects(nil)
	return s, ids
}

// standBy puts a delver well inside the interact range of target.
func standBy(t *testing.T, s *Session, playerID uuid.UUID, target *ecs.Entity) {
	t.Helper()
	at := transformOf(t, target)
	body := transformOf(t, delverEntity(t, s, playerID))
	body.X, body.Y = at.X+constants.DefaultInteractableRange/2, at.Y
}

// standFar puts a delver well out of the interact range of target.
func standFar(t *testing.T, s *Session, playerID uuid.UUID, target *ecs.Entity) {
	t.Helper()
	at := transformOf(t, target)
	body := transformOf(t, delverEntity(t, s, playerID))
	body.X, body.Y = at.X+constants.DefaultInteractableRange*4, at.Y
}

// repliesTo is every message the session sent playerID.
func repliesTo(s *Session, playerID uuid.UUID) []types.Message {
	return s.sender.(*recordingSender).to(playerID)
}

// planOf is the run's tome plan, which a tome run always has.
func planOf(t *testing.T, s *Session) *components.TomePlanComponent {
	t.Helper()
	plan, ok := s.tomePlan()
	require.True(t, ok, "a tome run has its plan")
	return plan
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

// Interact on the tome in range takes it: the tome is gone, the party carries
// it, and the taker alone is told tome_taken. FS-3103M §D R12-R13.
func TestHandleInteract_TakingTheTome(t *testing.T) {
	s, ids := tomeRunOf(t, 1, 3, 1, 2, 2)
	taker, other := ids[0], ids[1]
	tome := onlyEntity(t, s, ecs.ComponentTypeTome)
	standBy(t, s, taker, tome)
	standBy(t, s, other, tome)
	before := len(repliesTo(s, other))

	require.NoError(t, s.handleInteract(taker, tome.ID))

	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeTome), "the tome is taken off the floor")
	assert.True(t, planOf(t, s).Carried, "the party carries it")
	replies := repliesTo(s, taker)
	require.NotEmpty(t, replies)
	last := replies[len(replies)-1]
	assert.Equal(t, string(constants.ActionInteract), last.Action)
	payload := last.Payload
	assert.Equal(t, true, payload["success"])
	assert.Equal(t, ReasonTomeTaken, payload["reason"])
	assert.Len(t, repliesTo(s, other), before, "only the taker is told")
}

// A reach for the tome from out of range is refused as any interactable's is,
// and the tome stays. FS-3103M §D R12.
func TestHandleInteract_TomeOutOfRangeIsRefused(t *testing.T) {
	s, id := tomeRun(t, 1, 3, 1, 2)
	tome := onlyEntity(t, s, ecs.ComponentTypeTome)
	standFar(t, s, id, tome)

	require.ErrorIs(t, s.handleInteract(id, tome.ID), ErrOutOfRange)

	assert.Len(t, entityIDsWith(s, ecs.ComponentTypeTome), 1, "the tome still lies there")
	assert.False(t, planOf(t, s).Carried)
}

// Two delvers reaching for the tome in one tick: the first takes it, the
// second finds no entity and is refused as a vanished target is.
// FS-3103M §Edge States.
func TestHandleInteract_TwoTakesInOneTick(t *testing.T) {
	s, ids := tomeRunOf(t, 2, 3, 1, 2, 2)
	tome := onlyEntity(t, s, ecs.ComponentTypeTome)
	standBy(t, s, ids[0], tome)
	standBy(t, s, ids[1], tome)

	var first, second error
	s.queueIntent(func() { first = s.handleInteract(ids[0], tome.ID) })
	s.queueIntent(func() { second = s.handleInteract(ids[1], tome.ID) })
	s.applyIntents()

	require.NoError(t, first)
	require.ErrorIs(t, second, ErrEntityNotFound)
	assert.True(t, planOf(t, s).Carried)
}

// The tome is the party's, not the taker's: the taker dying or escaping leaves
// it carried, on every later floor. FS-3103M §D R12.
func TestTakeTome_StaysCarriedAfterTheTakerDiesOrEscapesAndOnLaterFloors(t *testing.T) {
	tests := []struct {
		name  string
		leave func(t *testing.T, s *Session, taker uuid.UUID)
	}{
		{"the taker dies", func(t *testing.T, s *Session, taker uuid.UUID) {
			hc, _ := delverEntity(t, s, taker).GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).IsEliminated = true
		}},
		{"the taker escapes", func(_ *testing.T, s *Session, taker uuid.UUID) { s.handlePlayerEscape(taker) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, ids := tomeRunOf(t, 3, 4, 1, 3, 2)
			tome := onlyEntity(t, s, ecs.ComponentTypeTome)
			standBy(t, s, ids[0], tome)
			require.NoError(t, s.handleInteract(ids[0], tome.ID))

			tt.leave(t, s, ids[0])
			require.NoError(t, s.regenerateFloor())

			assert.True(t, planOf(t, s).Carried, "the party still carries it on floor 2")
			state := runState(t, s, ids[1])
			assert.True(t, state.TomeCarried, "tome_carried rides the broadcast")
		})
	}
}

// runState is the state recipient is sent from the session's world now.
func runState(t *testing.T, s *Session, recipient uuid.UUID) *types.ClientGameState {
	t.Helper()
	stateSerializer := serializer.NewStateSerializer(s.EntityManager, nil)
	backendState, err := stateSerializer.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
	require.NoError(t, err)
	return stateSerializer.FormatStateToClientState(backendState, recipient)
}

// Before the take the broadcast carries no tome_carried. FS-3103M §E R14.
func TestRunState_NoTomeCarriedBeforeTheTake(t *testing.T) {
	s, id := tomeRun(t, 4, 3, 1, 2)
	assert.False(t, runState(t, s, id).TomeCarried)
}

// A reach for the altar without the tome is refused with altar_without_tome,
// changes nothing, and the altar can be reached again at once.
// FS-3103M §F R16.
func TestHandleInteract_AltarWithoutTheTomeIsRefused(t *testing.T) {
	s, id := tomeRun(t, 5, 3, 1, 2)
	require.NoError(t, s.regenerateFloor())
	altar := onlyEntity(t, s, ecs.ComponentTypeAltar)
	standBy(t, s, id, altar)
	monsters := len(monstersIn(s))

	for reach := range 2 {
		require.NoError(t, s.handleInteract(id, altar.ID), "reach %d", reach+1)

		replies := repliesTo(s, id)
		require.NotEmpty(t, replies)
		last := replies[len(replies)-1]
		assert.Equal(t, string(constants.ActionInteract), last.Action)
		assert.Equal(t, false, last.Payload["success"])
		assert.Equal(t, RefusalAltarWithoutTome, last.Payload["reason"], "reach %d", reach+1)
	}
	plan := planOf(t, s)
	assert.False(t, plan.Carried)
	assert.False(t, plan.Burned)
	assert.Len(t, monstersIn(s), monsters, "nothing is summoned")
}

// burnRun is a tome run of height 4 whose party took the tome on floor 1 and
// now stands on floor 2, the altar's, the taker far from the altar.
func burnRun(t *testing.T, seed uint64) (*Session, []uuid.UUID, *ecs.Entity) {
	t.Helper()
	s, ids := tomeRunOf(t, seed, 4, 1, 2, 2)
	tome := onlyEntity(t, s, ecs.ComponentTypeTome)
	standBy(t, s, ids[0], tome)
	require.NoError(t, s.handleInteract(ids[0], tome.ID))
	require.NoError(t, s.regenerateFloor())
	altar := onlyEntity(t, s, ecs.ComponentTypeAltar)
	standFar(t, s, ids[0], altar)
	return s, ids, altar
}

// demonsIn is every monster of archetype demon on the floor, by entity id.
func demonsIn(s *Session) map[uuid.UUID]*ecs.Entity {
	demons := map[uuid.UUID]*ecs.Entity{}
	for _, m := range monstersIn(s) {
		if monsterOf(m).Archetype == components.MonsterArchetypeDemon {
			demons[m.ID] = m
		}
	}
	return demons
}

// summoned is the one demon on the floor that was not in before.
func summoned(t *testing.T, s *Session, before map[uuid.UUID]*ecs.Entity) *ecs.Entity {
	t.Helper()
	var fresh []*ecs.Entity
	for id, m := range demonsIn(s) {
		if _, was := before[id]; !was {
			fresh = append(fresh, m)
		}
	}
	require.Len(t, fresh, 1, "exactly one demon is summoned")
	return fresh[0]
}

// Interact on the altar while the party carries the tome burns it: the plan
// reads burned and no longer carried, and one demon boss at the demon's level
// stands in the altar's room, clear of every delver's body; the burner gets
// no reply. A delver other than the taker can burn it. FS-3103M §F R17-R18.
func TestHandleInteract_BurningTheTomeSummonsVorsk(t *testing.T) {
	for seed := uint64(1); seed <= 6; seed++ {
		s, ids, altar := burnRun(t, seed)
		burner := ids[1]
		standBy(t, s, burner, altar)
		before := demonsIn(s)
		replies := len(repliesTo(s, burner))

		require.NoError(t, s.handleInteract(burner, altar.ID), "seed %d", seed)

		plan := planOf(t, s)
		assert.True(t, plan.Burned, "seed %d", seed)
		assert.False(t, plan.Carried, "seed %d", seed)
		state := runState(t, s, burner)
		require.NotNil(t, state.Altar, "seed %d", seed)
		assert.True(t, state.Altar.Burned, "seed %d", seed)
		assert.False(t, state.TomeCarried, "seed %d", seed)
		assert.Len(t, repliesTo(s, burner), replies, "seed %d: the broadcast says it, not a reply", seed)

		vorsk := summoned(t, s, before)
		m := monsterOf(vorsk)
		assert.True(t, m.Boss, "seed %d", seed)
		assert.False(t, m.Elite, "seed %d", seed)
		assert.Equal(t, demonLevel(1, 2), m.Level, "seed %d: the demon's level for a level-1 party on floor 2", seed)

		at, altarAt := transformOf(t, vorsk), transformOf(t, altar)
		assert.Equal(t, s.dungeon.roomAt(altarAt.X, altarAt.Y), s.dungeon.roomAt(at.X, at.Y), "seed %d: in the altar's room", seed)
		r := constants.PlayerRadius
		assert.True(t, s.dungeon.stands(centredArea(at.X, at.Y, r, r), s.dungeon.regionAt(at.X, at.Y), offDoorways), "seed %d: off doorways, clear of walls", seed)
		for _, id := range ids {
			body := transformOf(t, delverEntity(t, s, id))
			assert.False(t, overlaps(centredArea(at.X, at.Y, r, r), centredArea(body.X, body.Y, r, r)), "seed %d: on a delver", seed)
		}
		altarArea := centredArea(altarAt.X, altarAt.Y, constants.ContainerWidthRadius, constants.ContainerHeightRadius)
		assert.False(t, overlaps(centredArea(at.X, at.Y, r, r), altarArea), "seed %d: on the altar", seed)
	}
}

// Two delvers burning in one tick: the first burns and summons, the second is
// refused altar_burned; one Vorsk. FS-3103M §F R19.
func TestHandleInteract_TwoBurnsInOneTickSummonOneVorsk(t *testing.T) {
	s, ids, altar := burnRun(t, 2)
	standBy(t, s, ids[0], altar)
	standBy(t, s, ids[1], altar)
	before := demonsIn(s)

	var first, second error
	s.queueIntent(func() { first = s.handleInteract(ids[0], altar.ID) })
	s.queueIntent(func() { second = s.handleInteract(ids[1], altar.ID) })
	s.applyIntents()

	require.NoError(t, first)
	require.NoError(t, second)
	summoned(t, s, before)
	replies := repliesTo(s, ids[1])
	require.NotEmpty(t, replies)
	assert.Equal(t, RefusalAltarBurned, replies[len(replies)-1].Payload["reason"])
}

// fillRegion stands a ghoul on every cell centre of region, so no point of it
// lies MonsterSpacing clear of them all and no body fits anywhere on it.
func fillRegion(s *Session, region int) {
	d := s.dungeon
	cell := d.layout.CellSize
	for _, r := range d.regionCells(region) {
		for cy := r.Y; cy < r.Y+r.H; cy++ {
			for cx := r.X; cx < r.X+r.W; cx++ {
				CreateMonsterEntity(s.EntityManager, MonsterConfig{
					Archetype: components.MonsterArchetypeGhoul, Level: 1,
					X: (float64(cx) + 0.5) * cell, Y: (float64(cy) + 0.5) * cell,
				})
			}
		}
	}
}

// An altar room with no free spot puts Vorsk in another room, as a guaranteed
// boss is placed; a floor with none anywhere logs an error, and the altar
// stays burned. FS-3103M §F R18, §Edge States.
func TestHandleInteract_BurnWithNoRoomBesideTheAltar(t *testing.T) {
	t.Run("the altar's room is full", func(t *testing.T) {
		s, ids, altar := burnRun(t, 3)
		standBy(t, s, ids[1], altar)
		at := transformOf(t, altar)
		altarRoom := s.dungeon.roomAt(at.X, at.Y)
		fillRegion(s, s.dungeon.roomRegion(altarRoom))
		before := demonsIn(s)

		require.NoError(t, s.handleInteract(ids[1], altar.ID))

		vorsk := transformOf(t, summoned(t, s, before))
		room := s.dungeon.roomAt(vorsk.X, vorsk.Y)
		assert.NotEqual(t, -1, room, "in a room")
		assert.NotEqual(t, altarRoom, room, "not in the full room")
		assert.NotEqual(t, s.dungeon.layout.Roles.Start, room)
	})
	t.Run("the whole floor is full", func(t *testing.T) {
		log := capturedLog(t)
		s, ids, altar := burnRun(t, 4)
		standBy(t, s, ids[1], altar)
		for region := 1; region <= len(s.dungeon.layout.Regions); region++ {
			fillRegion(s, region)
		}
		before := demonsIn(s)

		require.NoError(t, s.handleInteract(ids[1], altar.ID))

		assert.Len(t, demonsIn(s), len(before), "no Vorsk")
		assert.True(t, planOf(t, s).Burned, "the altar stays burned")
		assert.Contains(t, log.String(), `"level":"ERROR","msg":"Vorsk not summoned`)
	})
}

// A blood demon already on the floor is left as it is: Vorsk comes beside it.
// FS-3103M §F R20.
func TestHandleInteract_BurnLeavesABloodDemonBeIt(t *testing.T) {
	s, ids, altar := burnRun(t, 5)
	standBy(t, s, ids[1], altar)
	blood := CreateMonsterEntity(s.EntityManager, MonsterConfig{
		Archetype: components.MonsterArchetypeBloodDemon, Level: 4, Boss: true, X: 100, Y: 100,
	})
	before := demonsIn(s)
	monsters := len(monstersIn(s))

	require.NoError(t, s.handleInteract(ids[1], altar.ID))

	summoned(t, s, before)
	still, ok := s.EntityManager.GetEntity(blood.ID)
	require.True(t, ok, "the blood demon stands")
	assert.Equal(t, components.MonsterArchetypeBloodDemon, monsterOf(still).Archetype)
	assert.Equal(t, 4, monsterOf(still).Level)
	assert.Len(t, monstersIn(s), monsters+1, "Vorsk comes on top of the floor's monsters")
}
