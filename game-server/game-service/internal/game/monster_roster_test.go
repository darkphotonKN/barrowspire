package game

import (
	"math/rand/v2"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A tier is a bucket of five monster levels, the sixth open-ended.
// FS-C8VM7 §A R1.
func TestTierOf_BucketsBaseLevelsByFive(t *testing.T) {
	tests := []struct{ level, tier int }{
		{0, 1}, {1, 1}, {5, 1},
		{6, 2}, {10, 2},
		{11, 3}, {15, 3},
		{16, 4}, {20, 4},
		{21, 5}, {25, 5},
		{26, 6}, {30, 6}, {60, 6},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.tier, tierOf(tt.level), "base level %d", tt.level)
	}
}

// The roster is R3's table to the id: eight families, their roles, and 25
// variants with their unlock tiers. FS-C8VM7 §A R3.
func TestSpireRoster_IsTheOwnersTable(t *testing.T) {
	type row struct {
		archetype components.MonsterArchetype
		name      string
		unlock    int
	}
	want := []struct {
		family   string
		role     monsterRole
		variants []row
	}{
		{"Ghoul", roleFodder, []row{{"ghoul", "Ghoul", 1}, {"ghast", "Ghast", 3}, {"ravener", "Ravener", 6}}},
		{"Skeleton", roleRanged, []row{{"bone_archer", "Bone Archer", 1}, {"ashen_archer", "Ashen Archer", 4}, {"wight_archer", "Wight Archer", 6}}},
		{"Troll", roleBrute, []row{{"troll", "Troll", 1}, {"cave_troll", "Cave Troll", 3}, {"blood_troll", "Blood Troll", 6}}},
		{"Thrall", roleFodder, []row{{"barrow_thrall", "Barrow Thrall", 1}, {"plague_thrall", "Plague Thrall", 4}, {"blightborn", "Blightborn", 6}}},
		{"Ghost", roleFodder, []row{{"spire_wraith", "Spire Wraith", 1}, {"shade", "Shade", 2}, {"phantom", "Phantom", 4}, {"banshee", "Banshee", 6}}},
		{"Goblin", roleFodder, []row{{"goblin", "Goblin", 2}, {"goblin_cutthroat", "Goblin Cutthroat", 3}, {"goblin_reaver", "Goblin Reaver", 5}, {"goblin_warchief", "Goblin Warchief", 6}}},
		{"Ogre", roleBrute, []row{{"ogre", "Ogre", 4}, {"ogre_mauler", "Ogre Mauler", 5}, {"ogre_tyrant", "Ogre Tyrant", 6}}},
		{"Dark Warrior", roleBrute, []row{{"dark_warrior", "Dark Warrior", 6}, {"dark_reaper", "Dark Reaper", 6}}},
	}

	require.Len(t, spireRoster, len(want))
	variants := 0
	for i, family := range spireRoster {
		assert.Equal(t, want[i].family, family.Name)
		assert.Equal(t, want[i].role, family.Role, family.Name)
		require.Len(t, family.Variants, len(want[i].variants), family.Name)
		for k, v := range family.Variants {
			variants++
			assert.Equal(t, want[i].variants[k].archetype, v.Archetype)
			assert.Equal(t, want[i].variants[k].name, monsterSheets[v.Archetype].Name, "%s's sheet name", v.Archetype)
			assert.Equal(t, want[i].variants[k].unlock, v.Unlock, "%s unlocks", v.Archetype)
		}
	}
	assert.Equal(t, 25, variants)
}

// Every tier unlocks at least one brute and two fodder, so a pool's role
// guarantee always holds; tiers only add. FS-C8VM7 §A R2, §C R20.
func TestSpireRoster_EveryTierUnlocksABruteAndTwoFodder(t *testing.T) {
	prev := 0
	for tier := 1; tier <= MaxLevelTier; tier++ {
		roles := map[monsterRole]int{}
		unlocked := 0
		for _, family := range spireRoster {
			for _, v := range family.Variants {
				if v.Unlock <= tier {
					roles[family.Role]++
					unlocked++
				}
			}
		}
		assert.GreaterOrEqual(t, roles[roleBrute], 1, "tier %d brutes", tier)
		assert.GreaterOrEqual(t, roles[roleFodder], 2, "tier %d fodder", tier)
		assert.GreaterOrEqual(t, unlocked, prev, "tier %d only adds", tier)
		prev = unlocked
	}
	assert.Equal(t, 5, unlockedCount(1), "tier 1 is today's five")
}

func unlockedCount(tier int) int {
	n := 0
	for _, family := range spireRoster {
		for _, v := range family.Variants {
			if v.Unlock <= tier {
				n++
			}
		}
	}
	return n
}

// Every variant's level-1 sheet is R6's table: the step rule applied to its
// family's step 0. FS-C8VM7 §A R5, R6.
func TestVariantSheets_MatchTheTableAtLevelOne(t *testing.T) {
	type stats struct {
		hp, dmg, def, mr int
		speed            float64
	}
	want := map[components.MonsterArchetype]stats{
		"ghoul": {40, 6, 2, 0, 150}, "ghast": {48, 7, 3, 0, 158}, "ravener": {58, 8, 4, 0, 166},
		"bone_archer": {30, 7, 2, 0, 130}, "ashen_archer": {36, 8, 3, 0, 138}, "wight_archer": {43, 9, 4, 0, 146},
		"troll": {140, 16, 10, 4, 90}, "cave_troll": {168, 18, 13, 5, 98}, "blood_troll": {202, 21, 16, 6, 106},
		"barrow_thrall": {70, 9, 5, 1, 100}, "plague_thrall": {84, 10, 6, 1, 108}, "blightborn": {101, 12, 8, 2, 116},
		"spire_wraith": {30, 8, 0, 8, 175}, "shade": {36, 9, 1, 10, 183}, "phantom": {43, 11, 2, 13, 191}, "banshee": {52, 12, 3, 16, 199},
		"goblin": {32, 8, 1, 0, 160}, "goblin_cutthroat": {38, 9, 2, 0, 168}, "goblin_reaver": {46, 11, 3, 0, 176}, "goblin_warchief": {55, 12, 4, 0, 184},
		"ogre": {200, 24, 12, 4, 75}, "ogre_mauler": {240, 28, 15, 5, 83}, "ogre_tyrant": {288, 32, 19, 6, 91},
		"dark_warrior": {260, 30, 16, 10, 120}, "dark_reaper": {312, 35, 20, 13, 128},
	}
	for archetype, w := range want {
		sheet, ok := monsterSheets[archetype]
		require.True(t, ok, "%s has a sheet", archetype)
		got := stats{sheet.HP, sheet.Damage, sheet.Defense, sheet.MagicResistance, sheet.MoveSpeed}
		assert.Equal(t, w, got, archetype)
	}
}

// Each step beats the step below on HP, speed, damage and defence, and no
// variant outruns a delver. A step keeps its family's timings, radii and
// shot. FS-C8VM7 §A R5, R6.
func TestVariantSheets_EachStepIsStrictlyBetter(t *testing.T) {
	for _, family := range spireRoster {
		base := monsterSheets[family.Variants[0].Archetype]
		for k := 1; k < len(family.Variants); k++ {
			below := monsterSheets[family.Variants[k-1].Archetype]
			sheet := monsterSheets[family.Variants[k].Archetype]
			name := family.Variants[k].Archetype
			assert.Greater(t, sheet.HP, below.HP, "%s HP", name)
			assert.Greater(t, sheet.MoveSpeed, below.MoveSpeed, "%s speed", name)
			assert.Greater(t, sheet.Damage, below.Damage, "%s damage", name)
			assert.Greater(t, sheet.Defense, below.Defense, "%s defence", name)

			assert.Equal(t, base.AttackInterval, sheet.AttackInterval, "%s interval", name)
			assert.Equal(t, base.WindUp, sheet.WindUp, "%s wind-up", name)
			assert.Equal(t, base.AttackRange, sheet.AttackRange, "%s range", name)
			assert.Equal(t, base.AggroRadius, sheet.AggroRadius, "%s aggro", name)
			assert.Equal(t, base.LeashRadius, sheet.LeashRadius, "%s leash", name)
			assert.Equal(t, base.Shot, sheet.Shot, "%s shot", name)
		}
		for _, v := range family.Variants {
			assert.Less(t, monsterSheets[v.Archetype].MoveSpeed, 200.0, "%s is outrun", v.Archetype)
		}
	}
}

// The new families' step-0 sheets carry R7's timings and radii.
// FS-C8VM7 §A R7.
func TestNewFamilySheets_CarryTheirTimingsAndRadii(t *testing.T) {
	tests := []struct {
		archetype                           components.MonsterArchetype
		interval, windUp, rng, aggro, leash float64
	}{
		{components.MonsterArchetypeGoblin, 1.0, 0.3, 45, 280, 540},
		{components.MonsterArchetypeOgre, 2.4, 0.9, 70, 220, 480},
		{components.MonsterArchetypeDarkWarrior, 1.6, 0.6, 70, 320, 600},
	}
	for _, tt := range tests {
		s := monsterSheets[tt.archetype]
		assert.Equal(t, []float64{tt.interval, tt.windUp, tt.rng, tt.aggro, tt.leash},
			[]float64{s.AttackInterval, s.WindUp, s.AttackRange, s.AggroRadius, s.LeashRadius}, tt.archetype)
		assert.Equal(t, monsterShot{}, s.Shot, "%s strikes in melee", tt.archetype)
	}
}

// No variant name holds an elite prefix's word, so an elite variant reads
// "<prefix> <variant name>" with no doubled word. FS-C8VM7 §A R4.
func TestVariantNames_ClearOfTheElitePrefixes(t *testing.T) {
	for _, family := range spireRoster {
		for _, v := range family.Variants {
			name := monsterSheets[v.Archetype].Name
			for _, prefix := range ElitePrefixes {
				assert.NotContains(t, strings.Fields(name), prefix, "%s", name)
				assert.NotContains(t, name, prefix, "%s", name)
			}
		}
	}

	elite := rollAs(fixedRand{0}, components.MonsterArchetypeBanshee, 30, 1, 1)
	assert.True(t, elite.Elite)
	assert.Equal(t, ElitePrefixes[0]+" Banshee", elite.Name)
}

// A goblin's shield look is its blade look's sheet with defence + 3, the same
// name, experience and drop row; the roster maps both looks to one variant.
// FS-C8VM7 §A R8, §E R32-R33.
func TestGoblinShieldLooks_AreTheBladeWithMoreDefence(t *testing.T) {
	looks := map[components.MonsterArchetype]components.MonsterArchetype{
		components.MonsterArchetypeGoblin:          components.MonsterArchetypeGoblinShield,
		components.MonsterArchetypeGoblinCutthroat: components.MonsterArchetypeGoblinCutthroatShield,
		components.MonsterArchetypeGoblinReaver:    components.MonsterArchetypeGoblinReaverShield,
		components.MonsterArchetypeGoblinWarchief:  components.MonsterArchetypeGoblinWarchiefShield,
	}
	for blade, shield := range looks {
		want := monsterSheets[blade]
		want.Defense += GoblinShieldDefense
		assert.Equal(t, want, monsterSheets[shield], "%s's sheet", shield)
		assert.Equal(t, killExperienceBase[blade], killExperienceBase[shield], "%s's experience", shield)
		assert.Equal(t, MonsterDrops[blade], MonsterDrops[shield], "%s's drop row", shield)

		bladeVariant, ok := variantOf(blade)
		require.True(t, ok)
		shieldVariant, ok := variantOf(shield)
		require.True(t, ok, "%s is on the roster", shield)
		assert.Equal(t, bladeVariant, shieldVariant, "both looks are one variant")
		assert.Equal(t, shield, bladeVariant.Variant.ShieldLook)
	}
	assert.Equal(t, 3, GoblinShieldDefense)
}

// A goblin rolls its look at GoblinShieldShare; a variant with one look always
// spawns as itself. FS-C8VM7 §A R8.
func TestRollLook_ShieldAtTheShare(t *testing.T) {
	goblin, _ := variantOf(components.MonsterArchetypeGoblin)
	rng := rand.New(rand.NewPCG(7, 7))
	shields, n := 0, 20000
	for range n {
		if goblin.Variant.rollLook(rng) == components.MonsterArchetypeGoblinShield {
			shields++
		}
	}
	assert.InDelta(t, GoblinShieldShare, float64(shields)/float64(n), 0.02)
	assert.Equal(t, 0.5, GoblinShieldShare)

	ghast, _ := variantOf(components.MonsterArchetypeGhast)
	assert.Equal(t, components.MonsterArchetypeGhast, ghast.Variant.rollLook(fixedRand{0}))
}

// Which family and role an archetype has is the roster's data; a boss or a
// field creature is on no roster. FS-C8VM7 §A R9.
func TestVariantOf_ReadsTheRoster(t *testing.T) {
	cave, ok := variantOf(components.MonsterArchetypeCaveTroll)
	require.True(t, ok)
	assert.Equal(t, "Troll", cave.Family.Name)
	assert.Equal(t, roleBrute, cave.Family.Role)
	assert.Equal(t, 1, cave.Step)

	for _, off := range []components.MonsterArchetype{"demon", "blood_demon", "daagon", "boar", "zombie", "ghost"} {
		_, ok := variantOf(off)
		assert.False(t, ok, "%s is no variant", off)
	}
}

// Each variant drops on its family's base row: the ghoul's for the ghoul,
// skeleton, thrall, ghost and goblin families, the troll's for the troll, ogre
// and dark warrior families. FS-C8VM7 §E R32.
func TestMonsterDrops_VariantsDropOnTheirFamilysRow(t *testing.T) {
	trollFamilies := map[string]bool{"Troll": true, "Ogre": true, "Dark Warrior": true}
	for _, family := range spireRoster {
		want := GhoulMonsterDrop
		if trollFamilies[family.Name] {
			want = TrollMonsterDrop
		}
		for _, v := range family.Variants {
			row, ok := MonsterDrops[v.Archetype]
			require.True(t, ok, "%s has a row", v.Archetype)
			assert.Equal(t, want, row, v.Archetype)
		}
	}
	assert.Equal(t, TrollMonsterDrop, MonsterDrops[components.MonsterArchetypeTroll])

	// a Cave Troll's kill rolls the troll's chance
	for _, tt := range []struct {
		roll  float64
		drops bool
	}{{0.1499, true}, {0.15, false}} {
		s := dropSession()
		newMonsterDrops(s, fixedRand{tt.roll}).ConsumeKill(systems.KillRecord{Archetype: components.MonsterArchetypeCaveTroll, Level: 1})
		if tt.drops {
			assert.Len(t, dropPiles(s), 1)
		} else {
			assert.Empty(t, dropPiles(s))
		}
	}
}

// Each variant's experience base is R33's row. FS-C8VM7 §E R33.
func TestKillExperience_VariantBases(t *testing.T) {
	want := map[components.MonsterArchetype]int{
		"ghast": 12, "ravener": 15,
		"ashen_archer": 12, "wight_archer": 14,
		"cave_troll": 30, "blood_troll": 36,
		"plague_thrall": 18, "blightborn": 22,
		"shade": 24, "phantom": 29, "banshee": 35,
		"goblin": 8, "goblin_cutthroat": 10, "goblin_reaver": 12, "goblin_warchief": 14,
		"goblin_shield": 8, "goblin_cutthroat_shield": 10, "goblin_reaver_shield": 12, "goblin_warchief_shield": 14,
		"ogre": 36, "ogre_mauler": 43, "ogre_tyrant": 51,
		"dark_warrior": 46, "dark_reaper": 56,
	}
	for archetype, base := range want {
		assert.Equal(t, base, killExperienceBase[archetype], archetype)
		assert.Equal(t, base, killExperience(systems.KillRecord{Archetype: archetype, Level: 1}), "%s at level 1", archetype)
	}
	// a Cave Troll's kill at level 3 under the standard scaling: 30 × 1.3
	assert.Equal(t, 39, killExperience(systems.KillRecord{Archetype: components.MonsterArchetypeCaveTroll, Level: 3}))
}
