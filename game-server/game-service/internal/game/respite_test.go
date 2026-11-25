package game

import (
	"math"
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

// respiteRun is a seeded run of height floors for delvers, climbed to floor 2,
// every floor's fountain forced and no hallowed altar unless the test sets one.
func respiteRun(t *testing.T, seed uint64, delvers, height int) (*Session, []uuid.UUID) {
	t.Helper()
	s, ids := dungeonRun(t, seed, delvers, 0, withTuning(func(t *floorTuning) {
		t.fountainFloorChance, t.hallowedAltarRunChance = 1, 0
	}))
	s.sender = &recordingSender{}
	currentFloor(t, s).Count = height
	require.NoError(t, s.regenerateFloor())
	require.NotNil(t, s.dungeon, "seed %d: floor 2 is a dungeon floor", seed)
	return s, ids
}

// fountainOf is the floor's fountain entity and component, false with none.
func fountainOf(s *Session) (*ecs.Entity, *components.FountainComponent, bool) {
	for _, e := range s.EntityManager.GetAllEntities() {
		if fc, ok := e.GetComponent(ecs.ComponentTypeFountain); ok {
			return e, fc.(*components.FountainComponent), true
		}
	}
	return nil, nil, false
}

// FS-5FZ4J §G R40: about half of floors 2+ hold a fountain, never floor 1 and
// never the top, over a seed sweep of the floor draw.
func TestFountain_FloorOddsOverASeedSweep(t *testing.T) {
	const runs = 2000
	held := 0
	for seed := uint64(1); seed <= runs; seed++ {
		rng := seededSpawns(seed)
		assert.False(t, fountainFor(rng, firstFloor, false, FountainFloorChance), "never on floor 1")
		assert.False(t, fountainFor(rng, 5, true, FountainFloorChance), "never on the top floor")
		if fountainFor(rng, 4, false, FountainFloorChance) {
			held++
		}
	}
	assert.InDelta(t, FountainFloorChance, float64(held)/runs, 0.04)
}

// FS-5FZ4J §G R40, §D R21: a fountain stands in a room that is not the start,
// stairs, a treasure room, a seal piece's or a hidden room; the room holds no
// monster and no container; at most one a floor; its pool is 150% of the
// highest max health among the delvers in play at the build.
func TestFountain_RoomRulesOverASeedSweep(t *testing.T) {
	for seed := uint64(1); seed <= 30; seed++ {
		s, ids := respiteRun(t, seed, 2, 5)
		for depth := 2; depth <= 4; depth++ {
			e, fountain, ok := fountainOf(s)
			require.True(t, ok, "seed %d floor %d: a fountain is forced", seed, depth)
			require.Len(t, entityIDsWith(s, ecs.ComponentTypeFountain), 1, "at most one a floor")
			d := s.dungeon
			at := transformOf(t, e)
			room := d.roomAt(at.X, at.Y)
			require.GreaterOrEqual(t, room, 0, "seed %d floor %d: in a room", seed, depth)
			assert.NotEqual(t, d.layout.Roles.Start, room)
			assert.NotEqual(t, d.layout.Roles.Stairs, room)
			assert.NotContains(t, d.layout.Roles.Treasure, room)
			assert.False(t, d.isHidden(room), "seed %d floor %d: not a hidden room", seed, depth)
			assert.False(t, d.sealPieceRooms()[room], "seed %d floor %d: not a seal piece's room", seed, depth)
			assert.True(t, d.isRespite(room))
			for _, other := range s.EntityManager.GetAllEntities() {
				tc, placed := other.GetComponent(ecs.ComponentTypeTransform)
				if !placed || d.roomAt(tc.(*components.TransformComponent).X, tc.(*components.TransformComponent).Y) != room {
					continue
				}
				assert.False(t, other.HasComponent(ecs.ComponentTypeEnemy), "seed %d floor %d: no monster in the fountain's room", seed, depth)
				assert.False(t, other.HasComponent(ecs.ComponentTypeContainer), "seed %d floor %d: no container in it", seed, depth)
			}
			most := 0
			for _, id := range ids {
				most = max(most, healthComponentOf(delverEntity(t, s, id)).MaxHealth)
			}
			assert.Equal(t, int(math.Round(float64(most)*FountainPoolPercent/100)), fountain.Pool)
			require.NoError(t, s.regenerateFloor())
		}
		_, _, ok := fountainOf(s)
		assert.False(t, ok, "seed %d: none on the top floor", seed)
	}
}

// FS-5FZ4J §B R14: an ambush never spawns in a respite's room.
func TestAmbushRooms_NeverARespitesRoom(t *testing.T) {
	s, _ := respiteRun(t, 3, 1, 5)
	e, _, ok := fountainOf(s)
	require.True(t, ok)
	at := transformOf(t, e)
	room := s.dungeon.roomAt(at.X, at.Y)
	start := s.dungeon.roomCentre(s.dungeon.layout.Roles.Start)
	assert.NotContains(t, s.dungeon.ambushRooms(start), room)
}

// FS-5FZ4J §G R41 (the TDD seed): a delver at half health within 2 cells of a
// full fountain gains 4% of their max health over one second of the tick.
func TestFountain_HealsADelverBesideIt_OnTheTick(t *testing.T) {
	s, ids := respiteRun(t, 5, 1, 5)
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	// one tick, so the delver's gear counts toward their max
	tick(s)
	e, _, ok := fountainOf(s)
	require.True(t, ok)
	delver := delverEntity(t, s, ids[0])
	at, body := transformOf(t, e), transformOf(t, delver)
	body.X, body.Y = at.X+constants.PlayerRadius+5, at.Y
	health := healthComponentOf(delver)
	health.CurrentHealth = health.MaxHealth / 2
	before := health.CurrentHealth

	ticks(s, 30)

	assert.InDelta(t, before+health.MaxHealth*4/100, health.CurrentHealth, 1)
}

// FS-5FZ4J §I R46: the fountain rides the wire on its floor, whole, with its
// dry flag; it is absent where there is none.
func TestRunState_FountainOnItsFloor(t *testing.T) {
	s, ids := respiteRun(t, 5, 1, 5)
	e, fountain, ok := fountainOf(s)
	require.True(t, ok)

	got := runState(t, s, ids[0]).Fountain
	require.NotNil(t, got)
	assert.Equal(t, e.ID, got.EntityID)
	at := transformOf(t, e)
	assert.Equal(t, types.Position{X: at.X, Y: at.Y}, *got.Position)
	assert.False(t, got.Dry)

	fountain.Pool, fountain.Dry = 0, true
	assert.True(t, runState(t, s, ids[0]).Fountain.Dry)

	s.EntityManager.RemoveEntity(e.ID)
	frame := frameOf(t, s, types.WorldTypeRun, ids[0])
	assert.NotContains(t, frame, "fountain", "absent with none")
}

// FS-5FZ4J §G R42: a run holds a hallowed altar in 30% of runs, on a floor
// drawn uniformly from 2 to height - 1, half the time in a hidden room.
func TestHallowedAltarPlan_OddsFloorsAndHiddenShare(t *testing.T) {
	const runs = 4000
	planned, hidden := 0, 0
	floors := map[int]int{}
	for seed := uint64(1); seed <= runs; seed++ {
		floor, inHidden, ok := rollHallowedAltarPlan(seededSpawns(seed), 6, HallowedAltarRunChance, HallowedAltarHiddenShare)
		if !ok {
			continue
		}
		planned++
		floors[floor]++
		if inHidden {
			hidden++
		}
		assert.GreaterOrEqual(t, floor, 2)
		assert.LessOrEqual(t, floor, 5, "never the top")
	}
	assert.InDelta(t, HallowedAltarRunChance, float64(planned)/runs, 0.03)
	assert.InDelta(t, HallowedAltarHiddenShare, float64(hidden)/float64(planned), 0.05)
	assert.Len(t, floors, 4, "every floor of 2..5 drawn")
}

// FS-5FZ4J §G R42: the plan is rolled at run creation beside the tome plan
// and kept on the run-level entity.
func TestInitialSystems_RollsTheHallowedAltarPlan(t *testing.T) {
	s, _ := dungeonRun(t, 7, 1, 0, withTuning(func(t *floorTuning) { t.hallowedAltarRunChance = 1 }))
	plan, ok := s.hallowedAltarPlan()
	require.True(t, ok, "a forced chance rolls a plan")
	assert.GreaterOrEqual(t, plan.Floor, 2)
}

// hallowedRun is a seeded run of height floors for delvers whose hallowed
// altar stands on floor 2, hidden or not, climbed to floor 2; no fountain.
func hallowedRun(t *testing.T, seed uint64, delvers, height int, hidden bool) (*Session, []uuid.UUID) {
	t.Helper()
	s, ids := dungeonRun(t, seed, delvers, 0, withTuning(func(t *floorTuning) {
		t.fountainFloorChance, t.hallowedAltarRunChance = 0, 0
	}))
	s.sender = &recordingSender{}
	currentFloor(t, s).Count = height
	s.setHallowedAltarPlan(2, hidden)
	require.NoError(t, s.regenerateFloor())
	require.NotNil(t, s.dungeon)
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	return s, ids
}

// FS-5FZ4J §G R42: placed on its floor, in a room that is not the start, the
// stairs, a hidden room or a respite's; in a hidden room when the plan says
// so, concealed by its door and off the wire until it opens.
func TestHallowedAltar_PlacedOnItsFloor(t *testing.T) {
	for seed := uint64(1); seed <= 20; seed++ {
		s, ids := hallowedRun(t, seed, 1, 5, false)
		altar := onlyEntity(t, s, ecs.ComponentTypeHallowedAltar)
		at := transformOf(t, altar)
		room := s.dungeon.roomAt(at.X, at.Y)
		require.GreaterOrEqual(t, room, 0)
		assert.NotEqual(t, s.dungeon.layout.Roles.Start, room)
		assert.NotEqual(t, s.dungeon.layout.Roles.Stairs, room)
		assert.False(t, s.dungeon.isHidden(room))
		assert.False(t, s.dungeon.isRespite(room))
		assert.False(t, altar.HasComponent(ecs.ComponentTypeAltar), "never the Altar of Consecration")
		assert.NotNil(t, runState(t, s, ids[0]).HallowedAltar)

		require.NoError(t, s.regenerateFloor())
		assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeHallowedAltar), "seed %d: only on its floor", seed)
	}

	for seed := uint64(1); seed <= 20; seed++ {
		s, ids := hallowedRun(t, seed, 1, 5, true)
		altar := onlyEntity(t, s, ecs.ComponentTypeHallowedAltar)
		at := transformOf(t, altar)
		h, ok := s.dungeon.hiddenRoomOf(hiddenHallowedAltar)
		require.True(t, ok, "seed %d: the layout gave the altar its hidden room", seed)
		assert.Equal(t, h.Room, s.dungeon.roomAt(at.X, at.Y), "seed %d: in its hidden room", seed)
		assert.True(t, altar.HasComponent(ecs.ComponentTypeConcealed))
		assert.Nil(t, runState(t, s, ids[0]).HallowedAltar, "off the wire until its room opens")

		for _, door := range barriersOfKind(s, components.BarrierSecretDoor) {
			s.openSecretDoor(door)
		}
		assert.NotNil(t, runState(t, s, ids[0]).HallowedAltar, "seed %d: listed once reachable", seed)
	}
}

// pray reaches for the altar as delver and counts the prayer through.
func pray(t *testing.T, s *Session, delver uuid.UUID, altar *ecs.Entity) {
	t.Helper()
	standBy(t, s, delver, altar)
	require.NoError(t, s.handleInteract(delver, altar.ID))
	ticks(s, int(PrayDuration*30)+2)
}

// FS-5FZ4J §G R43: a 2 s prayer blesses every party member in play on the
// floor that tick, not the dead; the altar is spent after, and a second
// interact replies altar_prayed.
func TestHallowedAltar_PrayerBlessesThePartyInPlay(t *testing.T) {
	s, ids := hallowedRun(t, 4, 3, 5, false)
	altar := onlyEntity(t, s, ecs.ComponentTypeHallowedAltar)
	dead := delverEntity(t, s, ids[2])
	healthComponentOf(dead).CurrentHealth = 0
	tick(s)

	standBy(t, s, ids[0], altar)
	require.NoError(t, s.handleInteract(ids[0], altar.ID))
	ticks(s, int(PrayDuration*30)-5)
	assert.False(t, systems.Blessed(delverEntity(t, s, ids[0])), "not before the 2 s")
	require.NotNil(t, timedOpenOf(delverEntity(t, s, ids[0])))
	assert.Equal(t, components.TimedTargetPray, timedOpenOf(delverEntity(t, s, ids[0])).TargetKind)
	ticks(s, 7)

	assert.True(t, systems.Blessed(delverEntity(t, s, ids[0])), "the one who prayed")
	assert.True(t, systems.Blessed(delverEntity(t, s, ids[1])), "a teammate elsewhere on the floor")
	assert.False(t, systems.Blessed(dead), "not the dead")
	hc, _ := altar.GetComponent(ecs.ComponentTypeHallowedAltar)
	assert.True(t, hc.(*components.HallowedAltarComponent).Prayed)
	assert.True(t, runState(t, s, ids[0]).HallowedAltar.Prayed)

	s.mu.Lock()
	clear(s.playerInteractedCache)
	s.mu.Unlock()
	standBy(t, s, ids[1], altar)
	require.NoError(t, s.handleInteract(ids[1], altar.ID))
	assert.Equal(t, RefusalAltarPrayed, lastReply(t, s.sender.(*recordingSender), ids[1])["reason"])
	assert.Nil(t, timedOpenOf(delverEntity(t, s, ids[1])), "a spent altar starts no prayer")
}

// FS-5FZ4J §G R43, FS-MQYEX R6: moving breaks a prayer; nobody is blessed.
func TestHallowedAltar_MovingBreaksThePrayer(t *testing.T) {
	s, ids := hallowedRun(t, 4, 1, 5, false)
	altar := onlyEntity(t, s, ecs.ComponentTypeHallowedAltar)
	delver := delverEntity(t, s, ids[0])
	standBy(t, s, ids[0], altar)
	require.NoError(t, s.handleInteract(ids[0], altar.ID))
	tick(s)
	transformOf(t, delver).Y += 3

	ticks(s, int(PrayDuration*30)+2)

	assert.False(t, systems.Blessed(delver))
	hc, _ := altar.GetComponent(ecs.ComponentTypeHallowedAltar)
	assert.False(t, hc.(*components.HallowedAltarComponent).Prayed)
}

// FS-5FZ4J §G R44, §I R47: the Blessing is kept across a floor change, rides
// the public player state as blessed, and is lost on death.
func TestBlessing_KeptAcrossFloors_OnTheWire_LostOnDeath(t *testing.T) {
	s, ids := hallowedRun(t, 4, 2, 5, false)
	pray(t, s, ids[0], onlyEntity(t, s, ecs.ComponentTypeHallowedAltar))
	blessed := delverEntity(t, s, ids[0])
	require.True(t, systems.Blessed(blessed))

	others := runState(t, s, ids[1]).OtherPlayers
	require.Len(t, others, 1)
	assert.True(t, others[0].Blessed, "a teammate sees it")
	assert.True(t, runState(t, s, ids[0]).CurrentPlayer.Blessed)

	require.NoError(t, s.regenerateFloor())
	assert.True(t, systems.Blessed(blessed), "kept across the floor change")

	healthComponentOf(blessed).CurrentHealth = 0
	tick(s)
	assert.False(t, systems.Blessed(blessed), "lost on death")
}

// FS-5FZ4J §I R47: blessed is absent from the public player state when not.
func TestRunState_BlessedAbsentWhenNot(t *testing.T) {
	s, ids := hallowedRun(t, 4, 2, 5, false)
	frame := frameOf(t, s, types.WorldTypeRun, ids[0])
	assert.NotContains(t, frame["current_player"], "blessed")
	for _, other := range runState(t, s, ids[0]).OtherPlayers {
		assert.False(t, other.Blessed)
	}
}

// fixedRoll is a loot source whose every Float64 draw is at.
type fixedRoll struct{ at float64 }

func (f fixedRoll) Float64() float64 { return f.at }
func (f fixedRoll) IntN(int) int     { return 0 }

// FS-5FZ4J §G R44: a kill credited to a blessed killer rolls its drop chance
// times 1.10: a roll between the plain chance and 1.10 of it drops for the
// blessed killer and not for anyone else.
func TestMonsterDrops_BlessedKillerRollsTenPercentMore(t *testing.T) {
	record := bloodDemonRecord(5)
	record.Archetype = components.MonsterArchetypeGhoul
	record.Boss = false
	table, ok := monsterDropFor(record)
	require.True(t, ok)
	plain := min(table.Chance*floorFactor(record.Floor), 1)
	require.Less(t, plain*BlessingDropFactor, 1.0, "the row leaves room to raise")
	between := fixedRoll{at: plain * (1 + (BlessingDropFactor-1)/2)}

	for _, tt := range []struct {
		name    string
		blessed bool
		drops   bool
	}{
		{"a plain killer", false, false},
		{"a blessed killer", true, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := dropSession()
			killer := s.EntityManager.CreateEntity()
			killer.AddComponent(components.NewPlayerComponent(record.KillerMemberID, "warrior", "Wren", false))
			if tt.blessed {
				systems.Bless(killer)
			}

			newMonsterDrops(s, between).ConsumeKill(record)

			assert.Equal(t, tt.drops, len(dropPiles(s)) > 0)
		})
	}
}
