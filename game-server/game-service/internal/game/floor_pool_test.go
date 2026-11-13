package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// tier1Pool is a tier-1 floor's pool: the five tier-1 variants, no draw made.
func tier1Pool() floorPool {
	return drawFloorPool(seededSpawns(1), 1)
}

// poolOf is a pool of exactly these variants, for a pass under test.
func poolOf(t *testing.T, archetypes ...components.MonsterArchetype) floorPool {
	t.Helper()
	var pool floorPool
	for _, a := range archetypes {
		entry, ok := variantOf(a)
		require.True(t, ok, "%s is a variant", a)
		pool.Members = append(pool.Members, entry)
	}
	return pool
}

// A tier-1 floor's pool is the five tier-1 variants, today's archetypes.
// FS-C8VM7 §C R19, §Edge States "Tier 1 pool".
func TestDrawFloorPool_Tier1IsTheFiveTier1Variants(t *testing.T) {
	for seed := uint64(1); seed <= 20; seed++ {
		pool := drawFloorPool(seededSpawns(seed), 1)
		assert.ElementsMatch(t, []components.MonsterArchetype{"ghoul", "bone_archer", "troll", "barrow_thrall", "spire_wraith"},
			pool.archetypes(), "seed %d", seed)
		assert.Equal(t, 1, pool.Tier)
	}
}

// At every tier a pool is five distinct variants unlocked at its tier, with
// a brute and two fodder at least; across many draws every unlocked variant
// is drawn. FS-C8VM7 §C R19-R20.
func TestDrawFloorPool_FiveDistinctUnlockedWithTheRolesGuaranteed(t *testing.T) {
	rng := seededSpawns(42)
	for tier := 1; tier <= MaxTier; tier++ {
		seen := map[components.MonsterArchetype]bool{}
		for range 2000 {
			pool := drawFloorPool(rng, tier)
			require.Len(t, pool.Members, FloorPoolSize, "tier %d", tier)
			distinct := map[components.MonsterArchetype]bool{}
			for _, m := range pool.Members {
				assert.LessOrEqual(t, m.Variant.Unlock, tier, "tier %d draws %s", tier, m.Variant.Archetype)
				distinct[m.Variant.Archetype] = true
				seen[m.Variant.Archetype] = true
			}
			assert.Len(t, distinct, FloorPoolSize, "tier %d: distinct", tier)
			assert.GreaterOrEqual(t, len(pool.of(roleBrute)), 1, "tier %d: a brute", tier)
			assert.GreaterOrEqual(t, len(pool.of(roleFodder)), 2, "tier %d: two fodder", tier)
		}
		assert.Len(t, seen, len(unlockedAt(tier)), "tier %d: every unlocked variant is drawn", tier)
	}
}

// A Dark Warrior variant weighs twice a weight-1 variant in each draw, and so
// sits in tier-6 pools far more often than a weight-1 brute. FS-C8VM7 §C R20.
func TestDrawFloorPool_DarkWarriorsWeighDouble(t *testing.T) {
	rng := seededSpawns(9)
	unlocked := unlockedAt(MaxTier)
	brute := func(e rosterEntry) bool { return e.Family.Role == roleBrute }
	picks := map[components.MonsterArchetype]int{}
	const draws = 100000
	for range draws {
		i, ok := weightedPick(rng, unlocked, brute)
		require.True(t, ok)
		picks[unlocked[i].Variant.Archetype]++
	}
	// six weight-1 brutes and two weight-2: 1/10 and 2/10 of the draws
	assert.InDelta(t, 0.1, float64(picks[components.MonsterArchetypeTroll])/draws, 0.006)
	assert.InDelta(t, 0.2, float64(picks[components.MonsterArchetypeDarkWarrior])/draws, 0.006)
	assert.InDelta(t, 0.2, float64(picks[components.MonsterArchetypeDarkReaper])/draws, 0.006)

	in := map[components.MonsterArchetype]int{}
	for range 20000 {
		for _, a := range drawFloorPool(rng, MaxTier).archetypes() {
			in[a]++
		}
	}
	ratio := float64(in[components.MonsterArchetypeDarkWarrior]) / float64(in[components.MonsterArchetypeOgreTyrant])
	assert.Greater(t, ratio, 1.5, "a Dark Warrior is in a pool far more often than a weight-1 brute")
}

// A goblin variant names both its looks in the pool's archetypes, and is one
// member of the pool. FS-C8VM7 §A R8, §G R40.
func TestFloorPool_ArchetypesNameBothGoblinLooks(t *testing.T) {
	pool := poolOf(t, "goblin_reaver", "ogre", "ghast", "shade", "wight_archer")
	assert.Equal(t, []components.MonsterArchetype{
		"goblin_reaver", "goblin_reaver_shield", "ogre", "ghast", "shade", "wight_archer",
	}, pool.archetypes())
	assert.Equal(t, []components.MonsterArchetype{}, floorPool{}.archetypes(), "an empty floor names none")
}

// A rolled monster is a pool brute at the brute share, else a pool fodder,
// uniformly within the role; never the pool's ranged member. FS-C8VM7 §C R21.
func TestFloorPool_RolledIsABruteAtTheShareElseFodder(t *testing.T) {
	pool := poolOf(t, "ogre", "cave_troll", "ghast", "shade", "ashen_archer")
	rng := seededSpawns(3)
	counts := map[components.MonsterArchetype]int{}
	const rolls = 40000
	floor := 3
	for range rolls {
		counts[pool.rolled(rng, floor).Archetype]++
	}
	brutes := float64(counts["ogre"] + counts["cave_troll"])
	assert.InDelta(t, bruteShare(floor), brutes/rolls, 0.01)
	assert.InDelta(t, 0.5, float64(counts["ogre"])/brutes, 0.02)
	assert.InDelta(t, 0.5, float64(counts["ghast"])/(rolls-brutes), 0.02)
	assert.Zero(t, counts["ashen_archer"])
}

// A goblin rolled from the pool spawns in either look, the shield at its share.
// FS-C8VM7 §A R8, §C R21.
func TestRollArchetype_AGoblinRollsItsLook(t *testing.T) {
	pool := poolOf(t, "troll", "goblin", "goblin_cutthroat")
	rng := seededSpawns(5)
	looks := map[components.MonsterArchetype]int{}
	for range 20000 {
		looks[rollArchetype(rng, pool, 1)]++
	}
	blade := looks["goblin"] + looks["goblin_cutthroat"]
	shield := looks["goblin_shield"] + looks["goblin_cutthroat_shield"]
	assert.InDelta(t, GoblinShieldShare, float64(shield)/float64(blade+shield), 0.02)
}

// The excess of Dark Warriors over min(4, ⌊n / 12⌋) is recast as another brute
// of the pool, else fodder, in place: position, level and elite kept, an
// elite's name restacked. FS-C8VM7 §C R24, §Edge States "only brute".
func TestCapDarkWarriors_RecastsTheExcessInPlace(t *testing.T) {
	floorOf := func(n int) []MonsterConfig {
		monsters := make([]MonsterConfig, n)
		for i := range monsters {
			monsters[i] = MonsterConfig{Archetype: components.MonsterArchetypeDarkReaper, Level: 30 + i%3, X: float64(i), Y: float64(2 * i)}
		}
		monsters[0].Elite, monsters[0].Name = true, "Hollow Dark Reaper"
		return monsters
	}
	tests := []struct {
		name    string
		pool    floorPool
		n, keep int
		recast  []components.MonsterArchetype
	}{
		{"another brute", poolOf(t, "dark_reaper", "ogre_tyrant", "ghast", "shade", "banshee"), 30, 2, []components.MonsterArchetype{"ogre_tyrant"}},
		{"fodder when the only brute", poolOf(t, "dark_reaper", "dark_warrior", "ghast", "shade", "banshee"), 60, 4, []components.MonsterArchetype{"ghast", "shade", "banshee"}},
		{"none under twelve", poolOf(t, "dark_reaper", "ogre", "ghast", "shade", "banshee"), 11, 0, []components.MonsterArchetype{"ogre"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			monsters := floorOf(tt.n)
			before := slices.Clone(monsters)
			tt.pool.capDarkWarriors(seededSpawns(1), configsOf(monsters))

			kept := 0
			for i, m := range monsters {
				assert.Equal(t, before[i].X, m.X)
				assert.Equal(t, before[i].Level, m.Level)
				assert.Equal(t, before[i].Elite, m.Elite)
				if capped(m.Archetype) {
					kept++
					continue
				}
				assert.Contains(t, tt.recast, m.Archetype)
				if m.Elite {
					assert.Equal(t, "Hollow "+monsterSheets[m.Archetype].Name, m.Name)
				}
			}
			assert.Equal(t, tt.keep, kept)
		})
	}
}

// deepFloor is a run whose one delver, of level, stands far from the start,
// with depth just built on a Master Spire.
func deepFloor(t *testing.T, seed uint64, level, depth int) *Session {
	t.Helper()
	s := rosterOnRun(t, seed, delverAt{level: level, x: 100, y: 100})
	currentFloor(t, s).Count = MasterSpireHeight
	s.buildFloor(depth, nil)
	return s
}

// On the deep endgame's floors every standard monster is of the floor's pool,
// no floor holds more Dark Warriors than its cap, and the floor map names the
// pool's archetypes and no boss. FS-C8VM7 §C R19, R24; §G R40.
func TestBuildFloor_DeepFloorsSpawnTheirPoolCappedAndNamed(t *testing.T) {
	warriors := 0
	for seed := uint64(1); seed <= 60; seed++ {
		depth := 1 + int(seed)%MasterSpireHeight
		s := deepFloor(t, seed, 30, depth)
		require.NotNil(t, s.dungeon, "seed %d", seed)
		pool := s.floorPool
		assert.Equal(t, MaxTier, pool.Tier)
		require.Len(t, pool.Members, FloorPoolSize)

		standard := standardMonstersIn(s)
		dark := 0
		for _, m := range standard {
			a := monsterOf(m).Archetype
			assert.Contains(t, pool.archetypes(), a, "seed %d: %s is of the pool", seed, a)
			if capped(a) {
				dark++
			}
		}
		warriors += dark
		assert.LessOrEqual(t, dark, min(DarkWarriorCapMax, len(standard)/DarkWarriorPer), "seed %d: Dark Warriors capped", seed)

		message, ok := s.FloorMapMessage()
		require.True(t, ok)
		named := wireOf(t, message)["payload"].(map[string]any)["enemy_pool"]
		var want []any
		for _, a := range pool.archetypes() {
			want = append(want, string(a))
		}
		assert.Equal(t, want, named, "seed %d: the floor map names the pool", seed)
		for _, boss := range []string{"demon", "blood_demon", "daagon"} {
			assert.NotContains(t, named, boss, "seed %d", seed)
		}
	}
	assert.Positive(t, warriors, "the deep floors hold Dark Warriors to check")
}
