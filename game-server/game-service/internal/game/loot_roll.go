package game

import (
	"math"
	"math/rand/v2"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

// The loot roll (FS-F8T3H R6–R12): a dropped item rolls a rarity, and the rarity
// scales its stats and names it. Pure: no session state, randomness injected.
// scripts/seed-dev.sh hand-authors instances against these rules and word lists.

// lootRarity is the part of an item_rarities row the roll needs.
type lootRarity struct {
	ID       string
	Code     string
	DropRate float64 // drop_rate_multiplier; > 0 by DB CHECK
}

type lootRand interface {
	Float64() float64
	IntN(n int) int
}

// sharedLootRand is the goroutine-safe global source sessions roll with.
type sharedLootRand struct{}

func (sharedLootRand) Float64() float64 { return rand.Float64() }
func (sharedLootRand) IntN(n int) int   { return rand.IntN(n) }

// stat multiplier and tier step (sort_order - 1) per rarity code
var lootTiers = map[string]struct {
	mult float64
	step int
}{
	"normal":   {1.00, 0},
	"uncommon": {1.15, 1},
	"rare":     {1.30, 2},
	"runed":    {1.50, 3},
	"fabled":   {1.80, 4},
}

var (
	weaponPrefixes = []string{"Keen", "Notched", "Blackened", "Grim", "Weeping", "Barrow-touched"}
	armorPrefixes  = []string{"Stout", "Weathered", "Ashen", "Grave-cold", "Riveted", "Tarnished"}
	lootSuffixes   = []string{"of Ashes", "of the Wight", "of the Barrow", "of Thorns", "of the Fen", "of Mourning"}
	grandSuffixes  = []string{"of the Last King", "of Barrowspire", "of the Drowned Crown", "of the First Dark", "of the Hollow Oath", "of Old Blood"}
)

// rollLoot returns base with a rolled rarity, scaled stats and a themed name.
// No rarities: base is returned unchanged.
func rollLoot(r lootRand, base types.ItemConfig, rarities []lootRarity) types.ItemConfig {
	if len(rarities) == 0 {
		return base
	}
	rarity := pickRarity(r, rarities)
	tier, ok := lootTiers[rarity.Code]
	if !ok {
		tier = lootTiers["normal"]
	}

	scale := func(v int) int {
		if v <= 0 {
			return 0
		}
		return int(math.Round(float64(v) * (0.8 + 0.4*r.Float64()) * tier.mult))
	}

	item := base
	item.RarityID = rarity.ID
	switch base.ItemType {
	case types.ItemTypeWeapon:
		item.AttackPower = scale(base.AttackPower)
		crit := base.CriticalRate + (r.Float64()*0.04 - 0.02) + 0.01*float64(tier.step)
		item.CriticalRate = math.Round(min(max(crit, 0), 0.50)*100) / 100
		item.Name = affixName(r, weaponPrefixes, base.Name, tier.step)
	case types.ItemTypeArmor:
		item.DefenseRating = scale(base.DefenseRating)
		item.MagicResistance = scale(base.MagicResistance)
		item.Name = affixName(r, armorPrefixes, base.Name, tier.step)
	case types.ItemTypeConsumable:
		item.HealingAmount = scale(base.HealingAmount)
	}
	return item
}

func pickRarity(r lootRand, rarities []lootRarity) lootRarity {
	var sum float64
	for _, rar := range rarities {
		sum += rar.DropRate
	}
	x := r.Float64() * sum
	for _, rar := range rarities {
		if x < rar.DropRate {
			return rar
		}
		x -= rar.DropRate
	}
	return rarities[len(rarities)-1]
}

// normal: base; uncommon: prefix base; rare: + suffix; runed/fabled: + grand suffix
func affixName(r lootRand, prefixes []string, name string, step int) string {
	if step == 0 {
		return name
	}
	name = prefixes[r.IntN(len(prefixes))] + " " + name
	switch {
	case step == 2:
		name += " " + lootSuffixes[r.IntN(len(lootSuffixes))]
	case step >= 3:
		name += " " + grandSuffixes[r.IntN(len(grandSuffixes))]
	}
	return name
}
