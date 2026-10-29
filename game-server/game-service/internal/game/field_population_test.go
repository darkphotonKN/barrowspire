package game

import (
	"context"
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §Requirements 26–29, 36–37. I-X2F2H-3.

// fieldFactored is what the test expects of a field monster's stats: the
// Spire's level curve, × the place's factor, rounded, HP and damage at least 1;
// then the Spire's elite multipliers on top. Built from the live functions and
// constants, never from copied numbers (R29).
func fieldFactored(archetype components.MonsterArchetype, level int, factor float64, elite bool) monsterStats {
	spire := monsterSheets[archetype].statsAt(level)
	scale := func(v int) int { return int(math.Round(float64(v) * factor)) }

	want := monsterStats{
		HP:              max(scale(spire.HP), 1),
		Damage:          max(scale(spire.Damage), 1),
		Defense:         scale(spire.Defense),
		MagicResistance: scale(spire.MagicResistance),
	}
	if elite {
		want.HP = int(math.Round(float64(want.HP) * EliteHPMultiplier))
		want.Damage = int(math.Round(float64(want.Damage) * EliteDamageMultiplier))
	}
	return want
}

// statsOf reads a spawned monster's stats off its Health and Combat.
func statsOf(t *testing.T, m *ecs.Entity) monsterStats {
	t.Helper()
	hc, ok := m.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	cc, ok := m.GetComponent(ecs.ComponentTypeCombat)
	require.True(t, ok)
	health := hc.(*components.HealthComponent)
	combat := cc.(*components.CombatComponent)
	assert.Equal(t, health.MaxHealth, health.CurrentHealth, "spawned at full health")
	return monsterStats{HP: health.MaxHealth, Damage: combat.Attack, Defense: combat.Defense, MagicResistance: combat.MagicResistance}
}

// A field boar is the Spire's level formula × the Meadows' factor, and an elite
// takes the Spire's multipliers on top of that. Speeds, radii and timings are
// the sheet's, unscaled. R29, D16.
func TestFieldMonster_StatsAreTheSpiresTimesTheFactor(t *testing.T) {
	place := GentleMeadows()
	boar := components.MonsterArchetypeBoar

	tests := []struct {
		name   string
		level  int
		elite  bool
		factor float64
	}{
		{"level 1", 1, false, place.StatFactor},
		{"level 4", 4, false, place.StatFactor},
		{"elite level 1", 1, true, place.StatFactor},
		{"elite level 4", 4, true, place.StatFactor},
		{"a factor small enough to floor HP and damage at 1", 1, false, 0.01},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := CreateMonsterEntity(ecs.NewEntityManager(), MonsterConfig{
				Archetype: boar, Level: tt.level, Elite: tt.elite, StatFactor: tt.factor, X: 600, Y: 420,
			})

			assert.Equal(t, fieldFactored(boar, tt.level, tt.factor, tt.elite), statsOf(t, m))

			sheet := monsterSheets[boar]
			monster := monsterOf(m)
			assert.Equal(t, sheet.AttackInterval, monster.AttackInterval)
			assert.Equal(t, sheet.WindUp, monster.WindUp)
			assert.Equal(t, sheet.AttackRange, monster.AttackRange)
			assert.Equal(t, sheet.AggroRadius, monster.AggroRadius)
			assert.Equal(t, sheet.LeashRadius, monster.LeashRadius)
			vc, _ := m.GetComponent(ecs.ComponentTypeVelocity)
			assert.Equal(t, sheet.MoveSpeed, vc.(*components.VelocityComponent).Speed)
		})
	}
}

// A Spire monster, which names no factor, keeps the Spire's stats unchanged.
func TestCreateMonsterEntity_NoFactorIsTheSpiresOwn(t *testing.T) {
	m := CreateMonsterEntity(ecs.NewEntityManager(), MonsterConfig{
		Archetype: components.MonsterArchetypeGhoul, Level: 3, Elite: true,
	})

	assert.Equal(t, monsterSheets[components.MonsterArchetypeGhoul].statsAt(3).elite(), statsOf(t, m))
}

// The boar's starting sheet and kill-XP base, as FS-X2F2H R37 sets them.
func TestBoarSheet_StartingValues(t *testing.T) {
	sheet, ok := monsterSheets[components.MonsterArchetypeBoar]
	require.True(t, ok)

	assert.Equal(t, monsterSheet{
		Name: "Boar", HP: 36, Damage: 5,
		AttackInterval: 1.2, WindUp: 0.45, AttackRange: 45, MoveSpeed: 140,
		Defense: 2, MagicResistance: 0,
		AggroRadius: 200, LeashRadius: 450,
	}, sheet)
	assert.Equal(t, 8, killExperienceBase[components.MonsterArchetypeBoar])
}

// drawQueue hands back the draws a test scripts, in order, each kind on its
// own queue; past the end it hands back 0.
type drawQueue struct {
	floats []float64
	ints   []int
}

func (r *drawQueue) Float64() float64 {
	if len(r.floats) == 0 {
		return 0
	}
	v := r.floats[0]
	r.floats = r.floats[1:]
	return v
}

func (r *drawQueue) IntN(n int) int {
	if len(r.ints) == 0 {
		return 0
	}
	v := r.ints[0]
	r.ints = r.ints[1:]
	return v % n
}

// A Meadows roll is a boar, its level uniform in the place's band whoever is in
// the field, carrying the place's factor. R28, D15.
func TestRollFieldMonster_LevelUniformInTheBand(t *testing.T) {
	place := GentleMeadows()
	rng := seededSpawns(31)
	seen := map[int]int{}

	const rolls = 4000
	for range rolls {
		m := rollFieldMonster(rng, place)
		assert.Equal(t, components.MonsterArchetypeBoar, m.Archetype)
		assert.Equal(t, place.StatFactor, m.StatFactor)
		assert.False(t, m.Boss)
		require.GreaterOrEqual(t, m.Level, place.MinLevel)
		require.LessOrEqual(t, m.Level, place.MaxLevel)
		seen[m.Level]++
	}

	band := place.MaxLevel - place.MinLevel + 1
	assert.Len(t, seen, band, "every level in the band rolls")
	for level, n := range seen {
		assert.InDelta(t, 1/float64(band), float64(n)/rolls, 0.03, "level %d", level)
	}
}

// A field elite rolls at the Spire's floor-1 chance, read from the live
// function: just under eliteChance(1) is an elite, at it is not, so retuning the
// Spire's chance moves the field's with no field edit. R28, D24.
func TestRollFieldMonster_EliteAtTheSpiresFloorOneChance(t *testing.T) {
	place := GentleMeadows()
	chance := eliteChance(1)

	// draws: the creature, then the elite roll; the level and the prefix are ints
	elite := rollFieldMonster(&drawQueue{floats: []float64{0, chance - 1e-9}, ints: []int{0, 1}}, place)
	assert.True(t, elite.Elite)
	assert.Equal(t, FieldElitePrefixes[1]+" Boar", elite.Name, "a field prefix, not a barrow one")

	plain := rollFieldMonster(&drawQueue{floats: []float64{0, chance}}, place)
	assert.False(t, plain.Elite)
	assert.Empty(t, plain.Name, "a plain monster goes by its archetype")

	rng := seededSpawns(77)
	elites := 0
	const rolls = 20000
	for range rolls {
		if rollFieldMonster(rng, place).Elite {
			elites++
		}
	}
	assert.InDelta(t, chance, float64(elites)/rolls, 0.005)
}

// The creature table is weighted, and a place may name its own elite prefixes:
// the path the Forest's zombies and rare ghost come through (FS-3QHQZ).
func TestRollFieldMonster_WeightedTableAndThePlacesPrefixes(t *testing.T) {
	place := GentleMeadows()
	place.Creatures = []FieldCreature{
		{Archetype: components.MonsterArchetypeGhoul, Weight: 11},
		{Archetype: components.MonsterArchetypeTroll, Weight: 1},
	}
	place.ElitePrefixes = ElitePrefixes

	rng := seededSpawns(12)
	trolls := 0
	const rolls = 24000
	for range rolls {
		m := rollFieldMonster(rng, place)
		if m.Archetype == components.MonsterArchetypeTroll {
			trolls++
		}
		if m.Elite {
			assert.Contains(t, barrowNames(m.Archetype), m.Name)
		}
	}
	assert.InDelta(t, 1.0/12, float64(trolls)/rolls, 0.01)
}

// barrowNames is every elite name the barrow prefixes give an archetype.
func barrowNames(archetype components.MonsterArchetype) []string {
	var names []string
	for _, prefix := range ElitePrefixes {
		names = append(names, prefix+" "+monsterSheets[archetype].Name)
	}
	return names
}

// The Meadows' tuning is the field constants beside the Spire's. R36, R53.
func TestGentleMeadows_CarriesTheFieldTuning(t *testing.T) {
	place := GentleMeadows()

	assert.Equal(t, []FieldCreature{{Archetype: components.MonsterArchetypeBoar, Weight: 1}}, place.Creatures)
	assert.Equal(t, MeadowsMinLevel, place.MinLevel)
	assert.Equal(t, MeadowsMaxLevel, place.MaxLevel)
	assert.Equal(t, FieldStatFactor, place.StatFactor)
	assert.Equal(t, MeadowsDropFactor, place.DropFactor)
	assert.Equal(t, FieldRespawnDelay, place.RespawnDelay)
	assert.Equal(t, FieldElitePrefixes, place.ElitePrefixes)
}

// livingMonstersNear is every living monster within r of the point.
func livingMonstersNear(s *Session, at FieldPoint, r float64) []*ecs.Entity {
	var near []*ecs.Entity
	for _, m := range monstersIn(s) {
		if monsterOf(m).Action == components.MonsterActionDead {
			continue
		}
		tc, _ := m.GetComponent(ecs.ComponentTypeTransform)
		transform := tc.(*components.TransformComponent)
		if math.Hypot(transform.X-at.X, transform.Y-at.Y) <= r {
			near = append(near, m)
		}
	}
	return near
}

// slay takes a monster to 0 and ticks once, so it lies dead from that tick as
// any kill does, and the spawn point sees it fall.
func slay(t *testing.T, s *Session, monster *ecs.Entity) {
	t.Helper()
	setHealth(t, monster, 0)
	tick(s)
	require.Equal(t, components.MonsterActionDead, monsterOf(monster).Action)
}

// spawnedAt is the living monster a spawn point holds.
func spawnedAt(t *testing.T, s *Session, i int) *ecs.Entity {
	t.Helper()
	require.NotNil(t, s.fieldPopulation)
	id := s.fieldPopulation.spawns[i].monster
	require.NotEqual(t, uuid.Nil, id, "spawn point %d holds nothing", i)
	m, ok := s.EntityManager.GetEntity(id)
	require.True(t, ok)
	return m
}

// moveBody puts a member's body at a point.
func moveBody(t *testing.T, s *Session, memberID uuid.UUID, x, y float64) {
	t.Helper()
	tc, _ := delverEntity(t, s, memberID).GetComponent(ecs.ComponentTypeTransform)
	transform := tc.(*components.TransformComponent)
	transform.X, transform.Y = x, y
}

// A booted Meadows has one boar standing on every spawn point, its level in the
// band, at the field's stats, and nothing else. R26, AC "a booted Meadows".
func TestFieldChannel_EverySpawnPointHoldsOneBoarAtBoot(t *testing.T) {
	field := builtField(t)
	place := GentleMeadows()
	layout, _ := place.Layout.Layout()

	require.Len(t, monstersIn(field), len(layout.SpawnPoints))
	for i, at := range layout.SpawnPoints {
		m := spawnedAt(t, field, i)
		monster := monsterOf(m)
		assert.Equal(t, components.MonsterArchetypeBoar, monster.Archetype)
		assert.Equal(t, at.X, monster.HomeX)
		assert.Equal(t, at.Y, monster.HomeY)
		assert.GreaterOrEqual(t, monster.Level, place.MinLevel)
		assert.LessOrEqual(t, monster.Level, place.MaxLevel)
		assert.Equal(t, fieldFactored(monster.Archetype, monster.Level, place.StatFactor, monster.Elite), statsOf(t, m))
		assert.Len(t, livingMonstersNear(field, at, 1), 1, "one monster on point %d", i)
	}
}

// A field's broadcast carries its boars, each with its level, name and health,
// for the field scene to draw. R1, R56.
func TestFieldBroadcast_CarriesItsMonsters(t *testing.T) {
	field := builtField(t)
	memberID := visitor(t, field, fieldWren)

	stateSerializer := serializer.NewStateSerializer(field.EntityManager)
	backendState, err := stateSerializer.SerializeBackendState(context.Background(), field.ID, field.worldType, field.EntityManager.GetAllEntities())
	require.NoError(t, err)
	state := stateSerializer.FormatStateToClientState(backendState, memberID)

	require.Len(t, state.Monsters, len(field.fieldLayout.SpawnPoints))
	for _, m := range state.Monsters {
		assert.Equal(t, "boar", m.Archetype)
		assert.Equal(t, "idle", m.Action)
		assert.Positive(t, m.MaxHealth)
	}
	assert.Nil(t, state.Stairs, "a field says nothing of stairs")
}

// A point stays empty while its monster lies dead and after, and rolls a new one
// at its spot the place's delay after the death. R26, R27, D14.
func TestFieldRespawn_RefillsTheDelayAfterTheDeath(t *testing.T) {
	field := builtField(t)
	at := field.fieldLayout.SpawnPoints[0]
	first := spawnedAt(t, field, 0)

	slay(t, field, first)
	assert.Equal(t, uuid.Nil, field.fieldPopulation.spawns[0].monster, "the point holds nothing living")

	field.fieldPopulation.update(FieldRespawnDelay-1, field.EntityManager.GetAllEntities())
	assert.Empty(t, livingMonstersNear(field, at, 1), "not yet due")

	field.fieldPopulation.update(1, field.EntityManager.GetAllEntities())
	next := spawnedAt(t, field, 0)
	assert.NotEqual(t, first.ID, next.ID, "a new monster, freshly rolled")
	assert.Len(t, livingMonstersNear(field, at, 1), 1)
	statsOf(t, next) // at full health

	// the rest of the field is untouched
	assert.Len(t, monstersIn(field), len(field.fieldLayout.SpawnPoints)+1, "the first one's corpse still lies")
}

// The respawn rides the world's tick: the corpse clears as in a run, and the
// point refills on the tick its delay runs out.
func TestFieldRespawn_OnTheWorldsTick(t *testing.T) {
	field := builtField(t)
	first := spawnedAt(t, field, 0)

	slay(t, field, first)
	tickFor(field, MonsterCorpseLifetime+0.1)
	_, corpse := field.EntityManager.GetEntity(first.ID)
	assert.False(t, corpse, "the corpse clears as in a run")
	assert.Equal(t, uuid.Nil, field.fieldPopulation.spawns[0].monster)

	tickFor(field, FieldRespawnDelay-MonsterCorpseLifetime)
	assert.NotEqual(t, uuid.Nil, field.fieldPopulation.spawns[0].monster, "refilled once the delay ran out")
	assert.Len(t, monstersIn(field), len(field.fieldLayout.SpawnPoints))
}

// A due respawn waits while a player in play stands within the Spire's
// exclusion radius of the point, retrying each second; a fallen player does not
// hold it. R27, D26.
func TestFieldRespawn_WaitsWhileAPlayerStandsNear(t *testing.T) {
	field := builtField(t)
	at := field.fieldLayout.SpawnPoints[0]
	memberID := uuid.New()
	_, err := field.SeatVisitor(memberID, fieldWren, fieldLoadout())
	require.NoError(t, err)

	slay(t, field, spawnedAt(t, field, 0))
	pop := field.fieldPopulation
	entities := func() []*ecs.Entity { return field.EntityManager.GetAllEntities() }

	moveBody(t, field, memberID, at.X+MonsterDelverExclusion-1, at.Y)
	pop.update(FieldRespawnDelay, entities())
	assert.Equal(t, uuid.Nil, pop.spawns[0].monster, "waits while a player stands near")
	pop.update(5, entities())
	assert.Equal(t, uuid.Nil, pop.spawns[0].monster, "still waiting")

	moveBody(t, field, memberID, at.X+MonsterDelverExclusion+1, at.Y)
	pop.update(FieldRespawnRetry/2, entities())
	assert.Equal(t, uuid.Nil, pop.spawns[0].monster, "retries each second, not each tick")
	pop.update(FieldRespawnRetry/2, entities())
	assert.NotEqual(t, uuid.Nil, pop.spawns[0].monster, "refilled once the player moved off")

	t.Run("a fallen player does not hold it", func(t *testing.T) {
		slay(t, field, spawnedAt(t, field, 0))
		moveBody(t, field, memberID, at.X, at.Y)
		setHealth(t, delverEntity(t, field, memberID), 0)

		pop.update(FieldRespawnDelay, entities())
		assert.NotEqual(t, uuid.Nil, pop.spawns[0].monster)
	})
}
