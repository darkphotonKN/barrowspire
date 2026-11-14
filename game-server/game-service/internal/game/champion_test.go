package game

import (
	"math"
	"slices"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// topOf is a run of height whose one delver, of level, stands far from the
// start, with its top floor just built.
func topOf(t *testing.T, seed uint64, level, height int) *Session {
	t.Helper()
	s := rosterOnRun(t, seed, delverAt{level: level, x: 100, y: 100})
	currentFloor(t, s).Count = height
	s.buildFloor(height, nil)
	return s
}

// A height-4 top floor holds one champion: a variant unlocked at the floor's
// tier the pool left out, at the old demon's level, the Demon sheet's HP and
// damage there, its variant's mitigation × 1.5, its variant's speed and
// timings. FS-C8VM7 §D R26-R28.
func TestBuildFloor_AHeight4TopFloorHoldsAChampionOutsideThePool(t *testing.T) {
	for seed := uint64(1); seed <= 30; seed++ {
		s := topOf(t, seed, 12, 4)
		pool := s.floorPool
		require.Equal(t, 3, pool.LevelTier, "seed %d: base level 15 is tier 3", seed)

		champions := bossesIn(s)[championKey]
		require.Len(t, champions, 1, "seed %d", seed)
		assert.Empty(t, bossesIn(s)[components.MonsterArchetypeDemon], "seed %d: no Green Demon", seed)
		entity := champions[0]
		champion := monsterOf(entity)
		level := 12 + MonsterLevelPerFloor*3 + DemonLevelBonus
		assertChampion(t, champion, level, "seed %d", seed)

		entry, _ := variantOf(champion.Archetype)
		assert.LessOrEqual(t, entry.Variant.Unlock, pool.LevelTier, "seed %d: unlocked at the tier", seed)
		assert.NotContains(t, pool.archetypes(), champion.Archetype, "seed %d: not of the pool", seed)

		sheet := monsterSheets[champion.Archetype]
		own := sheet.statsAt(level)
		demon := monsterSheets[components.MonsterArchetypeDemon].statsAt(level)
		assert.Equal(t, monsterStats{
			HP: demon.HP, Damage: demon.Damage,
			Defense:         int(math.Round(float64(own.Defense) * ChampionMitigationMultiplier)),
			MagicResistance: int(math.Round(float64(own.MagicResistance) * ChampionMitigationMultiplier)),
		}, statsOf(t, entity), "seed %d", seed)
		assert.Equal(t, sheet.AttackInterval, champion.AttackInterval)
		assert.Equal(t, sheet.AggroRadius, champion.AggroRadius)
		vc, _ := entity.GetComponent(ecs.ComponentTypeVelocity)
		assert.Equal(t, sheet.MoveSpeed, vc.(*components.VelocityComponent).Speed)
	}
}

// At tier 1 every unlocked variant is in the pool, so the champion is drawn
// from it. FS-C8VM7 §D R26, §Edge States "Tier 1 pool".
func TestRollChampion_FromThePoolAtTier1(t *testing.T) {
	rng := seededSpawns(4)
	seen := map[components.MonsterArchetype]bool{}
	for range 500 {
		champion := rollChampion(rng, tier1Pool(), 1, 3)
		assert.Contains(t, tier1Pool().archetypes(), champion.Archetype)
		seen[champion.Archetype] = true
	}
	assert.Len(t, seen, 5, "uniform over the pool")
}

// A champion is drawn uniformly among the leftovers, with no Dark Warrior
// weight, and a goblin champion rolls its look. FS-C8VM7 §D R26.
func TestRollChampion_UniformAmongTheLeftoversAGoblinInItsLook(t *testing.T) {
	pool := poolOf(t, "troll", "ghoul", "barrow_thrall", "spire_wraith", "bone_archer")
	pool.LevelTier = 2 // leaves the Shade and the Goblin
	rng := seededSpawns(8)
	counts := map[components.MonsterArchetype]int{}
	for range 4000 {
		counts[rollChampion(rng, pool, 5, 3).Archetype]++
	}
	goblins := counts["goblin"] + counts["goblin_shield"]
	assert.Len(t, counts, 3, "the Shade and both goblin looks: %v", counts)
	assert.InDelta(t, 0.5, float64(counts["shade"])/4000, 0.03)
	assert.InDelta(t, GoblinShieldShare, float64(counts["goblin_shield"])/float64(goblins), 0.04)
}

// No champion name or epithet holds an elite prefix's word, Vorsk or Daa'gon.
// FS-C8VM7 §D R29, §A R4.
func TestChampionNames_ClearOfThePrefixesAndTheBosses(t *testing.T) {
	assert.Len(t, ChampionNames, 12)
	assert.Len(t, ChampionEpithets, 12)
	for _, word := range slices.Concat(ChampionNames, ChampionEpithets) {
		for _, banned := range append(slices.Clone(ElitePrefixes), "Vorsk", "Daa'gon") {
			assert.False(t, strings.Contains(word, banned), "%q holds %q", word, banned)
		}
	}
}

// The blood demon still rolls on a champion's top floor, never in the
// champion's room. FS-C8VM7 §D R30.
func TestBuildFloor_BloodDemonKeepsOutOfTheChampionsRoom(t *testing.T) {
	forceBloodDemon(t, 1)
	for seed := uint64(1); seed <= 30; seed++ {
		s := topOf(t, seed, 2, 3)
		require.NotNil(t, s.dungeon)
		var championRoom, bloodRoom []int
		for _, m := range floor1Monsters(t, s) {
			switch {
			case m.monster.Champion:
				championRoom = append(championRoom, m.room)
			case m.monster.Archetype == components.MonsterArchetypeBloodDemon:
				bloodRoom = append(bloodRoom, m.room)
			}
		}
		require.Len(t, championRoom, 1, "seed %d", seed)
		require.Len(t, bloodRoom, 1, "seed %d", seed)
		assert.NotEqual(t, championRoom[0], bloodRoom[0], "seed %d", seed)
		assert.Equal(t, s.dungeon.roomsFarthestFirst()[0], championRoom[0], "seed %d: the farthest room", seed)
	}
}

// A champion that finds no spot even relaxed is skipped with an error log,
// never forced. FS-C8VM7 §D R27, §Edge States "A champion that finds no spot".
func TestPlaceDungeonDemon_AChampionWithNoSpotIsSkippedLoudly(t *testing.T) {
	s, _ := dungeonRun(t, 3, 4, 0)
	area := populationArea(t, s)
	area.keepOut = append(area.keepOut, PlaceArea{X: 0, Y: 0, W: s.mapWidth, H: s.mapHeight})
	logs := capturedLog(t)
	champion := rollChampion(seededSpawns(1), tier1Pool(), 1, 3)

	_, placed := s.placeDungeonDemon(s.dungeon, &area, champion, 3, demonGuaranteed)

	assert.False(t, placed)
	assert.Empty(t, bossesIn(s)[championKey])
	assert.Contains(t, logs.String(), `"level":"ERROR"`)
}

// A champion's kill rolls the boss row and pays the Demon's base × the boss
// multiplier at its level, not its variant's. FS-C8VM7 §D R31.
func TestKillExperience_AChampionPaysTheDemons(t *testing.T) {
	record := systems.KillRecord{Archetype: components.MonsterArchetypeOgreTyrant, Level: 5, Boss: true, Champion: true}
	assert.Equal(t, 400, killExperience(record), "25 × 1.6 × 10")
	row, ok := monsterDropFor(record)
	require.True(t, ok)
	assert.Equal(t, BossMonsterDrop, row)
}

// A champion slain on the tick carries its mark to the kill record: the party
// is paid the Demon's experience. FS-C8VM7 §D R31.
func TestRun_SlainChampionPaysTheDemonsExperience(t *testing.T) {
	s := unstartedRun(t)
	delver, killer := placeDelver(t, s, "warrior", 500, 500)
	c := CreateMonsterEntity(s.EntityManager, MonsterConfig{
		Archetype: components.MonsterArchetypeGhoul, Level: 1, Boss: true, Champion: true, Name: "Hesk the Pale", X: 545, Y: 500,
	})
	hc, _ := c.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 1
	c.RemoveComponent(ecs.ComponentTypeVelocity)
	assert.True(t, monsterOf(c).Champion)

	require.NoError(t, s.handleAttack(delver, c.ID))
	tick(s)

	sc, _ := killer.GetComponent(ecs.ComponentTypeStats)
	assert.Equal(t, 250, sc.(*components.StatsComponent).Experience, "the Demon's 25 × the boss's 10, not the ghoul's")
}
