package game

import (
	"fmt"
	"math"
	"math/rand/v2"
	"slices"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// the five tiers as item_rarities holds them; the weights are fixture data,
// the live ones are read from the items-service (FS-4R9M9 §Requirements 7, 64)
var testRarities = []lootRarity{
	{ID: "r-normal", Code: rarityNormal, DropRate: 1.00},
	{ID: "r-uncommon", Code: rarityUncommon, DropRate: 0.40},
	{ID: "r-rare", Code: rarityRare, DropRate: 0.15},
	{ID: "r-runed", Code: rarityRuned, DropRate: 0.05},
	{ID: "r-fabled", Code: rarityFabled, DropRate: 0.005},
}

// bases at the catalogue's tier I / II / III (FS-4R9M9 §Requirements 1–5)
var (
	longsword    = lootTemplate{Config: types.ItemConfig{ItemType: types.ItemTypeWeapon, Name: "Longsword", AttackPower: 6, CriticalRate: 0.08, WeaponType: "sword", Description: "A plain soldier's blade.", RequiredLevel: 1}, MinItemLevel: 1}
	bastardSword = lootTemplate{Config: types.ItemConfig{ItemType: types.ItemTypeWeapon, Name: "Bastard Sword", AttackPower: 8, CriticalRate: 0.08, WeaponType: "sword", RequiredLevel: 6}, MinItemLevel: 8}
	blackiron    = lootTemplate{Config: types.ItemConfig{ItemType: types.ItemTypeWeapon, Name: "Blackiron Sword", AttackPower: 9, CriticalRate: 0.08, WeaponType: "sword", RequiredLevel: 13}, MinItemLevel: 15}
	plateHelm    = lootTemplate{Config: types.ItemConfig{ItemType: types.ItemTypeArmor, Name: "Plate Helm", DefenseRating: 5, MagicResistance: 0, ArmorSlot: types.ArmorSlotHead, RequiredLevel: 1}, MinItemLevel: 1}
	ironBand     = lootTemplate{Config: types.ItemConfig{ItemType: types.ItemTypeRing, Name: "Iron Band", RequiredLevel: 1}, MinItemLevel: 1}
	lesserHeal   = lootTemplate{Config: types.ItemConfig{ItemType: types.ItemTypeConsumable, Name: "Lesser Heal Potion", HealingAmount: 10, ManaAmount: 3, BuffDuration: 7}, MinItemLevel: 1}

	swordTiers = []lootTemplate{longsword, bastardSword, blackiron}
)

func seeded() *rand.Rand { return rand.New(rand.NewPCG(1, 2)) }

func only(code string) []lootRarity {
	for _, r := range testRarities {
		if r.Code == code {
			return []lootRarity{r}
		}
	}
	panic("unknown tier " + code)
}

func roll(t *testing.T, r lootRand, templates []lootTemplate, rarities []lootRarity, ilvl int) types.ItemConfig {
	t.Helper()
	item, ok := rollDrop(r, templates, nil, rarities, lootDrop{ItemLevel: ilvl})
	require.True(t, ok)
	return item
}

func TestRollDrop_BasePick_GatedByItemLevel(t *testing.T) {
	tests := []struct {
		ilvl int
		want map[string]bool // base names that may roll
	}{
		{1, map[string]bool{"Longsword": true}},
		{7, map[string]bool{"Longsword": true}},
		{8, map[string]bool{"Longsword": true, "Bastard Sword": true}},
		{15, map[string]bool{"Longsword": true, "Bastard Sword": true, "Blackiron Sword": true}},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("ilvl %d", tt.ilvl), func(t *testing.T) {
			r := seeded()
			seen := map[string]bool{}
			for range 2000 {
				seen[roll(t, r, swordTiers, only(rarityNormal), tt.ilvl).Name] = true
			}
			assert.Equal(t, tt.want, seen)
		})
	}
}

func TestRollDrop_BasePick_SkipsUniquesAndReportsNoneEligible(t *testing.T) {
	unique := blackiron
	unique.MinItemLevel = 1
	unique.Unique = true
	r := seeded()

	for range 500 {
		assert.Equal(t, "Longsword", roll(t, r, []lootTemplate{longsword, unique}, only(rarityNormal), 20).Name)
	}

	_, ok := rollDrop(r, []lootTemplate{unique, bastardSword}, nil, testRarities, lootDrop{ItemLevel: 7})
	assert.False(t, ok)
}

func TestRollDrop_AffixTiers_GatedByItemLevel(t *testing.T) {
	tests := []struct {
		ilvl int
		want map[int]bool // affix tiers that may roll
	}{
		{1, map[int]bool{1: true}},
		{7, map[int]bool{1: true}},
		{8, map[int]bool{1: true, 2: true}},
		{14, map[int]bool{1: true, 2: true}},
		{15, map[int]bool{1: true, 2: true, 3: true}},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("ilvl %d", tt.ilvl), func(t *testing.T) {
			r := seeded()
			seen := map[int]bool{}
			for range 2000 {
				for _, a := range roll(t, r, []lootTemplate{longsword, ironBand}, only(rarityRuned), tt.ilvl).Affixes {
					seen[a.Tier] = true
				}
			}
			assert.Equal(t, tt.want, seen)
		})
	}
}

func TestRollDrop_AffixCount_ByRarity(t *testing.T) {
	tests := []struct {
		code string
		want map[int]bool // affix counts that may roll
	}{
		{rarityNormal, map[int]bool{0: true}},
		{rarityUncommon, map[int]bool{1: true}},
		{rarityRare, map[int]bool{2: true}},
		{rarityRuned, map[int]bool{3: true, 4: true}},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			r := seeded()
			seen := map[int]bool{}
			for range 1000 {
				seen[len(roll(t, r, []lootTemplate{plateHelm}, only(tt.code), 15).Affixes)] = true
			}
			assert.Equal(t, tt.want, seen)
		})
	}
}

func TestRollDrop_Affixes_DistinctEligibleAndInBand(t *testing.T) {
	chest := plateHelm
	chest.Config.ArmorSlot = types.ArmorSlotChest
	legs := plateHelm
	legs.Config.ArmorSlot = types.ArmorSlotLegs
	gloves := plateHelm
	gloves.Config.ArmorSlot = types.ArmorSlotGloves

	attrs := []string{types.AffixStrength, types.AffixAgility, types.AffixIntelligence}
	armorCore := append([]string{types.AffixMaxHealth, types.AffixMaxMana, types.AffixDefense, types.AffixMagicResistance}, attrs...)
	tests := []struct {
		name     string
		base     lootTemplate
		eligible []string
	}{
		{"weapon", longsword, append([]string{types.AffixAttackSpeed, types.AffixCritChance, types.AffixFlatDamage}, attrs...)},
		{"head", plateHelm, append([]string{types.AffixCritChance}, armorCore...)},
		{"chest", chest, armorCore},
		{"legs", legs, append([]string{types.AffixMoveSpeed}, armorCore...)},
		{"gloves", gloves, append([]string{types.AffixAttackSpeed, types.AffixCritChance, types.AffixFlatDamage}, armorCore...)},
		{"ring", ironBand, []string{
			types.AffixStrength, types.AffixAgility, types.AffixIntelligence, types.AffixMaxHealth,
			types.AffixMaxMana, types.AffixAttackSpeed, types.AffixMoveSpeed, types.AffixCritChance,
			types.AffixFlatDamage, types.AffixDefense, types.AffixMagicResistance,
		}},
	}
	bands := map[string][]AffixBand{}
	for _, rule := range AffixTable {
		bands[rule.Stat] = rule.Bands
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := seeded()
			seen := map[string]bool{}
			for range 2000 {
				stats := map[string]bool{}
				for _, a := range roll(t, r, []lootTemplate{tt.base}, only(rarityRuned), 15).Affixes {
					assert.False(t, stats[a.Stat], "distinct stats")
					stats[a.Stat] = true
					seen[a.Stat] = true
					band := bands[a.Stat][a.Tier-1]
					assert.GreaterOrEqual(t, a.Value, band.Min, "%s tier %d", a.Stat, a.Tier)
					assert.LessOrEqual(t, a.Value, band.Max, "%s tier %d", a.Stat, a.Tier)
				}
			}
			assert.ElementsMatch(t, tt.eligible, keys(seen))
		})
	}
}

func TestRollAffixes_CountLargerThanPool_TakesWholePool(t *testing.T) {
	r := seeded()
	chest := types.ItemConfig{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotChest}
	table := []AffixRule{AffixTable[0], AffixTable[3], AffixTable[5]} // strength, max_health, attack_speed: two roll on a chest

	for range 200 {
		affixes := rollAffixes(r, chest, 4, 1, table)
		require.Len(t, affixes, 2)
		assert.ElementsMatch(t, []string{types.AffixStrength, types.AffixMaxHealth}, []string{affixes[0].Stat, affixes[1].Stat})
	}
}

func TestRollDrop_Consumables_NeverTakeAffixes(t *testing.T) {
	r := seeded()
	for _, rar := range testRarities {
		for range 200 {
			c := roll(t, r, []lootTemplate{lesserHeal}, []lootRarity{rar}, 20)
			assert.Empty(t, c.Affixes)
			assert.Equal(t, lesserHeal.Config.Name, c.Name)
		}
	}
}

func keys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestRequiredLevel_MaxOfBaseAndHighestAffixTier(t *testing.T) {
	tests := []struct {
		name    string
		base    int
		affixes []types.Affix
		want    int
	}{
		{"tier III base, tier I affixes", 13, []types.Affix{{Stat: types.AffixStrength, Tier: 1, Value: 2}, {Stat: types.AffixDefense, Tier: 1, Value: 1}}, 13},
		{"tier I base, one tier II affix", 1, []types.Affix{{Stat: types.AffixStrength, Tier: 1, Value: 1}, {Stat: types.AffixAgility, Tier: 2, Value: 3}}, 6},
		{"tier I base, tier III affix", 1, []types.Affix{{Stat: types.AffixAgility, Tier: 3, Value: 5}}, 13},
		{"no affixes", 6, nil, 6},
		{"unset base requirement", 0, nil, 1},
		{"fixed unique affix adds nothing", 7, []types.Affix{{Stat: types.AffixMaxHealth, Tier: 0, Value: 12}}, 7},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, requiredLevel(tt.base, tt.affixes))
		})
	}
}

func TestRollDrop_RequiredLevel_DerivedFromBaseAndAffixes(t *testing.T) {
	r := seeded()
	tierReq := map[int]int{1: 1, 2: 6, 3: 13}
	seen := map[int]bool{}
	for range 3000 {
		item := roll(t, r, append([]lootTemplate{ironBand}, swordTiers...), testRarities, 15)
		want := 1 // ring
		if item.ItemType == types.ItemTypeWeapon {
			want = map[string]int{"Longsword": 1, "Bastard Sword": 6, "Blackiron Sword": 13}[baseName(item.Name)]
		}
		for _, a := range item.Affixes {
			want = max(want, tierReq[a.Tier])
		}
		assert.Equal(t, want, item.RequiredLevel, "%s %+v", item.Name, item.Affixes)
		seen[item.RequiredLevel] = true
	}
	assert.Equal(t, map[int]bool{1: true, 6: true, 13: true}, seen)
}

func TestRollDrop_Consumables_RequireLevelOne(t *testing.T) {
	heal := lesserHeal
	heal.Config.RequiredLevel = 9
	r := seeded()
	for range 200 {
		assert.Equal(t, 1, roll(t, r, []lootTemplate{heal}, testRarities, 20).RequiredLevel)
		assert.Equal(t, 1, roll(t, r, []lootTemplate{heal}, nil, 20).RequiredLevel)
	}
}

// baseName strips a rolled name's prefix and suffix back to the sword base.
func baseName(rolled string) string {
	for _, b := range swordTiers {
		if strings.Contains(rolled, b.Config.Name) {
			return b.Config.Name
		}
	}
	return rolled
}

func TestRarityWeights_Modifiers(t *testing.T) {
	fab := testRarities[4].DropRate // fixture weight; the live one is item_rarities'
	f1 := 1 + 1/RarityItemLevelDivisor
	f20 := 1 + 20/RarityItemLevelDivisor
	e, d := EliteRarityWeightMultiplier, DemonRarityWeightMultiplier
	tests := []struct {
		name     string
		itemType types.ItemType
		drop     lootDrop
		want     []float64 // normal, uncommon, rare, runed, fabled
	}{
		{"ilvl 1 standard", types.ItemTypeWeapon, lootDrop{ItemLevel: 1}, []float64{1, 0.4, 0.15 * f1, 0.05 * f1, fab * f1}},
		{"ilvl factor on Rare and above only", types.ItemTypeArmor, lootDrop{ItemLevel: 20}, []float64{1, 0.4, 0.15 * f20, 0.05 * f20, fab * f20}},
		{"elite doubles above Normal", types.ItemTypeWeapon, lootDrop{ItemLevel: 1, Source: lootSourceElite}, []float64{1, 0.4 * e, 0.15 * f1 * e, 0.05 * f1 * e, fab * f1 * e}},
		{"demon quadruples above Normal and drops Normal", types.ItemTypeWeapon, lootDrop{ItemLevel: 1, Source: lootSourceDemon}, []float64{0, 0.4 * d, 0.15 * f1 * d, 0.05 * f1 * d, fab * f1 * d}},
		{"consumable never Fabled", types.ItemTypeConsumable, lootDrop{ItemLevel: 1}, []float64{1, 0.4, 0.15 * f1, 0.05 * f1, 0}},
		{"Normal ring becomes Uncommon", types.ItemTypeRing, lootDrop{ItemLevel: 1}, []float64{0, 1.4, 0.15 * f1, 0.05 * f1, fab * f1}},
		{"demon ring", types.ItemTypeRing, lootDrop{ItemLevel: 1, Source: lootSourceDemon}, []float64{0, 0.4 * d, 0.15 * f1 * d, 0.05 * f1 * d, fab * f1 * d}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.InDeltaSlice(t, tt.want, rarityWeights(testRarities, tt.itemType, tt.drop), 1e-12)
		})
	}
}

func TestRollDrop_RarityPick_RespectsWeights(t *testing.T) {
	r := seeded()
	const n = 100_000
	counts := map[string]int{}
	for range n {
		counts[roll(t, r, []lootTemplate{longsword}, testRarities, 1).RarityID]++
	}

	w := rarityWeights(testRarities, types.ItemTypeWeapon, lootDrop{ItemLevel: 1})
	var sum float64
	for _, x := range w {
		sum += x
	}
	want := map[string]float64{ // no uniques: Fabled lands on Runed
		"r-normal":   w[0] / sum,
		"r-uncommon": w[1] / sum,
		"r-rare":     w[2] / sum,
		"r-runed":    (w[3] + w[4]) / sum,
	}
	for id, p := range want {
		assert.InDelta(t, p, float64(counts[id])/n, 0.01, id)
	}
	assert.Zero(t, counts["r-fabled"])
}

func TestRollDrop_Ring_NeverNormal(t *testing.T) {
	r := seeded()
	for range 2000 {
		assert.NotEqual(t, "r-normal", roll(t, r, []lootTemplate{ironBand}, testRarities, 1).RarityID)
	}
}

func TestRollDrop_Fabled_WithNoUnique_RollsRunedOfSameType(t *testing.T) {
	r := seeded()
	for _, base := range []lootTemplate{longsword, plateHelm, ironBand} {
		for range 300 {
			item := roll(t, r, []lootTemplate{base}, fabledOnly(), 1)
			assert.Equal(t, "r-runed", item.RarityID)
			assert.Equal(t, base.Config.ItemType, item.ItemType)
			assert.Contains(t, []int{3, 4}, len(item.Affixes))
		}
	}
}

func TestRollDrop_NoRarities_KeepsBaseStatsNoAffixesAndItemLevel(t *testing.T) {
	base := longsword
	base.Config.RarityID = "template-rarity"
	r := seeded()
	for _, ilvl := range []int{1, 9, 20} {
		got := roll(t, r, []lootTemplate{base}, nil, ilvl)

		want := base.Config
		want.ItemLevel = ilvl
		assert.Equal(t, want, got)
	}
}

func TestRollDrop_BaseStats_FlatRarityMultipliersNoCritStep(t *testing.T) {
	tests := []struct {
		code string
		mult float64
	}{
		{rarityNormal, 1.00},
		{rarityUncommon, 1.05},
		{rarityRare, 1.10},
		{rarityRuned, 1.15},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			r := seeded()
			lo := func(base int) int { return int(math.Round(float64(base) * 0.8 * tt.mult)) }
			hi := func(base int) int { return int(math.Round(float64(base) * 1.2 * tt.mult)) }
			sword, helm, heal := longsword.Config, plateHelm.Config, lesserHeal.Config

			for range 1000 {
				w := roll(t, r, []lootTemplate{longsword}, only(tt.code), 1)
				assert.Equal(t, "r-"+tt.code, w.RarityID)
				assert.GreaterOrEqual(t, w.AttackPower, lo(sword.AttackPower))
				assert.LessOrEqual(t, w.AttackPower, hi(sword.AttackPower))
				assert.GreaterOrEqual(t, w.CriticalRate, sword.CriticalRate-0.02-1e-9, "no tier step")
				assert.LessOrEqual(t, w.CriticalRate, sword.CriticalRate+0.02+1e-9, "no tier step")
				assert.InDelta(t, math.Round(w.CriticalRate*100)/100, w.CriticalRate, 1e-9, "two decimals")
				assert.Equal(t, sword.WeaponType, w.WeaponType)
				assert.Equal(t, sword.Description, w.Description)

				a := roll(t, r, []lootTemplate{plateHelm}, only(tt.code), 1)
				assert.GreaterOrEqual(t, a.DefenseRating, lo(helm.DefenseRating))
				assert.LessOrEqual(t, a.DefenseRating, hi(helm.DefenseRating))
				assert.Equal(t, 0, a.MagicResistance, "base 0 stays 0")
				assert.Equal(t, helm.ArmorSlot, a.ArmorSlot)

				ring := roll(t, r, []lootTemplate{ironBand}, only(tt.code), 1)
				assert.Zero(t, ring.AttackPower+ring.DefenseRating+ring.MagicResistance, "a ring has no base stats")

				c := roll(t, r, []lootTemplate{lesserHeal}, only(tt.code), 1)
				assert.GreaterOrEqual(t, c.HealingAmount, lo(heal.HealingAmount))
				assert.LessOrEqual(t, c.HealingAmount, hi(heal.HealingAmount))
				assert.Equal(t, heal.ManaAmount, c.ManaAmount)
				assert.Equal(t, heal.BuffDuration, c.BuffDuration)
			}
		})
	}
}

func TestRollDrop_CriticalRate_ClampsToZeroAndHalf(t *testing.T) {
	r := seeded()
	high := longsword
	high.Config.CriticalRate = 0.50
	low := longsword
	low.Config.CriticalRate = 0

	for range 1000 {
		assert.LessOrEqual(t, roll(t, r, []lootTemplate{high}, only(rarityRuned), 1).CriticalRate, 0.50)
		assert.GreaterOrEqual(t, roll(t, r, []lootTemplate{low}, only(rarityNormal), 1).CriticalRate, 0.0)
	}
}

func TestRollDrop_NameFormPerRarity(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		base     lootTemplate
		prefixes []string
		suffixes []string // nil = no suffix
	}{
		{"normal", rarityNormal, longsword, nil, nil},
		{"uncommon", rarityUncommon, longsword, weaponPrefixes, nil},
		{"rare", rarityRare, longsword, weaponPrefixes, lootSuffixes},
		{"runed", rarityRuned, plateHelm, armorPrefixes, grandSuffixes},
		{"ring takes armor prefixes", rarityRare, ironBand, armorPrefixes, lootSuffixes},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			name := roll(t, seeded(), []lootTemplate{tt.base}, only(tt.code), 1).Name

			if tt.prefixes == nil {
				assert.Equal(t, tt.base.Config.Name, name)
				return
			}
			prefix, rest, found := strings.Cut(name, " "+tt.base.Config.Name)
			assert.True(t, found, "base name kept in %q", name)
			assert.True(t, slices.Contains(tt.prefixes, prefix), "prefix %q", prefix)
			if tt.suffixes == nil {
				assert.Empty(t, rest)
				return
			}
			assert.True(t, slices.Contains(tt.suffixes, strings.TrimPrefix(rest, " ")), "suffix %q", rest)
		})
	}
}

// A rolled item carries its rarity's code beside its id, so world state can
// show it without the rarity list. FS-4R9M9 §Requirements 54.
func TestRollDrop_CarriesTheRarityCode(t *testing.T) {
	for _, code := range []string{rarityNormal, rarityUncommon, rarityRare, rarityRuned} {
		item := roll(t, seeded(), []lootTemplate{longsword}, only(code), 1)
		assert.Equal(t, code, item.RarityCode)
		assert.NotEmpty(t, item.RarityID)
	}
}

// the six uniques of v1 (FS-4R9M9 §Requirements 31); stats are the roll's centre
var sixUniques = []uniqueTemplate{
	newUnique("Wightfang", types.ItemConfig{ItemType: types.ItemTypeWeapon, WeaponType: "knife", AttackPower: 4, CriticalRate: 0.18}, 6, 5, types.UniqueEffectKillFrenzy,
		affixRange{types.AffixAgility, 2, 4}, affixRange{types.AffixAttackSpeed, 4, 6}),
	newUnique("Gravewarden's Oath", types.ItemConfig{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotChest, DefenseRating: 10, MagicResistance: 1}, 8, 7, types.UniqueEffectMeleeReflect,
		affixRange{types.AffixMaxHealth, 10, 16}, affixRange{types.AffixStrength, 2, 3}),
	newUnique("Lantern of the Drowned", types.ItemConfig{ItemType: types.ItemTypeRing}, 10, 9, types.UniqueEffectPierce,
		affixRange{types.AffixIntelligence, 2, 4}, affixRange{types.AffixMaxMana, 10, 16}, affixRange{types.AffixMagicResistance, 2, 3}),
	newUnique("The Hollow Crown", types.ItemConfig{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead, DefenseRating: 2, MagicResistance: 5}, 12, 10, types.UniqueEffectKillHeal,
		affixRange{types.AffixMaxHealth, 12, 18}, affixRange{types.AffixDefense, 2, 3}),
	newUnique("Ashwalk Greaves", types.ItemConfig{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotLegs, DefenseRating: 4, MagicResistance: 2}, 14, 12, types.UniqueEffectBurningDash,
		affixRange{types.AffixMoveSpeed, 6, 8}, affixRange{types.AffixAgility, 3, 4}),
	newUnique("Ring of the Last King", types.ItemConfig{ItemType: types.ItemTypeRing}, 18, 16, types.UniqueEffectFloorAttributes,
		affixRange{types.AffixStrength, 1, 2}, affixRange{types.AffixAgility, 1, 2}, affixRange{types.AffixIntelligence, 1, 2}, affixRange{types.AffixCritChance, 1, 2}),
}

func newUnique(name string, config types.ItemConfig, minItemLevel, requiredLevel int, effect string, fixed ...affixRange) uniqueTemplate {
	config.Name = name
	config.Description = name + " remembers the barrow."
	config.RequiredLevel = requiredLevel
	config.UniqueEffectCode = effect
	config.UniqueEffectText = "effect of " + name
	return uniqueTemplate{
		lootTemplate: lootTemplate{Config: config, MinItemLevel: minItemLevel, Unique: true},
		FixedAffixes: fixed,
	}
}

// fabledOnly is the fixture table with every tier but Fabled weighted out.
func fabledOnly() []lootRarity {
	out := make([]lootRarity, len(testRarities))
	copy(out, testRarities)
	for i := range out {
		if out[i].Code != rarityFabled {
			out[i].DropRate = 0
		}
	}
	return out
}

func rollWithUniques(t *testing.T, r lootRand, base lootTemplate, uniques []uniqueTemplate, rarities []lootRarity, ilvl int) types.ItemConfig {
	t.Helper()
	item, ok := rollDrop(r, []lootTemplate{base}, uniques, rarities, lootDrop{ItemLevel: ilvl})
	require.True(t, ok)
	return item
}

// A Fabled result picks uniformly among the uniques the item level allows,
// whatever the drop's own type. FS-4R9M9 §Requirements 25.
func TestRollDrop_Fabled_PicksAUniqueEligibleAtTheItemLevel(t *testing.T) {
	r := seeded()
	counts := map[string]int{}
	const n = 4000
	for i := range n {
		base := []lootTemplate{longsword, plateHelm, ironBand}[i%3]
		item := rollWithUniques(t, r, base, sixUniques, fabledOnly(), 12)
		assert.Equal(t, "r-fabled", item.RarityID)
		assert.Equal(t, rarityFabled, item.RarityCode)
		counts[item.Name]++
	}

	eligible := []string{"Wightfang", "Gravewarden's Oath", "Lantern of the Drowned", "The Hollow Crown"}
	assert.ElementsMatch(t, eligible, keys(counts), "never Ashwalk Greaves (14) or Ring of the Last King (18)")
	for _, name := range eligible {
		assert.InDelta(t, 0.25, float64(counts[name])/n, 0.03, "uniform: %s", name)
	}
}

// No unique the item level allows: the drop is a Runed item of its own type.
// FS-4R9M9 §Requirements 26; §Edge States "No eligible unique".
func TestRollDrop_Fabled_NoUniqueEligible_RollsRunedOfTheDropsType(t *testing.T) {
	r := seeded()
	for _, base := range []lootTemplate{longsword, plateHelm, ironBand} {
		for range 300 {
			item := rollWithUniques(t, r, base, sixUniques, fabledOnly(), 5)
			assert.Equal(t, "r-runed", item.RarityID)
			assert.Equal(t, base.Config.ItemType, item.ItemType)
			assert.Empty(t, item.UniqueEffectCode)
			assert.Contains(t, []int{3, 4}, len(item.Affixes))
		}
	}
}

// A unique keeps its authored name, lore and effect; its base stats roll at
// Runed's ×1.15; its fixed affixes are tier 0 inside their ranges; its
// required level is its template's. FS-4R9M9 §Requirements 19, 23, 27–28.
func TestRollDrop_Fabled_UniqueRollsFixedAffixesAndRunedStats(t *testing.T) {
	r := seeded()
	lo := func(base int) int { return int(math.Round(float64(base) * 0.8 * 1.15)) }
	hi := func(base int) int { return int(math.Round(float64(base) * 1.2 * 1.15)) }
	for _, u := range sixUniques {
		t.Run(u.Config.Name, func(t *testing.T) {
			solo := []uniqueTemplate{u}
			for range 500 {
				item := rollWithUniques(t, r, longsword, solo, fabledOnly(), 20)

				assert.Equal(t, u.Config.Name, item.Name)
				assert.Equal(t, u.Config.Description, item.Description)
				assert.Equal(t, u.Config.ItemType, item.ItemType)
				assert.Equal(t, u.Config.UniqueEffectCode, item.UniqueEffectCode)
				assert.Equal(t, u.Config.UniqueEffectText, item.UniqueEffectText)
				assert.Equal(t, 20, item.ItemLevel)
				assert.Equal(t, u.Config.RequiredLevel, item.RequiredLevel)

				require.Len(t, item.Affixes, len(u.FixedAffixes))
				for i, a := range item.Affixes {
					assert.Equal(t, u.FixedAffixes[i].Stat, a.Stat)
					assert.Zero(t, a.Tier, "a fixed affix is tier 0")
					assert.GreaterOrEqual(t, a.Value, u.FixedAffixes[i].Min)
					assert.LessOrEqual(t, a.Value, u.FixedAffixes[i].Max)
				}

				for _, stat := range [][2]int{
					{u.Config.AttackPower, item.AttackPower},
					{u.Config.DefenseRating, item.DefenseRating},
					{u.Config.MagicResistance, item.MagicResistance},
				} {
					assert.GreaterOrEqual(t, stat[1], lo(stat[0]))
					assert.LessOrEqual(t, stat[1], hi(stat[0]))
				}
				assert.InDelta(t, u.Config.CriticalRate, item.CriticalRate, 0.02+1e-9)
			}
		})
	}
}

// A unique's fixed affix values cover their whole range.
func TestRollUnique_FixedAffixValuesCoverTheirRange(t *testing.T) {
	r := seeded()
	fabled := testRarities[4]
	seen := map[int]bool{}
	for range 500 {
		seen[rollUnique(r, sixUniques[1], fabled, 8).Affixes[0].Value] = true // max_health 10–16
	}
	assert.Len(t, seen, 7)
}
