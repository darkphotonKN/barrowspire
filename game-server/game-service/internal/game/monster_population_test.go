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
// touching the world. Nothing is built yet; the caller builds the floor.
func rosterOnRun(t *testing.T, seed uint64, roster ...delverAt) *Session {
	t.Helper()

	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.spawnRand = seededSpawns(seed)
	s.InitialSystems()

	for i, d := range roster {
		playerID := uuid.New()
		s.AddPlayer(playerID, types.CharacterInPlay{Name: "delver", Class: "warrior"})

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
// floor 1 face monsters of level 7 ± 1. FS-77AB6 §Requirements 21–22.
func TestNewRun_PopulatesMonstersLevelledToTheHighestDelver(t *testing.T) {
	for seed := uint64(1); seed <= 20; seed++ {
		s := rosterOnRun(t, seed, delverAt{level: 3, x: 80, y: 80}, delverAt{level: 7, x: 140, y: 80})
		s.InitialMapObjects()

		monsters := standardMonstersIn(s)
		require.GreaterOrEqual(t, len(monsters), MonsterCountMin, "seed %d", seed)
		require.LessOrEqual(t, len(monsters), MonsterCountMax, "seed %d", seed)

		for _, m := range monsters {
			level := monsterOf(m).Level
			assert.GreaterOrEqual(t, level, 6, "seed %d", seed)
			assert.LessOrEqual(t, level, 8, "seed %d", seed)
		}
	}
}

// A monster stands on open ground: in no building, on no door, chest, switch or
// escape door, on no other monster, and well clear of every delver.
// FS-77AB6 §Requirements 22.
func TestNewRun_PlacesMonstersOnOpenGroundAwayFromDelvers(t *testing.T) {
	r := constants.PlayerRadius

	for seed := uint64(1); seed <= 40; seed++ {
		s := rosterOnRun(t, seed, delverAt{level: 1, x: 100, y: 100}, delverAt{level: 1, x: 1300, y: 860})
		s.InitialMapObjects()

		entities := s.EntityManager.GetAllEntities()
		keepOut := mapKeepOut(entities)
		require.NotEmpty(t, keepOut, "the floor has a layout to keep out of")

		monsters := monstersIn(s)
		standard := len(standardMonstersIn(s))
		require.GreaterOrEqual(t, standard, MonsterCountMin, "seed %d", seed)
		require.LessOrEqual(t, standard, MonsterCountMax, "seed %d", seed)

		for i, m := range monsters {
			at := transformOf(t, m)

			assert.True(t, at.X >= r && at.X <= s.mapWidth-r && at.Y >= r && at.Y <= s.mapHeight-r,
				"seed %d: monster outside the map at (%.0f, %.0f)", seed, at.X, at.Y)

			for _, area := range keepOut {
				assert.False(t, area.overlapsBody(at.X, at.Y, r),
					"seed %d: monster at (%.0f, %.0f) overlaps %+v", seed, at.X, at.Y, area)
			}

			for _, d := range []point{{100, 100}, {1300, 860}} {
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
	s.AddBuilding(400, 300, 300, 200, 20, 50)

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
		{"party level 1 on floor 3", []int{1}, 3, 4, 6},
		{"mixed party on floor 3 scales to the highest", []int{2, 5}, 3, 8, 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for seed := uint64(1); seed <= 10; seed++ {
				roster := make([]delverAt, len(tt.levels))
				for i, level := range tt.levels {
					roster[i] = delverAt{level: level, x: 80 + 60*float64(i), y: 80}
				}
				s := rosterOnRun(t, seed, roster...)
				s.buildFloor(tt.floor)

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
		{1, 3, 0, 5},
		{4, 2, 1, 7},
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
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "delver", Class: "warrior"})
	for _, e := range em.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypePlayer) {
			at := transformOf(t, e)
			at.X, at.Y = 250, 250
		}
	}

	s.populateMonsters(1, false)

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
	hub.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"})

	hub.populateMonsters(1, false)
	for range 5 {
		tick(hub)
	}

	assert.Empty(t, monstersIn(hub))
}

// A floor change clears the old floor's monsters with the rest of it and the
// new floor is populated afresh, clear of where the party now stands.
// FS-F6F88 §Requirements 9–12 with FS-77AB6 §Requirements 22.
func TestRegenerateFloor_RepopulatesTheNewFloor(t *testing.T) {
	s := rosterOnRun(t, 11, delverAt{level: 1, x: 100, y: 100})
	s.InitialMapObjects()

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

// Every monster on the floor reaches every delver's broadcast.
// FS-77AB6 §Requirements 32.
func TestRunBroadcast_CarriesTheFloorsMonsters(t *testing.T) {
	s := rosterOnRun(t, 5, delverAt{level: 1, x: 100, y: 100})
	s.InitialMapObjects()
	require.NotEmpty(t, monstersIn(s))

	stateSerializer := serializer.NewStateSerializer(s.EntityManager)
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
		assert.Contains(t, []string{"ghoul", "troll", "demon"}, m.Archetype)
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
		s.populateMonsters(3, true)

		var demons []*components.MonsterComponent
		standard := 0
		for _, m := range monstersIn(s) {
			monster := monsterOf(m)
			if monster.Boss {
				demons = append(demons, monster)
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
		s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "delver", Class: "warrior"})
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
		s.populateMonsters(constants.RunFloorCount, true)

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
	s.populateMonsters(constants.RunFloorCount, true)
	elite := CreateMonsterEntity(s.EntityManager, MonsterConfig{
		Archetype: components.MonsterArchetypeTroll, Level: 2, Elite: true, Name: "Hollow Troll", X: 900, Y: 700,
	})

	stateSerializer := serializer.NewStateSerializer(s.EntityManager)
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
			assert.Equal(t, 1+MonsterLevelPerFloor*(constants.RunFloorCount-1)+DemonLevelBonus, m.Level)
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
		s.buildFloor(constants.RunFloorCount)

		bosses := 0
		for _, m := range monstersIn(s) {
			if monsterOf(m).Boss {
				bosses++
			}
		}
		assert.Equal(t, 1, bosses, "seed %d", seed)
	}
}
