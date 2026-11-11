package game

import (
	"context"
	"math"
	"math/rand/v2"
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

// delverAt is one member of a test roster: their level and where they stand.
type delverAt struct {
	level int
	x, y  float64
}

// seededSpawns is a deterministic spawn source, so a population can be replayed.
func seededSpawns(seed uint64) *rand.Rand {
	return rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15))
}

// rosterOnRun is a run whose roster stands where the test puts it, before
// anything is built: the session is not started, so the test is the only thing
// touching the world. Nothing is built yet; the caller builds the floor, and
// building one sets the party down together, wherever the test put them.
func rosterOnRun(t *testing.T, seed uint64, roster ...delverAt) *Session {
	t.Helper()

	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.spawnRand = seededSpawns(seed)
	s.InitialSystems()
	fixSpireHeight(t, s)

	for i, d := range roster {
		playerID := uuid.New()
		s.AddPlayer(playerID, types.CharacterInPlay{Name: "delver", Class: "warrior"}, "")

		entity, ok := s.EntityManager.GetEntity(s.playerIDToEntitiesID[playerID])
		require.True(t, ok, "delver %d was not placed", i)

		sc, _ := entity.GetComponent(ecs.ComponentTypeStats)
		sc.(*components.StatsComponent).Level = d.level

		tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
		transform := tc.(*components.TransformComponent)
		transform.X, transform.Y = d.x, d.y
	}

	return s
}

// monstersIn is every monster in the world.
func monstersIn(s *Session) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeEnemy) {
			out = append(out, e)
		}
	}
	return out
}

// standardMonstersIn is every monster but the demon: the ones the standard
// count, mix, spread and placement rules govern.
func standardMonstersIn(s *Session) []*ecs.Entity {
	var out []*ecs.Entity
	for _, m := range monstersIn(s) {
		if !monsterOf(m).Boss {
			out = append(out, m)
		}
	}
	return out
}

func monsterOf(e *ecs.Entity) *components.MonsterComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeEnemy)
	return c.(*components.MonsterComponent)
}

// The party's strongest member sets the bar: a level-3 and a level-7 delver on
// floor 1 face monsters of level 7 ± 1. FS-77AB6 §Requirements 21–22; floor
// 1's count is a dungeon floor's (FS-KE075 §C R18).
func TestNewRun_PopulatesMonstersLevelledToTheHighestDelver(t *testing.T) {
	for seed := uint64(1); seed <= 20; seed++ {
		s := rosterOnRun(t, seed, delverAt{level: 3, x: 80, y: 80}, delverAt{level: 7, x: 140, y: 80})
		s.InitialMapObjects(nil)

		monsters := standardMonstersIn(s)
		require.GreaterOrEqual(t, len(monsters), DungeonMonstersMin, "seed %d", seed)
		require.LessOrEqual(t, len(monsters), DungeonMonstersMax, "seed %d", seed)

		for _, m := range monsters {
			level := monsterOf(m).Level
			assert.GreaterOrEqual(t, level, 6, "seed %d", seed)
			assert.LessOrEqual(t, level, 8, "seed %d", seed)
		}
	}
}

// A monster stands on open ground: in no building, on no door, chest, switch or
// escape door, on no other monster, and well clear of every delver.
// FS-77AB6 §Requirements 22; floor 1's count is a dungeon floor's (FS-KE075
// §C R18).
func TestNewRun_PlacesMonstersOnOpenGroundAwayFromDelvers(t *testing.T) {
	r := constants.PlayerRadius

	for seed := uint64(1); seed <= 40; seed++ {
		s := rosterOnRun(t, seed, delverAt{level: 1, x: 100, y: 100}, delverAt{level: 1, x: 1300, y: 860})
		s.InitialMapObjects(nil)

		entities := s.EntityManager.GetAllEntities()
		keepOut := mapKeepOut(entities)
		require.NotEmpty(t, keepOut, "the floor has a layout to keep out of")
		// the floor set the party down together before its monsters came
		delvers := inPlayPositions(delversOf(entities))
		require.Len(t, delvers, 2)

		monsters := monstersIn(s)
		standard := len(standardMonstersIn(s))
		require.GreaterOrEqual(t, standard, DungeonMonstersMin, "seed %d", seed)
		require.LessOrEqual(t, standard, DungeonMonstersMax, "seed %d", seed)

		for i, m := range monsters {
			at := transformOf(t, m)

			assert.True(t, at.X >= r && at.X <= s.mapWidth-r && at.Y >= r && at.Y <= s.mapHeight-r,
				"seed %d: monster outside the map at (%.0f, %.0f)", seed, at.X, at.Y)

			for _, area := range keepOut {
				assert.False(t, area.overlapsBody(at.X, at.Y, r),
					"seed %d: monster at (%.0f, %.0f) overlaps %+v", seed, at.X, at.Y, area)
			}

			for _, d := range delvers {
				assert.GreaterOrEqual(t, math.Hypot(at.X-d.x, at.Y-d.y), MonsterDelverExclusion,
					"seed %d: monster spawned on top of a delver", seed)
			}

			for _, other := range monsters[i+1:] {
				o := transformOf(t, other)
				assert.GreaterOrEqual(t, math.Hypot(at.X-o.X, at.Y-o.Y), 2*r,
					"seed %d: two monsters overlap", seed)
			}
		}
	}
}

// The building footprint is kept out whole, so no monster starts shut inside.
func TestMapKeepOut_CoversTheWholeBuilding(t *testing.T) {
	s := rosterOnRun(t, 1)
	s.AddBuilding(400, 300, 300, 200, 20, runDoorWidth)

	keepOut := mapKeepOut(s.EntityManager.GetAllEntities())

	inside := point{550, 400}
	covered := false
	for _, area := range keepOut {
		if area.overlapsBody(inside.x, inside.y, constants.PlayerRadius) {
			covered = true
		}
	}
	assert.True(t, covered, "the floor enclosed by a building's walls is not open ground")
}

// A floor deeper in the run is visibly harder: higher levels, by the floor
// offset, with the same spread. FS-77AB6 §Requirements 21.
func TestBuildFloor_LevelsMonstersByTheFloorDepth(t *testing.T) {
	tests := []struct {
		name     string
		levels   []int
		floor    int
		min, max int
	}{
		{"party level 1 on floor 1 never goes below 1", []int{1}, 1, 1, 2},
		{"party level 1 on floor 3", []int{1}, 3, 2, 4},
		{"mixed party on floor 3 scales to the highest", []int{2, 5}, 3, 6, 8},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for seed := uint64(1); seed <= 10; seed++ {
				roster := make([]delverAt, len(tt.levels))
				for i, level := range tt.levels {
					roster[i] = delverAt{level: level, x: 80 + 60*float64(i), y: 80}
				}
				s := rosterOnRun(t, seed, roster...)
				s.buildFloor(tt.floor, nil)

				monsters := standardMonstersIn(s)
				require.NotEmpty(t, monsters)
				for _, m := range monsters {
					level := monsterOf(m).Level
					assert.GreaterOrEqual(t, level, tt.min, "seed %d", seed)
					assert.LessOrEqual(t, level, tt.max, "seed %d", seed)
				}
			}
		})
	}
}

func TestMonsterLevel_IsPartyPlusFloorOffsetPlusSpreadAtLeastOne(t *testing.T) {
	tests := []struct {
		party, floor, spread, want int
	}{
		{1, 1, -1, 1}, // clamped
		{1, 1, 0, 1},
		{1, 1, 1, 2},
		{7, 1, -1, 6},
		{1, 3, 0, 3},
		{4, 2, 1, 6},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.want, monsterLevel(tt.party, tt.floor, tt.spread), "%+v", tt)
	}
}

// Over many seeded populations the mix matches the configured chance: a quarter
// trolls on floor 1, more on floor 3, never more than the cap.
// FS-77AB6 §Requirements 22.
func TestRollMonsters_TrollShareMatchesTheFloor(t *testing.T) {
	tests := []struct {
		floor int
		want  float64
	}{
		{1, 0.25},
		{3, 0.45},
		{9, 0.60}, // capped
	}

	for _, tt := range tests {
		rng := seededSpawns(uint64(tt.floor))
		trolls, total := 0, 0
		for range 2000 {
			for _, m := range rollMonsters(rng, 1, tt.floor) {
				total++
				if m.Archetype == components.MonsterArchetypeTroll {
					trolls++
				}
			}
		}
		assert.InDelta(t, tt.want, float64(trolls)/float64(total), 0.02, "floor %d", tt.floor)
	}
}

// A rolled non-troll monster is 70% ghoul, 20% Barrow Thrall, 10% Spire Wraith
// on every Spire floor, and nothing else, while the troll share stands.
// FS-M8CSE §D R18.
func TestRollArchetype_NonTrollMixOnEveryFloor(t *testing.T) {
	const rolls = 40000
	for floor := 1; floor <= 10; floor++ {
		rng := seededSpawns(uint64(300 + floor))
		counts := map[components.MonsterArchetype]int{}
		for range rolls {
			counts[rollArchetype(rng, floor)]++
		}

		nonTroll := float64(rolls - counts[components.MonsterArchetypeTroll])
		assert.InDelta(t, trollShare(floor), float64(counts[components.MonsterArchetypeTroll])/rolls, 0.01, "floor %d troll share", floor)
		assert.InDelta(t, 0.70, float64(counts[components.MonsterArchetypeGhoul])/nonTroll, 0.015, "floor %d ghouls", floor)
		assert.InDelta(t, 0.20, float64(counts[components.MonsterArchetypeBarrowThrall])/nonTroll, 0.015, "floor %d Barrow Thralls", floor)
		assert.InDelta(t, 0.10, float64(counts[components.MonsterArchetypeSpireWraith])/nonTroll, 0.015, "floor %d Spire Wraiths", floor)
		assert.Len(t, counts, 4, "floor %d rolls only the four", floor)
	}
}

// The shares of a non-troll roll make up the whole of it. FS-M8CSE §D R18.
func TestSpireNonTrollMix_SharesSumToOne(t *testing.T) {
	total := 0.0
	for _, row := range spireNonTrollMix {
		total += row.Share
	}
	assert.InDelta(t, 1.0, total, 1e-9)
}

// The Spire's roll stays the Spire's: populating is a run's alone, so a field
// with a delver in it gains no monster by it, tower monster or otherwise.
// FS-M8CSE §D R18.
func TestPopulateMonsters_NoFieldRollsTheSpiresMix(t *testing.T) {
	field := builtField(t)
	field.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	require.NotEmpty(t, delversOf(field.EntityManager.GetAllEntities()))
	before := len(monstersIn(field))

	field.populateMonsters(firstFloor, false, nil)

	assert.Len(t, monstersIn(field), before)
}

// The archetype strings the client's type and sheets are keyed on. FS-M8CSE §D R21.
func TestTowerMonsters_ArchetypeStrings(t *testing.T) {
	assert.Equal(t, "barrow_thrall", string(components.MonsterArchetypeBarrowThrall))
	assert.Equal(t, "spire_wraith", string(components.MonsterArchetypeSpireWraith))
}

// The Barrow Thrall is the zombie's sheet and the Spire Wraith the ghost's,
// under their own names and with no field factor. FS-M8CSE §D R19.
func TestTowerMonsters_CarryTheForestsSheets(t *testing.T) {
	tests := []struct {
		archetype, source components.MonsterArchetype
		name              string
		hp, damage        int
	}{
		{components.MonsterArchetypeBarrowThrall, components.MonsterArchetypeZombie, "Barrow Thrall", 70, 9},
		{components.MonsterArchetypeSpireWraith, components.MonsterArchetypeGhost, "Spire Wraith", 30, 8},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sheet, ok := monsterSheets[tt.archetype]
			require.True(t, ok, "a tower monster has a sheet")
			assert.Equal(t, tt.name, sheet.Name)
			assert.Equal(t, tt.hp, sheet.HP)
			assert.Equal(t, tt.damage, sheet.Damage)

			want := monsterSheets[tt.source]
			want.Name = tt.name
			assert.Equal(t, want, sheet, "every other field is the source's")
		})
	}
}

// An elite tower monster's server-authored name is its prefix and its two-word
// name, which the client's plate splits. FS-M8CSE §D R21.
func TestRollAs_EliteTowerMonsterIsNamedInFull(t *testing.T) {
	monster := rollAs(fixedRand{0}, components.MonsterArchetypeBarrowThrall, 3, 1, 1)

	assert.True(t, monster.Elite)
	assert.Equal(t, ElitePrefixes[0]+" Barrow Thrall", monster.Name)
}

// Count and spread cover their whole ranges, and nothing outside them.
func TestRollMonsters_CountAndSpreadStayInRange(t *testing.T) {
	rng := seededSpawns(7)
	counts := map[int]bool{}
	levels := map[int]bool{}

	for range 2000 {
		monsters := rollMonsters(rng, 5, 1)
		counts[len(monsters)] = true
		for _, m := range monsters {
			levels[m.Level] = true
		}
	}

	for n := MonsterCountMin; n <= MonsterCountMax; n++ {
		assert.True(t, counts[n], "a floor of %d monsters never rolled", n)
	}
	assert.Len(t, counts, MonsterCountMax-MonsterCountMin+1)
	assert.Equal(t, map[int]bool{4: true, 5: true, 6: true}, levels)
}

// HP and damage grow 12% a level, defense and magic resistance 5%, rounded.
// FS-77AB6 §Requirements 20.
func TestMonsterSheet_FollowsTheLevelCurve(t *testing.T) {
	tests := []struct {
		name      string
		archetype components.MonsterArchetype
		level     int
		want      monsterStats
	}{
		{"ghoul at level 1 is its sheet", components.MonsterArchetypeGhoul, 1, monsterStats{HP: 40, Damage: 6, Defense: 2, MagicResistance: 0}},
		{"troll at level 1 is its sheet", components.MonsterArchetypeTroll, 1, monsterStats{HP: 140, Damage: 16, Defense: 10, MagicResistance: 4}},
		// ×1.48 and ×1.20
		{"ghoul at level 5", components.MonsterArchetypeGhoul, 5, monsterStats{HP: 59, Damage: 9, Defense: 2, MagicResistance: 0}},
		{"troll at level 5", components.MonsterArchetypeTroll, 5, monsterStats{HP: 207, Damage: 24, Defense: 12, MagicResistance: 5}},
		// ×2.08 and ×1.45
		{"troll at level 10", components.MonsterArchetypeTroll, 10, monsterStats{HP: 291, Damage: 33, Defense: 15, MagicResistance: 6}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, monsterSheets[tt.archetype].statsAt(tt.level))
		})
	}
}

// A spawned monster carries its level's numbers where the CombatSystem and
// MovementSystem read them, and never a Player tag.
func TestCreateMonsterEntity_CarriesItsLevelsStats(t *testing.T) {
	em := ecs.NewEntityManager()
	m := CreateMonsterEntity(em, MonsterConfig{Archetype: components.MonsterArchetypeTroll, Level: 5, X: 300, Y: 200})
	want := monsterSheets[components.MonsterArchetypeTroll].statsAt(5)

	assert.False(t, m.HasComponent(ecs.ComponentTypePlayer), "a monster is not a delver")

	hc, _ := m.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)
	assert.Equal(t, want.HP, health.CurrentHealth)
	assert.Equal(t, want.HP, health.MaxHealth)

	cc, _ := m.GetComponent(ecs.ComponentTypeCombat)
	combat := cc.(*components.CombatComponent)
	assert.Equal(t, want.Damage, combat.Attack)
	assert.Equal(t, want.Defense, combat.Defense)
	assert.Equal(t, want.MagicResistance, combat.MagicResistance)

	vc, _ := m.GetComponent(ecs.ComponentTypeVelocity)
	velocity := vc.(*components.VelocityComponent)
	assert.Equal(t, 90.0, velocity.Speed)
	assert.Zero(t, velocity.VX)
	assert.Zero(t, velocity.VY)

	monster := monsterOf(m)
	assert.Equal(t, "Troll", monster.Name)
	assert.Equal(t, 5, monster.Level)
	assert.False(t, monster.Elite)
	assert.False(t, monster.Boss)
	assert.Equal(t, components.MonsterActionIdle, monster.Action)
	assert.NotZero(t, math.Hypot(monster.FacingX, monster.FacingY), "a standing monster still faces somewhere")
	assert.Equal(t, 300.0, monster.HomeX)
	assert.Equal(t, 200.0, monster.HomeY)
	at := transformOf(t, m)
	assert.Equal(t, 300.0, at.X)
	assert.Equal(t, 200.0, at.Y)
}

// A crowded floor places who it can and skips the rest: never an overlap, never
// a monster forced onto a delver. FS-77AB6 §Edge States "Placement exhausted".
func TestPopulateMonsters_SkipsWhatCannotBePlaced(t *testing.T) {
	em := ecs.NewEntityManager()
	// a 500 px square: nowhere on it is 350 px from a delver at its centre
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, nil,
		WorldBounds{Type: types.WorldTypeRun, Width: 500, Height: 500})
	s.spawnRand = seededSpawns(3)
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "delver", Class: "warrior"}, "")
	for _, e := range em.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypePlayer) {
			at := transformOf(t, e)
			at.X, at.Y = 250, 250
		}
	}

	s.populateMonsters(1, false, nil)

	assert.Empty(t, monstersIn(s))
}

// Nobody placed, nobody to fight: an empty run is not populated.
// FS-77AB6 §Edge States "Empty roster at population".
func TestBuildFloor_LeavesAFloorWithNoRosterEmpty(t *testing.T) {
	s := newRun(t, &countingItemsClient{})

	assert.Empty(t, monstersIn(s))
}

// The hub is never populated, whatever asks. FS-77AB6 §Requirements 22.
func TestPopulateMonsters_NeverInTheHub(t *testing.T) {
	em := ecs.NewEntityManager()
	hub := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, nil, HubBounds())
	hub.spawnRand = seededSpawns(1)
	hub.InitialHubMapObjects()
	hub.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")

	hub.populateMonsters(1, false, nil)
	for range 5 {
		tick(hub)
	}

	assert.Empty(t, monstersIn(hub))
}

// A floor change clears the old floor's monsters with the rest of it and the
// new floor is populated afresh, clear of where the party now stands.
// FS-F6F88 §Requirements 9–12 with FS-77AB6 §Requirements 22.
func TestRegenerateFloor_RepopulatesTheNewFloor(t *testing.T) {
	s := rosterOnRun(t, 11, delverAt{level: 2, x: 100, y: 100})
	s.InitialMapObjects(nil)

	floorOne := map[uuid.UUID]bool{}
	for _, m := range monstersIn(s) {
		floorOne[m.ID] = true
	}
	require.NotEmpty(t, floorOne)

	require.NoError(t, s.regenerateFloor())

	monsters := monstersIn(s)
	require.NotEmpty(t, monsters, "the new floor has monsters of its own")

	var delver *ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypePlayer) {
			delver = e
		}
	}
	d := transformOf(t, delver)

	for _, m := range monsters {
		assert.False(t, floorOne[m.ID], "a monster from floor 1 survived the floor change")
		assert.GreaterOrEqual(t, monsterOf(m).Level, 2, "floor 2 is levelled by its depth")
		at := transformOf(t, m)
		assert.GreaterOrEqual(t, math.Hypot(at.X-d.X, at.Y-d.Y), MonsterDelverExclusion,
			"a monster spawned on the delver's new spawn point")
	}
}

// Every monster on a floor of buildings reaches every delver's broadcast.
// FS-77AB6 §Requirements 32. A dungeon floor is cut by distance instead
// (FS-KE075 §G, interest_test.go).
func TestRunBroadcast_CarriesTheFloorsMonsters(t *testing.T) {
	s := rosterOnRun(t, 5, delverAt{level: 1, x: 100, y: 100})
	s.InitialMapObjects(nil)
	failGeneration(s)
	require.NoError(t, s.regenerateFloor())
	require.NotEmpty(t, monstersIn(s))

	stateSerializer := serializer.NewStateSerializer(s.EntityManager, nil)
	backendState, err := stateSerializer.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
	require.NoError(t, err)
	state := stateSerializer.FormatStateToClientState(backendState, s.GetPlayerIDs()[0])

	want := map[uuid.UUID]bool{}
	for _, m := range monstersIn(s) {
		want[m.ID] = true
	}
	got := map[uuid.UUID]bool{}
	for _, m := range state.Monsters {
		got[m.EntityID] = true
		assert.Contains(t, []string{"ghoul", "troll", "barrow_thrall", "spire_wraith", "demon", "blood_demon"}, m.Archetype) // any floor may roll a blood demon (FS-VHGE7 §A R6)
		assert.Equal(t, "idle", m.Action)
		assert.Positive(t, m.MaxHealth)
		assert.Equal(t, m.MaxHealth, m.CurrentHealth)
	}
	assert.Equal(t, want, got)
}

// The top floor always holds exactly one demon, in addition to the standard
// count, at party level + floor offset + 2 with no spread, and it is never an
// elite. FS-77AB6 §Requirements 21, 24.
func TestPopulateMonsters_TopFloorHasExactlyOneDemon(t *testing.T) {
	for seed := uint64(1); seed <= 30; seed++ {
		s := rosterOnRun(t, seed, delverAt{level: 2, x: 100, y: 100}, delverAt{level: 4, x: 160, y: 100})
		s.populateMonsters(3, true, nil)

		var demons []*components.MonsterComponent
		standard := 0
		for _, m := range monstersIn(s) {
			monster := monsterOf(m)
			if monster.Boss {
				// the green one: the top floor may hold a blood demon too (FS-VHGE7 §A R7)
				if monster.Archetype == components.MonsterArchetypeDemon {
					demons = append(demons, monster)
				}
				continue
			}
			standard++
		}

		require.Len(t, demons, 1, "seed %d", seed)
		demon := demons[0]
		assert.Equal(t, components.MonsterArchetypeDemon, demon.Archetype)
		assert.Equal(t, 4+MonsterLevelPerFloor*2+DemonLevelBonus, demon.Level, "seed %d", seed)
		assert.Equal(t, "Demon", demon.Name)
		assert.False(t, demon.Elite, "the demon is never an elite")
		assert.GreaterOrEqual(t, standard, MonsterCountMin, "seed %d: the demon is in addition", seed)
	}
}

// Off the top floor the demon comes on its rare roll, at the configured rate on
// floors 1 and 3; on the top floor, always. FS-77AB6 §Requirements 24.
func TestRollDemon_RateMatchesTheConfiguredChance(t *testing.T) {
	const rolls = 40000

	for _, floor := range []int{1, 3} {
		rng := seededSpawns(uint64(100 + floor))
		demons := 0
		for range rolls {
			if _, rolled := rollDemon(rng, 1, floor, false); rolled {
				demons++
			}
		}
		assert.InDelta(t, DemonChance, float64(demons)/rolls, 0.002, "floor %d", floor)
	}

	rng := seededSpawns(9)
	for range 1000 {
		demon, rolled := rollDemon(rng, 1, 3, true)
		require.True(t, rolled, "the top floor always has its demon")
		assert.True(t, demon.Boss)
		assert.False(t, demon.Elite)
	}
}

// A guaranteed demon on a floor with no spot clear of the delvers relaxes the
// exclusion rather than vanish; a rolled one off the top floor is just skipped.
// FS-77AB6 §Edge States "Placement exhausted".
func TestPopulateMonsters_GuaranteedDemonRelaxesTheDelverExclusion(t *testing.T) {
	crowded := func(seed uint64) *Session {
		em := ecs.NewEntityManager()
		// a 500 px square: nowhere on it is 350 px from a delver at its centre
		s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, nil,
			WorldBounds{Type: types.WorldTypeRun, Width: 500, Height: 500})
		s.spawnRand = seededSpawns(seed)
		s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "delver", Class: "warrior"}, "")
		for _, e := range em.GetAllEntities() {
			if e.HasComponent(ecs.ComponentTypePlayer) {
				at := transformOf(t, e)
				at.X, at.Y = 250, 250
			}
		}
		return s
	}

	for seed := uint64(1); seed <= 10; seed++ {
		s := crowded(seed)
		s.populateMonsters(testSpireHeight, true, nil)

		monsters := monstersIn(s)
		require.Len(t, monsters, 1, "seed %d: only the guaranteed demon stands", seed)
		assert.True(t, monsterOf(monsters[0]).Boss)

		// relaxed, it still takes the farthest spot it sampled: out in a corner
		at := transformOf(t, monsters[0])
		assert.Greater(t, math.Hypot(at.X-250, at.Y-250), 250.0, "seed %d", seed)
	}
}

// The demon takes the valid spot farthest from the delvers among its sample.
func TestSpawnArea_PlaceFarthestKeepsAwayFromTheDelvers(t *testing.T) {
	area := spawnArea{width: 1400, height: 900, delvers: []point{{100, 100}}}

	x, y, ok := area.placeFarthest(seededSpawns(4), area.valid)

	require.True(t, ok)
	assert.Greater(t, math.Hypot(x-100, y-100), 1300.0, "a corner far from the delver, not just any valid spot")
}

// Each standard monster rolls once to be an elite, at the floor's configured
// chance up to its cap, and carries a prefix from the authored list.
// FS-77AB6 §Requirements 23.
func TestRollMonsters_EliteRateMatchesTheFloor(t *testing.T) {
	tests := []struct {
		floor int
		want  float64
	}{
		{1, 0.03},
		{3, 0.07},
		{20, 0.25}, // capped
	}

	for _, tt := range tests {
		rng := seededSpawns(uint64(200 + tt.floor))
		elites, total := 0, 0
		for range 4000 {
			for _, m := range rollMonsters(rng, 1, tt.floor) {
				total++
				base := monsterSheets[m.Archetype].Name
				if !m.Elite {
					assert.Contains(t, []string{"", base}, m.Name, "a plain monster goes by its archetype")
					continue
				}
				elites++
				assert.False(t, m.Boss)
				prefixed := false
				for _, prefix := range ElitePrefixes {
					if m.Name == prefix+" "+base {
						prefixed = true
					}
				}
				assert.True(t, prefixed, "elite named %q", m.Name)
			}
		}
		assert.InDelta(t, tt.want, float64(elites)/float64(total), 0.005, "floor %d", tt.floor)
	}
}

// An elite is its archetype at its level, with ×2.5 HP and ×1.5 damage and
// nothing else changed. FS-77AB6 §Requirements 23.
func TestCreateMonsterEntity_EliteHasMoreHealthAndDamage(t *testing.T) {
	em := ecs.NewEntityManager()
	m := CreateMonsterEntity(em, MonsterConfig{
		Archetype: components.MonsterArchetypeGhoul, Level: 5, Elite: true, Name: "Dread Ghoul", X: 300, Y: 200,
	})
	base := monsterSheets[components.MonsterArchetypeGhoul].statsAt(5) // 59 HP, 9 dmg

	hc, _ := m.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)
	assert.Equal(t, 148, health.MaxHealth) // round(59 × 2.5)
	assert.Equal(t, health.MaxHealth, health.CurrentHealth)

	cc, _ := m.GetComponent(ecs.ComponentTypeCombat)
	combat := cc.(*components.CombatComponent)
	assert.Equal(t, 14, combat.Attack) // round(9 × 1.5)
	assert.Equal(t, base.Defense, combat.Defense)
	assert.Equal(t, base.MagicResistance, combat.MagicResistance)

	monster := monsterOf(m)
	assert.True(t, monster.Elite)
	assert.False(t, monster.Boss)
	assert.Equal(t, "Dread Ghoul", monster.Name)
}

// The broadcast names every monster as the server authored it: the demon as the
// boss, an elite with its prefix, the rest plain. FS-77AB6 §Requirements 32.
func TestRunBroadcast_CarriesEliteBossAndName(t *testing.T) {
	s := rosterOnRun(t, 8, delverAt{level: 1, x: 100, y: 100})
	s.populateMonsters(testSpireHeight, true, nil)
	elite := CreateMonsterEntity(s.EntityManager, MonsterConfig{
		Archetype: components.MonsterArchetypeTroll, Level: 2, Elite: true, Name: "Hollow Troll", X: 900, Y: 700,
	})

	stateSerializer := serializer.NewStateSerializer(s.EntityManager, nil)
	backendState, err := stateSerializer.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
	require.NoError(t, err)
	state := stateSerializer.FormatStateToClientState(backendState, s.GetPlayerIDs()[0])

	bosses := 0
	for _, m := range state.Monsters {
		switch {
		case m.Boss:
			bosses++
			assert.Equal(t, "demon", m.Archetype)
			assert.Equal(t, "Demon", m.Name)
			assert.False(t, m.Elite)
			assert.Equal(t, 1+MonsterLevelPerFloor*(testSpireHeight-1)+DemonLevelBonus, m.Level)
		case m.EntityID == elite.ID:
			assert.True(t, m.Elite)
			assert.Equal(t, "Hollow Troll", m.Name)
		case !m.Elite:
			assert.Equal(t, monsterSheets[components.MonsterArchetype(m.Archetype)].Name, m.Name)
		}
	}
	assert.Equal(t, 1, bosses)
}

// Building the run's last floor brings its guaranteed demon; the floors below
// leave it to the roll. FS-77AB6 §Requirements 24 with FS-F6F88.
func TestBuildFloor_TheTopFloorBringsItsDemon(t *testing.T) {
	for seed := uint64(1); seed <= 10; seed++ {
		s := rosterOnRun(t, seed, delverAt{level: 1, x: 100, y: 100})
		s.buildFloor(testSpireHeight, nil)

		bosses := 0
		for _, m := range monstersIn(s) {
			if monsterOf(m).Archetype == components.MonsterArchetypeDemon { // the green one: the top floor may hold a blood demon too (FS-VHGE7 §A R7)
				bosses++
			}
		}
		assert.Equal(t, 1, bosses, "seed %d", seed)
	}
}

// The blood demon comes on its own roll against the floor's chance: a draw
// just under spawns it, a draw at the chance does not, the top floor included.
// A floor past the table's end uses its last row. FS-VHGE7 §A R4–6.
func TestRollBloodDemon_RollsTheFloorsChance(t *testing.T) {
	const under = 1e-9
	tests := []struct {
		name  string
		floor int
		draw  float64
		want  bool
	}{
		{"floor 1 just under", 1, 0.02 - under, true},
		{"floor 1 at the chance", 1, 0.02, false},
		{"floor 2 just under", 2, 0.05 - under, true},
		{"floor 2 at the chance", 2, 0.05, false},
		{"top floor just under", 3, 0.10 - under, true},
		{"top floor at the chance", 3, 0.10, false},
		{"top floor over the chance", 3, 0.5, false},
		{"past the end uses the last row, under", 7, 0.10 - under, true},
		{"past the end uses the last row, at", 7, 0.10, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			blood, rolled := rollBloodDemon(&drawQueue{floats: []float64{tt.draw}}, 4, tt.floor)

			require.Equal(t, tt.want, rolled)
			if !rolled {
				return
			}
			assert.Equal(t, components.MonsterArchetypeBloodDemon, blood.Archetype)
			assert.Equal(t, 4+MonsterLevelPerFloor*(tt.floor-1)+BloodDemonLevelBonus, blood.Level)
			assert.True(t, blood.Boss)
			assert.False(t, blood.Elite, "the blood demon is never an elite")
		})
	}
}

// The blood demon's roll is its own draw, after the green demon's: whichever
// way the green one goes, the next draw alone decides the blood one.
// FS-VHGE7 §A R6–8.
func TestRollBloodDemon_IndependentOfTheGreenDemon(t *testing.T) {
	tests := []struct {
		name             string
		green, blood     float64
		wantGreen, wantB bool
	}{
		{"both", DemonChance / 2, 0.01, true, true},
		{"green only", DemonChance / 2, 0.5, true, false},
		{"blood only", 0.5, 0.01, false, true},
		{"neither", 0.5, 0.5, false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rng := &drawQueue{floats: []float64{tt.green, tt.blood}}
			_, green := rollDemon(rng, 1, 1, false)
			_, blood := rollBloodDemon(rng, 1, 1)
			assert.Equal(t, tt.wantGreen, green)
			assert.Equal(t, tt.wantB, blood)
		})
	}
}

// forceBloodDemon sets every floor's blood demon chance for one test.
func forceBloodDemon(t *testing.T, chance float64) {
	t.Helper()
	was := BloodDemonChanceByFloor
	BloodDemonChanceByFloor = []float64{chance}
	t.Cleanup(func() { BloodDemonChanceByFloor = was })
}

// bossesIn is every boss in the world by archetype.
func bossesIn(s *Session) map[components.MonsterArchetype][]*ecs.Entity {
	out := map[components.MonsterArchetype][]*ecs.Entity{}
	for _, m := range monstersIn(s) {
		if monster := monsterOf(m); monster.Boss {
			out[monster.Archetype] = append(out[monster.Archetype], m)
		}
	}
	return out
}

// On an open top floor both demons stand: the blood demon at its level, named,
// a boss and never an elite, clear of the delvers and of the green demon, and
// the green demon exactly where it stands without it. FS-VHGE7 §A R4–9;
// §Edge States "Both demons on one floor".
func TestPopulateMonsters_OpenFloorPlacesTheBloodDemonAfterTheDemon(t *testing.T) {
	top := testSpireHeight
	for seed := uint64(1); seed <= 20; seed++ {
		forceBloodDemon(t, 0)
		without := rosterOnRun(t, seed, delverAt{level: 2, x: 100, y: 100})
		without.populateMonsters(top, true, nil)
		require.Empty(t, bossesIn(without)[components.MonsterArchetypeBloodDemon])

		forceBloodDemon(t, 1)
		s := rosterOnRun(t, seed, delverAt{level: 2, x: 100, y: 100})
		s.populateMonsters(top, true, nil)

		bosses := bossesIn(s)
		require.Len(t, bosses[components.MonsterArchetypeDemon], 1, "seed %d", seed)
		require.Len(t, bosses[components.MonsterArchetypeBloodDemon], 1, "seed %d", seed)
		green := transformOf(t, bosses[components.MonsterArchetypeDemon][0])
		greenWithout := transformOf(t, bossesIn(without)[components.MonsterArchetypeDemon][0])
		assert.Equal(t, *greenWithout, *green, "seed %d: the green demon's placement is unchanged", seed)

		bloodEntity := bosses[components.MonsterArchetypeBloodDemon][0]
		blood := monsterOf(bloodEntity)
		assert.Equal(t, 2+MonsterLevelPerFloor*(top-1)+BloodDemonLevelBonus, blood.Level)
		assert.Equal(t, "Blood Demon", blood.Name)
		assert.False(t, blood.Elite)

		at := transformOf(t, bloodEntity)
		assert.GreaterOrEqual(t, math.Hypot(at.X-100, at.Y-100), MonsterDelverExclusion, "seed %d", seed)
		assert.GreaterOrEqual(t, math.Hypot(at.X-green.X, at.Y-green.Y), MonsterSpacing, "seed %d", seed)
	}
}

// With no valid spot the blood demon is absent, never forced onto the
// delvers; it gets no relaxed retry. FS-VHGE7 §A R9; §Edge States "No spot
// for the blood demon".
func TestPopulateMonsters_BloodDemonWithNoSpotIsSkipped(t *testing.T) {
	forceBloodDemon(t, 1)
	em := ecs.NewEntityManager()
	// a 500 px square: nowhere on it is 350 px from a delver at its centre
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, nil,
		WorldBounds{Type: types.WorldTypeRun, Width: 500, Height: 500})
	s.spawnRand = seededSpawns(2)
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "delver", Class: "warrior"}, "")
	for _, e := range em.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypePlayer) {
			at := transformOf(t, e)
			at.X, at.Y = 250, 250
		}
	}

	logs := capturedLog(t)

	s.populateMonsters(testSpireHeight, true, nil)

	bosses := bossesIn(s)
	assert.Empty(t, bosses[components.MonsterArchetypeBloodDemon])
	assert.Len(t, bosses[components.MonsterArchetypeDemon], 1, "the guaranteed demon still relaxes")
	assert.Contains(t, logs.String(), `"level":"WARN"`)
	assert.Contains(t, logs.String(), "blood_demon")
	assert.NotContains(t, logs.String(), `"level":"ERROR"`)
}

// The boss on a run's top floor is its height's: the Demon below 10, with a
// Blood Demon still able to roll beside it, and on a Master Spire Daa'gon alone.
// On a dungeon floor and on a floor of buildings alike. FS-M8CSE §E R23, R24, R27;
// §Edge States "Generation fails on a Master Spire top floor".
func TestBuildFloor_TopFloorBossIsTheHeights(t *testing.T) {
	forceBloodDemon(t, 1)

	tests := []struct {
		name     string
		fallback bool
	}{
		{"dungeon floor", false},
		{"floor of buildings a failed generation leaves", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for height := 3; height <= MasterSpireHeight; height++ {
				s := rosterOnRun(t, uint64(height), delverAt{level: 2, x: 100, y: 100})
				currentFloor(t, s).Count = height
				if tt.fallback {
					failGeneration(s)
				}

				s.buildFloor(height, nil)

				bosses := bossesIn(s)
				if height == MasterSpireHeight {
					assert.Len(t, bosses[components.MonsterArchetypeDaagon], 1, "the Master Spire's top floor holds Daa'gon")
					assert.Empty(t, bosses[components.MonsterArchetypeDemon], "Daa'gon replaces the Demon")
					assert.Empty(t, bosses[components.MonsterArchetypeBloodDemon], "no Blood Demon rolls beside Daa'gon")
					continue
				}
				assert.Len(t, bosses[components.MonsterArchetypeDemon], 1, "height %d", height)
				assert.Len(t, bosses[components.MonsterArchetypeBloodDemon], 1, "height %d keeps its Blood Demon roll", height)
				assert.Empty(t, bosses[components.MonsterArchetypeDaagon], "height %d", height)
			}
		})
	}
}

// A Master Spire differs only at its top: every floor below still rolls its
// Blood Demon, and none holds Daa'gon. FS-M8CSE §E R24.
func TestBuildFloor_MasterSpireLowerFloorsKeepTheirRolls(t *testing.T) {
	forceBloodDemon(t, 1)

	for floor := firstFloor; floor < MasterSpireHeight; floor++ {
		s := rosterOnRun(t, uint64(floor), delverAt{level: 2, x: 100, y: 100})
		currentFloor(t, s).Count = MasterSpireHeight

		s.buildFloor(floor, nil)

		bosses := bossesIn(s)
		assert.Len(t, bosses[components.MonsterArchetypeBloodDemon], 1, "floor %d", floor)
		assert.Empty(t, bosses[components.MonsterArchetypeDaagon], "floor %d", floor)
	}
}

// The demon's roll names the top floor's boss, and leaves any other floor to
// its rare chance, a Master Spire's included. FS-M8CSE §E R23-R25.
func TestRollDemon_NamesTheFloorsBoss(t *testing.T) {
	tests := []struct {
		name          string
		floor         int
		topFloor      bool
		draws         []float64
		wantRolled    bool
		wantArchetype components.MonsterArchetype
		wantLevel     int
	}{
		{"height 10's top", 10, true, nil, true, components.MonsterArchetypeDaagon, 4 + 9 + DaagonLevelBonus},
		{"height 9's top", 9, true, nil, true, components.MonsterArchetypeDemon, 4 + 8 + DemonLevelBonus},
		{"height 3's top", 3, true, nil, true, components.MonsterArchetypeDemon, 4 + 2 + DemonLevelBonus},
		{"floor 9 of a Master Spire, on its chance", 9, false, []float64{0}, true, components.MonsterArchetypeDemon, 4 + 8 + DemonLevelBonus},
		{"floor 9 of a Master Spire, off its chance", 9, false, []float64{DemonChance}, false, "", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			boss, rolled := rollDemon(&drawQueue{floats: tt.draws}, 4, tt.floor, tt.topFloor)

			require.Equal(t, tt.wantRolled, rolled)
			if !rolled {
				return
			}
			assert.Equal(t, tt.wantArchetype, boss.Archetype)
			assert.Equal(t, tt.wantLevel, boss.Level)
			assert.True(t, boss.Boss)
			assert.False(t, boss.Elite, "a boss is never an elite")
		})
	}
}

// Daa'gon stands at party level + floor offset + 5, under its own name.
// FS-M8CSE §E R25.
func TestPopulateMonsters_DaagonIsNamedAndLevelled(t *testing.T) {
	s := rosterOnRun(t, 1, delverAt{level: 2, x: 100, y: 100}, delverAt{level: 4, x: 160, y: 100})
	currentFloor(t, s).Count = MasterSpireHeight

	s.buildFloor(MasterSpireHeight, nil)

	bosses := bossesIn(s)[components.MonsterArchetypeDaagon]
	require.Len(t, bosses, 1)
	daagon := monsterOf(bosses[0])
	assert.Equal(t, 4+MonsterLevelPerFloor*9+5, daagon.Level)
	assert.Equal(t, "Daa'gon", daagon.Name)
	assert.True(t, daagon.Boss)
	assert.False(t, daagon.Elite)
}

// Daa'gon's sheet is the Blood Demon's with 2200 HP and 45 damage, every other
// field the same. FS-M8CSE §E R25.
func TestMonsterSheet_DaagonIsTheBloodDemonHarder(t *testing.T) {
	want := monsterSheets[components.MonsterArchetypeBloodDemon]
	want.Name, want.HP, want.Damage = "Daa'gon", 2200, 45

	assert.Equal(t, want, monsterSheets[components.MonsterArchetypeDaagon])
}

// The blood demon's sheet is the demon's, harder and longer: HP 1600, damage
// 34, every other field the same. FS-VHGE7 §A R2–3.
func TestMonsterSheet_BloodDemonIsTheDemonHarder(t *testing.T) {
	want := monsterSheets[components.MonsterArchetypeDemon]
	want.Name, want.HP, want.Damage = "Blood Demon", 1600, 34

	assert.Equal(t, want, monsterSheets[components.MonsterArchetypeBloodDemon])
}

// Field worlds and the hub never hold a blood demon, even at a certain roll:
// only a run floor rolls it. FS-VHGE7 §A R11.
func TestBloodDemon_NeverInAFieldOrTheHub(t *testing.T) {
	forceBloodDemon(t, 1)

	hub := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
	hub.spawnRand = seededSpawns(1)
	hub.InitialHubMapObjects()
	hub.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")
	hub.populateMonsters(testSpireHeight, true, nil)

	meadows := builtField(t)
	forest, _, _ := builtForest(t, 7)

	for name, s := range map[string]*Session{"hub": hub, "meadows": meadows, "forest": forest} {
		for _, m := range monstersIn(s) {
			assert.NotEqual(t, components.MonsterArchetypeBloodDemon, monsterOf(m).Archetype, name)
		}
	}
}
