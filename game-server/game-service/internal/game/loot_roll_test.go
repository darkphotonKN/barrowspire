package game

import (
	"math"
	"math/rand/v2"
	"slices"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
)

// the five tiers as FS-F8T3H R1 seeds them
var testRarities = []lootRarity{
	{ID: "r-normal", Code: "normal", DropRate: 1.00},
	{ID: "r-uncommon", Code: "uncommon", DropRate: 0.40},
	{ID: "r-rare", Code: "rare", DropRate: 0.15},
	{ID: "r-runed", Code: "runed", DropRate: 0.05},
	{ID: "r-fabled", Code: "fabled", DropRate: 0.01},
}

var (
	longsword  = types.ItemConfig{ItemType: types.ItemTypeWeapon, Name: "Longsword", AttackPower: 6, CriticalRate: 0.08, WeaponType: "sword", Description: "A plain soldier's blade."}
	plateHelm  = types.ItemConfig{ItemType: types.ItemTypeArmor, Name: "Plate Helm", DefenseRating: 5, MagicResistance: 0, ArmorSlot: types.ArmorSlotHead}
	lesserHeal = types.ItemConfig{ItemType: types.ItemTypeConsumable, Name: "Lesser Heal Potion", HealingAmount: 10, ManaAmount: 3, BuffDuration: 7}
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

func TestRollLoot_NoRarities_ReturnsBaseUnchanged(t *testing.T) {
	base := longsword
	base.RarityID = "template-rarity"

	got := rollLoot(seeded(), base, nil)

	assert.Equal(t, base, got)
}

func TestRollLoot_RarityPick_RespectsDropRateWeights(t *testing.T) {
	r := seeded()
	const n = 100_000
	counts := map[string]int{}
	for range n {
		counts[rollLoot(r, longsword, testRarities).RarityID]++
	}

	var sum float64
	for _, rar := range testRarities {
		sum += rar.DropRate
	}
	for _, rar := range testRarities {
		want := rar.DropRate / sum
		got := float64(counts[rar.ID]) / n
		assert.InDelta(t, want, got, 0.01, "tier %s", rar.Code)
	}
}

func TestRollLoot_StatsStayInTierRange(t *testing.T) {
	tests := []struct {
		code string
		mult float64
		step int
	}{
		{"normal", 1.00, 0},
		{"uncommon", 1.15, 1},
		{"rare", 1.30, 2},
		{"runed", 1.50, 3},
		{"fabled", 1.80, 4},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			r := seeded()
			lo := func(base int) int { return int(math.Round(float64(base) * 0.8 * tt.mult)) }
			hi := func(base int) int { return int(math.Round(float64(base) * 1.2 * tt.mult)) }
			critLo := longsword.CriticalRate - 0.02 + 0.01*float64(tt.step) - 0.005
			critHi := longsword.CriticalRate + 0.02 + 0.01*float64(tt.step) + 0.005

			for range 1000 {
				w := rollLoot(r, longsword, only(tt.code))
				assert.Equal(t, "r-"+tt.code, w.RarityID)
				assert.GreaterOrEqual(t, w.AttackPower, lo(longsword.AttackPower))
				assert.LessOrEqual(t, w.AttackPower, hi(longsword.AttackPower))
				assert.GreaterOrEqual(t, w.CriticalRate, critLo)
				assert.LessOrEqual(t, w.CriticalRate, critHi)
				assert.InDelta(t, math.Round(w.CriticalRate*100)/100, w.CriticalRate, 1e-9, "two decimals")
				assert.Equal(t, longsword.WeaponType, w.WeaponType)
				assert.Equal(t, longsword.Description, w.Description)

				a := rollLoot(r, plateHelm, only(tt.code))
				assert.GreaterOrEqual(t, a.DefenseRating, lo(plateHelm.DefenseRating))
				assert.LessOrEqual(t, a.DefenseRating, hi(plateHelm.DefenseRating))
				assert.Equal(t, 0, a.MagicResistance, "base 0 stays 0")
				assert.Equal(t, plateHelm.ArmorSlot, a.ArmorSlot)

				c := rollLoot(r, lesserHeal, only(tt.code))
				assert.GreaterOrEqual(t, c.HealingAmount, lo(lesserHeal.HealingAmount))
				assert.LessOrEqual(t, c.HealingAmount, hi(lesserHeal.HealingAmount))
				assert.Equal(t, lesserHeal.ManaAmount, c.ManaAmount)
				assert.Equal(t, lesserHeal.BuffDuration, c.BuffDuration)
			}
		})
	}
}

func TestRollLoot_CriticalRate_ClampsToZeroAndHalf(t *testing.T) {
	r := seeded()
	high := longsword
	high.CriticalRate = 0.50
	low := longsword
	low.CriticalRate = 0

	for range 1000 {
		assert.LessOrEqual(t, rollLoot(r, high, only("fabled")).CriticalRate, 0.50)
		assert.GreaterOrEqual(t, rollLoot(r, low, only("normal")).CriticalRate, 0.0)
	}
}

func TestRollLoot_NameFormPerTier(t *testing.T) {
	tests := []struct {
		code     string
		base     types.ItemConfig
		prefixes []string
		suffixes []string // nil = no suffix
	}{
		{"normal", longsword, nil, nil},
		{"uncommon", longsword, weaponPrefixes, nil},
		{"rare", longsword, weaponPrefixes, lootSuffixes},
		{"runed", plateHelm, armorPrefixes, grandSuffixes},
		{"fabled", plateHelm, armorPrefixes, grandSuffixes},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			name := rollLoot(seeded(), tt.base, only(tt.code)).Name

			if tt.prefixes == nil {
				assert.Equal(t, tt.base.Name, name)
				return
			}
			prefix, rest, found := strings.Cut(name, " "+tt.base.Name)
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

func TestRollLoot_Consumables_NeverTakeAffixes(t *testing.T) {
	r := seeded()
	for _, rar := range testRarities {
		assert.Equal(t, lesserHeal.Name, rollLoot(r, lesserHeal, []lootRarity{rar}).Name)
	}
}
