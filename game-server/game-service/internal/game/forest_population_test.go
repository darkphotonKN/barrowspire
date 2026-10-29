package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-3QHQZ §B Requirements 15–18; Acceptance Criteria "Forest world (§B)" 5–8.
// I-3QHQZ-3.

// The zombie's and the ghost's level-1 sheets and kill-XP bases, as R18 sets
// them. The ghost is faster and frailer than the zombie, and both are slower
// than a player.
func TestForestSheets_StartingValues(t *testing.T) {
	tests := []struct {
		archetype components.MonsterArchetype
		sheet     monsterSheet
		killXP    int
	}{
		{components.MonsterArchetypeZombie, monsterSheet{
			Name: "Zombie", HP: 70, Damage: 9,
			AttackInterval: 1.4, WindUp: 0.5, AttackRange: 45, MoveSpeed: 100,
			Defense: 5, MagicResistance: 1,
			AggroRadius: 240, LeashRadius: 480,
		}, 15},
		{components.MonsterArchetypeGhost, monsterSheet{
			Name: "Ghost", HP: 30, Damage: 8,
			AttackInterval: 0.9, WindUp: 0.3, AttackRange: 50, MoveSpeed: 175,
			Defense: 0, MagicResistance: 8,
			AggroRadius: 300, LeashRadius: 560,
		}, 20},
	}

	for _, tt := range tests {
		t.Run(string(tt.archetype), func(t *testing.T) {
			sheet, ok := monsterSheets[tt.archetype]
			require.True(t, ok)
			assert.Equal(t, tt.sheet, sheet)
			assert.Equal(t, tt.killXP, killExperienceBase[tt.archetype])
			assert.Less(t, sheet.MoveSpeed, 200.0, "slower than a player")
		})
	}

	assert.Equal(t, "zombie", string(components.MonsterArchetypeZombie), "the client's creature_zombie_base")
	assert.Equal(t, "ghost", string(components.MonsterArchetypeGhost), "the client's creature_ghost_base")
}

// A spawn point's elite rule decides its elites: a rolled point at the Spire's
// floor-1 chance (the Meadows, unchanged), a never point never, an always
// point every time, with a name from the place's prefixes. R17.
func TestRollFieldSpawn_EliteRule(t *testing.T) {
	place := GentleMeadows()
	place.ElitePrefixes = ElitePrefixes

	const rolls = 6000
	count := func(rule FieldElite) (elites int) {
		rng := seededSpawns(17)
		for range rolls {
			m := rollFieldSpawn(rng, place, rule)
			if m.Elite {
				elites++
				assert.Contains(t, barrowNames(m.Archetype), m.Name, "an elite carries a prefix")
			} else {
				assert.Empty(t, m.Name)
			}
		}
		return elites
	}

	assert.Zero(t, count(FieldEliteNever), "a never point is never elite")
	assert.Equal(t, rolls, count(FieldEliteAlways), "an always point is always elite")
	assert.InDelta(t, eliteChance(1), float64(count(FieldEliteRolled))/rolls, 0.01)
}

// The place's standard rule is what rollFieldMonster rolls by, and its zero
// value is the Meadows' rolled chance, so a place that names none keeps it.
func TestFieldPlace_StandardElitesDefaultToRolled(t *testing.T) {
	assert.Equal(t, FieldEliteRolled, GentleMeadows().StandardElites)

	// draws: the creature, the level, the prefix; no elite roll on an always point
	always := rollFieldSpawn(&drawQueue{floats: []float64{0}, ints: []int{2, 3}}, GentleMeadows(), FieldEliteAlways)
	assert.True(t, always.Elite)
	assert.Equal(t, MeadowsMinLevel+2, always.Level)
	assert.Equal(t, FieldElitePrefixes[3%len(FieldElitePrefixes)]+" Boar", always.Name)
}

// A field built with elite spawn points holds an elite on each, every time it
// refills; its standard points follow the place's rule. R17.
func TestFieldPopulation_ElitePointsAlwaysHoldAnElite(t *testing.T) {
	place := GentleMeadows()
	place.StandardElites = FieldEliteNever
	layout := FieldLayout{
		SpawnPoints:      []FieldPoint{{X: 600, Y: 420}, {X: 1000, Y: 320}},
		EliteSpawnPoints: []FieldPoint{{X: 1460, Y: 110}},
	}

	field := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, FieldBounds(place))
	field.InitialFieldMapObjects(place, layout)

	require.Len(t, field.fieldPopulation.spawns, 3)
	for range 20 {
		for i := range field.fieldPopulation.spawns {
			m := monsterOf(spawnedAt(t, field, i))
			assert.Equal(t, i == 2, m.Elite, "point %d", i)
			slay(t, field, spawnedAt(t, field, i))
		}
		// the first update sees every death, the second runs the delay out
		field.fieldPopulation.update(0, field.EntityManager.GetAllEntities())
		field.fieldPopulation.update(FieldRespawnDelay, field.EntityManager.GetAllEntities())
	}
}

// The Spire's population never rolls a Forest creature, on any floor. R18.
func TestRollMonsters_NeverAForestCreature(t *testing.T) {
	rng := seededSpawns(18)
	for floor := 1; floor <= 10; floor++ {
		for range 200 {
			for _, m := range rollMonsters(rng, 5, floor) {
				assert.NotEqual(t, components.MonsterArchetypeZombie, m.Archetype)
				assert.NotEqual(t, components.MonsterArchetypeGhost, m.Archetype)
			}
		}
	}
}

// The Forest carries its tuning: zombies with a ghost one spawn in
// ForestGhostShare, its band and factors, the field respawn, barrow elite
// names, and trail points that are never elite. R9, R17.
func TestForlornForest_CarriesTheForestTuning(t *testing.T) {
	place := ForlornForest(forestLayoutFor(t, forestSeed))

	assert.Equal(t, []FieldCreature{
		{Archetype: components.MonsterArchetypeZombie, Weight: 1 - ForestGhostShare},
		{Archetype: components.MonsterArchetypeGhost, Weight: ForestGhostShare},
	}, place.Creatures)
	assert.Equal(t, ForestMinLevel, place.MinLevel)
	assert.Equal(t, ForestMaxLevel, place.MaxLevel)
	assert.Equal(t, 4, ForestMinLevel)
	assert.Equal(t, 9, ForestMaxLevel)
	assert.Equal(t, FieldStatFactor, place.StatFactor)
	assert.Equal(t, ForestDropFactor, place.DropFactor)
	assert.Equal(t, FieldRespawnDelay, place.RespawnDelay)
	assert.Equal(t, ElitePrefixes, place.ElitePrefixes)
	assert.Equal(t, FieldEliteNever, place.StandardElites)
}

// Over many seeded rolls, a ghost is 1 spawn in 12 and the rest are zombies;
// a trail point never rolls an elite, a clearing point always does, with a
// barrow prefix. R17.
func TestForestSpawns_GhostShareAndEliteRule(t *testing.T) {
	place := ForlornForest(forestLayoutFor(t, forestSeed))
	rng := seededSpawns(12)

	ghosts := 0
	const rolls = 24000
	for range rolls {
		m := rollFieldMonster(rng, place)
		require.Contains(t, []components.MonsterArchetype{components.MonsterArchetypeZombie, components.MonsterArchetypeGhost}, m.Archetype)
		require.False(t, m.Elite, "a standard point is never elite")
		require.GreaterOrEqual(t, m.Level, ForestMinLevel)
		require.LessOrEqual(t, m.Level, ForestMaxLevel)
		if m.Archetype == components.MonsterArchetypeGhost {
			ghosts++
		}

		elite := rollFieldSpawn(rng, place, FieldEliteAlways)
		require.True(t, elite.Elite, "a clearing point is always elite")
		require.Contains(t, barrowNames(elite.Archetype), elite.Name)
	}
	assert.InDelta(t, 1.0/12, float64(ghosts)/rolls, 0.01)
	assert.InDelta(t, 1.0/12, ForestGhostShare, 1e-12)
}

// inAnyClearing is whether p stands inside any dead end's clearing.
func inAnyClearing(generated levelgen.Layout, p FieldPoint) bool {
	for _, d := range generated.DeadEnds {
		if math.Hypot(p.X-d.Center.X, p.Y-d.Center.Y) <= d.Radius {
			return true
		}
	}
	return false
}

// mainDeadEnd is the main trail's dead end.
func mainDeadEnd(t *testing.T, generated levelgen.Layout) levelgen.DeadEnd {
	t.Helper()
	for _, d := range generated.DeadEnds {
		if d.Main {
			return d
		}
	}
	t.Fatal("no main dead end")
	return levelgen.DeadEnd{}
}

// Over many seeds: the main trail's dead end is an elite, every dead end is
// exactly one of an elite or a chest, there is a chest wherever there are two
// or more dead ends, and the same seed gives the same assignment. R15.
func TestForestClearings_MainIsEliteAndAChestWhereTwoOrMore(t *testing.T) {
	others, chests := 0, 0
	for seed := uint64(1); seed <= 300; seed++ {
		generated := forestLayoutFor(t, seed)
		clearings := assignForestClearings(generated)

		require.Len(t, clearings.Elites, len(generated.DeadEnds)-len(clearings.Chests), "seed %d: one of each", seed)
		require.Contains(t, clearings.Elites, mainDeadEnd(t, generated), "seed %d: the main dead end is not elite", seed)
		for _, chest := range clearings.Chests {
			require.NotContains(t, clearings.Elites, chest, "seed %d", seed)
			require.False(t, chest.Main, "seed %d", seed)
		}
		if len(generated.DeadEnds) >= 2 {
			require.NotEmpty(t, clearings.Chests, "seed %d: no chest", seed)
		}

		again := assignForestClearings(forestLayoutFor(t, seed))
		require.Equal(t, clearings, again, "seed %d: the same seed, another assignment", seed)

		others += len(generated.DeadEnds) - 1
		chests += len(clearings.Chests)
	}
	// 50/50 over the side dead ends, nudged up by the at-least-one-chest rule
	assert.InDelta(t, 0.55, float64(chests)/float64(others), 0.1)
}

// A forest with only the main trail's dead end holds an elite there and no
// chest. Edge "No dead end but the main trail's".
func TestForestClearings_OnlyTheMainDeadEnd(t *testing.T) {
	generated := levelgen.Layout{
		DeadEnds: []levelgen.DeadEnd{{Center: levelgen.Point{X: 400, Y: 400}, Radius: 160, Main: true}},
		Seed:     7,
	}

	clearings := assignForestClearings(generated)
	assert.Equal(t, generated.DeadEnds, clearings.Elites)
	assert.Empty(t, clearings.Chests)
}

// Over many seeds: 18-24 standard spawn points, each on an open trail cell, at
// least ForestEntranceExclusion from the entrance and MonsterSpacing from each
// other, none in a clearing; one elite point at each elite clearing's centre;
// and the same seed gives the same points. R16.
func TestForestLayout_SpawnPoints(t *testing.T) {
	assert.Equal(t, 400.0, ForestEntranceExclusion)
	assert.Equal(t, 18, ForestSpawnPointsMin)
	assert.Equal(t, 24, ForestSpawnPointsMax)

	for seed := uint64(1); seed <= 300; seed++ {
		generated := forestLayoutFor(t, seed)
		place := ForlornForest(generated)
		layout, err := place.Layout.Layout()
		require.NoError(t, err)

		open := map[FieldPoint]bool{}
		for _, p := range generated.Open {
			open[FieldPoint{X: p.X, Y: p.Y}] = true
		}

		points := layout.SpawnPoints
		require.GreaterOrEqual(t, len(points), ForestSpawnPointsMin, "seed %d", seed)
		require.LessOrEqual(t, len(points), ForestSpawnPointsMax, "seed %d", seed)
		for i, p := range points {
			require.True(t, open[p], "seed %d: %+v is not an open cell", seed, p)
			require.False(t, overlapsWall(generated.Walls, p, constants.PlayerRadius), "seed %d: %+v touches a wall", seed, p)
			require.GreaterOrEqual(t, math.Hypot(p.X-place.Entrance.X, p.Y-place.Entrance.Y), ForestEntranceExclusion, "seed %d: %+v near the entrance", seed, p)
			require.False(t, inAnyClearing(generated, p), "seed %d: %+v in a clearing", seed, p)
			for _, q := range points[:i] {
				require.GreaterOrEqual(t, math.Hypot(p.X-q.X, p.Y-q.Y), MonsterSpacing, "seed %d: %+v crowds %+v", seed, p, q)
			}
		}

		var centres []FieldPoint
		for _, elite := range assignForestClearings(generated).Elites {
			centres = append(centres, FieldPoint{X: elite.Center.X, Y: elite.Center.Y})
		}
		require.Equal(t, centres, layout.EliteSpawnPoints, "seed %d: one elite point at each elite clearing's centre", seed)

		again, err := ForlornForest(forestLayoutFor(t, seed)).Layout.Layout()
		require.NoError(t, err)
		require.Equal(t, layout, again, "seed %d: the same seed, other points", seed)
	}
}

// A forest without room for its count runs with what fits: the rest are
// skipped and logged, never forced. Edge "Spawn point cannot be placed".
func TestForestLayout_SkipsWhatCannotBePlaced(t *testing.T) {
	generated := levelgen.Layout{
		Bounds:   levelgen.Size{W: 2080, H: 1360},
		Entrance: levelgen.Entrance{At: levelgen.Point{X: 2040, Y: 680}, Side: levelgen.SideEast},
		DeadEnds: []levelgen.DeadEnd{{Center: levelgen.Point{X: 200, Y: 680}, Radius: 160, Main: true}},
		Open: []levelgen.Point{
			{X: 1960, Y: 680}, // too near the entrance
			{X: 200, Y: 680},  // in the clearing
			{X: 1000, Y: 680}, // fits
			{X: 1080, Y: 680}, // fits
		},
		Seed: 3,
	}

	layout, err := ForlornForest(generated).Layout.Layout()
	require.NoError(t, err)
	assert.ElementsMatch(t, []FieldPoint{{X: 1000, Y: 680}, {X: 1080, Y: 680}}, layout.SpawnPoints)
	assert.Equal(t, []FieldPoint{{X: 200, Y: 680}}, layout.EliteSpawnPoints)
}

// A booted Forest holds a plain zombie or ghost on every trail point and an
// elite on every clearing point, each in the band, at the field factor with
// the Spire's elite multipliers on top for an elite. R16, R17, AC "A Forest
// elite's HP and damage".
func TestForlornForest_BootedPopulation(t *testing.T) {
	forest, place, _ := builtForest(t, forestSeed)
	layout := forest.fieldLayout
	require.NotEmpty(t, layout.EliteSpawnPoints)

	standard := len(layout.SpawnPoints)
	require.Len(t, monstersIn(forest), standard+len(layout.EliteSpawnPoints))
	for i := range forest.fieldPopulation.spawns {
		m := spawnedAt(t, forest, i)
		monster := monsterOf(m)
		elite := i >= standard

		assert.Equal(t, elite, monster.Elite, "point %d", i)
		assert.Contains(t, []components.MonsterArchetype{components.MonsterArchetypeZombie, components.MonsterArchetypeGhost}, monster.Archetype)
		assert.GreaterOrEqual(t, monster.Level, place.MinLevel)
		assert.LessOrEqual(t, monster.Level, place.MaxLevel)
		assert.Equal(t, fieldFactored(monster.Archetype, monster.Level, place.StatFactor, elite), statsOf(t, m))
		if elite {
			assert.Contains(t, barrowNames(monster.Archetype), monster.Name)
			assert.Equal(t, layout.EliteSpawnPoints[i-standard], FieldPoint{X: monster.HomeX, Y: monster.HomeY})
		}
	}
}

// Killing a zombie or a ghost is worth its row along FS-BDA7X's curve, with an
// elite's multiplier on top. R18.
func TestKillExperience_ForestCreatures(t *testing.T) {
	tests := []struct {
		archetype components.MonsterArchetype
		level     int
		elite     bool
		want      int
	}{
		{components.MonsterArchetypeZombie, 1, false, 15},
		{components.MonsterArchetypeZombie, 5, false, 24}, // 15 × 1.6
		{components.MonsterArchetypeZombie, 9, true, 99},  // 15 × 2.2 × 3
		{components.MonsterArchetypeGhost, 1, false, 20},
		{components.MonsterArchetypeGhost, 4, false, 29}, // 20 × 1.45
		{components.MonsterArchetypeGhost, 9, true, 132}, // 20 × 2.2 × 3
	}
	for _, tt := range tests {
		got := killExperience(systems.KillRecord{Archetype: tt.archetype, Level: tt.level, Elite: tt.elite})
		assert.Equal(t, tt.want, got, "%s level %d elite %v", tt.archetype, tt.level, tt.elite)
	}
}
