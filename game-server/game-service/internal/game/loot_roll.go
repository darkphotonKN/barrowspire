package game

import (
	"math"
	"math/rand/v2"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

// The loot roll (FS-4R9M9 §Requirements 11–18, 21–23, 26; FS-F8T3H R9–R11):
// a drop picks a base its item level allows, rolls a rarity, and the rarity
// scales its stats, names it and decides how many affixes it takes. Pure: no
// session state, randomness injected. Every number lives in loot_tuning.go.

// item_rarities.rarity_code values the roll knows
const (
	rarityNormal   = "normal"
	rarityUncommon = "uncommon"
	rarityRare     = "rare"
	rarityRuned    = "runed"
	rarityFabled   = "fabled"
)

// lootRarity is the part of an item_rarities row the roll needs.
type lootRarity struct {
	ID       string
	Code     string
	DropRate float64 // drop_rate_multiplier; > 0 by DB CHECK
}

// lootTemplate is a catalogue template as the roll sees it: the item it
// copies, the lowest item level it can drop at and whether it is a unique
// (never part of the base pool). Config.RequiredLevel is the base's.
type lootTemplate struct {
	Config       types.ItemConfig
	MinItemLevel int
	Unique       bool
}

// lootDrop is what is dropping: its item level, its source and whether it
// may be a ring (a chest's may not, its Fabled pick included).
type lootDrop struct {
	ItemLevel int
	Source    lootSource
	NoRings   bool
}

// lootSource biases the rarity roll. FS-4R9M9 §Requirements 21.
type lootSource int

const (
	lootSourceStandard lootSource = iota
	lootSourceElite
	lootSourceDemon
)

type lootRand interface {
	Float64() float64
	IntN(n int) int
}

// sharedLootRand is the goroutine-safe global source sessions roll with.
type sharedLootRand struct{}

func (sharedLootRand) Float64() float64 { return rand.Float64() }
func (sharedLootRand) IntN(n int) int   { return rand.IntN(n) }

// name form per rarity: 0 base · 1 prefix · 2 + suffix · 3 + grand suffix
var nameSteps = map[string]int{
	rarityNormal:   0,
	rarityUncommon: 1,
	rarityRare:     2,
	rarityRuned:    3,
}

var (
	weaponPrefixes = []string{"Keen", "Notched", "Blackened", "Grim", "Weeping", "Barrow-touched"}
	armorPrefixes  = []string{"Stout", "Weathered", "Ashen", "Grave-cold", "Riveted", "Tarnished"}
	lootSuffixes   = []string{"of Ashes", "of the Wight", "of the Barrow", "of Thorns", "of the Fen", "of Mourning"}
	grandSuffixes  = []string{"of the Last King", "of Barrowspire", "of the Drowned Crown", "of the First Dark", "of the Hollow Oath", "of Old Blood"}
)

// rollDrop rolls one item from templates (all of one item type) for drop. A
// Fabled result becomes one of uniques the item level allows, of any type, or
// a Runed item of the drop's type when none is. ok is false when no non-unique
// template is eligible at the item level. FS-4R9M9 §Requirements 22, 25–26.
func rollDrop(r lootRand, templates []lootTemplate, uniques []uniqueTemplate, rarities []lootRarity, drop lootDrop) (types.ItemConfig, bool) {
	ilvl := max(drop.ItemLevel, 1)
	base, ok := pickBase(r, templates, ilvl)
	if !ok {
		return types.ItemConfig{}, false
	}

	rarity, rolled := pickRarity(r, rarities, rarityWeights(rarities, base.Config.ItemType, drop))
	if rolled && rarity.Code == rarityFabled {
		if unique, ok := pickUnique(r, uniques, ilvl, drop.NoRings); ok {
			return rollUnique(r, unique, rarity, ilvl), true
		}
		rarity, rolled = rarityByCode(rarities, rarityRuned)
	}

	item := base.Config
	item.ItemLevel = ilvl
	if rolled {
		rollRarity(r, &item, base.Config, rarity, ilvl)
	}
	item.RequiredLevel = requiredLevel(base.Config.RequiredLevel, item.Affixes)
	if item.ItemType == types.ItemTypeConsumable {
		item.RequiredLevel = 1
	}
	return item, true
}

// rollRarity applies rarity to item: its id, scaled stats, name and affixes.
// An unknown rarity code rolls as Normal.
func rollRarity(r lootRand, item *types.ItemConfig, base types.ItemConfig, rarity lootRarity, ilvl int) {
	roll, ok := RarityRolls[rarity.Code]
	if !ok {
		roll = RarityRolls[rarityNormal]
	}
	item.RarityID = rarity.ID
	item.RarityCode = rarity.Code
	rollBaseStats(r, item, base, roll.StatMultiplier)
	item.Name = rolledName(r, base, nameSteps[rarity.Code])
	if base.ItemType != types.ItemTypeConsumable {
		count := roll.AffixMin + r.IntN(roll.AffixMax-roll.AffixMin+1)
		item.Affixes = rollAffixes(r, base, count, ilvl, AffixTable)
	}
}

// pickUnique picks uniformly among the uniques the item level allows, ring
// uniques left out when noRings. FS-4R9M9 §Requirements 25, 47.
func pickUnique(r lootRand, uniques []uniqueTemplate, ilvl int, noRings bool) (uniqueTemplate, bool) {
	eligible := make([]uniqueTemplate, 0, len(uniques))
	for _, u := range uniques {
		if noRings && u.Config.ItemType == types.ItemTypeRing {
			continue
		}
		if u.MinItemLevel <= ilvl {
			eligible = append(eligible, u)
		}
	}
	if len(eligible) == 0 {
		return uniqueTemplate{}, false
	}
	return eligible[r.IntN(len(eligible))], true
}

// rollUnique rolls unique as a Fabled item: its authored name, lore and
// effect, base stats at Runed's multiplier, its fixed affixes rolled in their
// ranges at tier 0 and its template's required level. FS-4R9M9 §Requirements
// 19, 23, 27–28.
func rollUnique(r lootRand, unique uniqueTemplate, fabled lootRarity, ilvl int) types.ItemConfig {
	item := unique.Config
	item.ItemLevel = ilvl
	item.RarityID = fabled.ID
	item.RarityCode = fabled.Code
	rollBaseStats(r, &item, unique.Config, RarityRolls[rarityRuned].StatMultiplier)

	item.Affixes = make([]types.Affix, 0, len(unique.FixedAffixes))
	for _, fixed := range unique.FixedAffixes {
		value := fixed.Min
		if fixed.Max > fixed.Min {
			value += r.IntN(fixed.Max - fixed.Min + 1)
		}
		item.Affixes = append(item.Affixes, types.Affix{Stat: fixed.Stat, Tier: 0, Value: value})
	}
	item.RequiredLevel = requiredLevel(unique.Config.RequiredLevel, item.Affixes)
	return item
}

// requiredLevel is the D2 rule: the base's requirement or the highest one among
// the affix tiers, whichever is greater; at least 1. A fixed (tier 0) affix
// adds none. FS-4R9M9 §Requirements 23.
func requiredLevel(base int, affixes []types.Affix) int {
	req := max(base, 1)
	for _, a := range affixes {
		if a.Tier >= 1 && a.Tier <= len(LootTiers) {
			req = max(req, LootTiers[a.Tier-1].RequiredLevel)
		}
	}
	return req
}

// pickBase picks uniformly among the non-unique templates the item level
// allows. FS-4R9M9 §Requirements 12.
func pickBase(r lootRand, templates []lootTemplate, ilvl int) (lootTemplate, bool) {
	eligible := make([]lootTemplate, 0, len(templates))
	for _, t := range templates {
		if !t.Unique && t.MinItemLevel <= ilvl {
			eligible = append(eligible, t)
		}
	}
	if len(eligible) == 0 {
		return lootTemplate{}, false
	}
	return eligible[r.IntN(len(eligible))], true
}

// rollBaseStats scales base's integer stats by spread × mult and jitters a
// weapon's crit. FS-4R9M9 §Requirements 13.
func rollBaseStats(r lootRand, item *types.ItemConfig, base types.ItemConfig, mult float64) {
	scale := func(v int) int {
		if v <= 0 {
			return 0
		}
		spread := LootStatSpreadMin + (LootStatSpreadMax-LootStatSpreadMin)*r.Float64()
		return int(math.Round(float64(v) * spread * mult))
	}
	switch base.ItemType {
	case types.ItemTypeWeapon:
		item.AttackPower = scale(base.AttackPower)
		crit := base.CriticalRate + (2*r.Float64()-1)*LootCritSpread
		item.CriticalRate = math.Round(min(max(crit, 0), LootCritCap)*100) / 100
	case types.ItemTypeArmor:
		item.DefenseRating = scale(base.DefenseRating)
		item.MagicResistance = scale(base.MagicResistance)
	case types.ItemTypeConsumable:
		item.HealingAmount = scale(base.HealingAmount)
	}
}

// rollAffixes rolls count affixes with distinct stats drawn uniformly from the
// table rows that roll on item; each picks its tier uniformly among those ilvl
// unlocks and its value uniformly in that tier's band. A count larger than the
// eligible pool takes the whole pool. FS-4R9M9 §Requirements 16–18.
func rollAffixes(r lootRand, item types.ItemConfig, count, ilvl int, table []AffixRule) []types.Affix {
	pool := make([]AffixRule, 0, len(table))
	for _, rule := range table {
		if rollsOn(rule, item) {
			pool = append(pool, rule)
		}
	}
	count = min(count, len(pool))
	if count == 0 {
		return nil
	}

	unlocked := 0
	for unlocked < len(LootTiers) && LootTiers[unlocked].MinItemLevel <= ilvl {
		unlocked++
	}

	affixes := make([]types.Affix, 0, count)
	for i := range count {
		// partial Fisher–Yates: pool[:i] holds the stats already drawn
		j := i + r.IntN(len(pool)-i)
		pool[i], pool[j] = pool[j], pool[i]

		tier := 1 + r.IntN(unlocked)
		band := pool[i].Bands[tier-1]
		affixes = append(affixes, types.Affix{
			Stat:  pool[i].Stat,
			Tier:  tier,
			Value: band.Min + r.IntN(band.Max-band.Min+1),
		})
	}
	return affixes
}

// rollsOn reports whether rule can roll on item: by item type, or for armor
// by its slot.
func rollsOn(rule AffixRule, item types.ItemConfig) bool {
	return slices.Contains(rule.On, string(item.ItemType)) ||
		(item.ItemType == types.ItemTypeArmor && slices.Contains(rule.On, string(item.ArmorSlot)))
}

// rarityWeights is each rarity's drop weight for this drop, aligned with
// rarities, adjusted in the FS order: item level on Rare and above, then an
// elite or demon source, then the item type. FS-4R9M9 §Requirements 21.
func rarityWeights(rarities []lootRarity, itemType types.ItemType, drop lootDrop) []float64 {
	ilvlFactor := 1 + float64(max(drop.ItemLevel, 1))/RarityItemLevelDivisor
	normal, uncommon := -1, -1
	weights := make([]float64, len(rarities))
	for i, rar := range rarities {
		w := rar.DropRate
		switch rar.Code {
		case rarityNormal:
			normal = i
		case rarityUncommon:
			uncommon = i
		case rarityRare, rarityRuned, rarityFabled:
			w *= ilvlFactor
		}
		if rar.Code != rarityNormal {
			switch drop.Source {
			case lootSourceElite:
				w *= EliteRarityWeightMultiplier
			case lootSourceDemon:
				w *= DemonRarityWeightMultiplier
			}
		}
		if rar.Code == rarityFabled && itemType == types.ItemTypeConsumable {
			w = 0
		}
		weights[i] = w
	}

	if normal >= 0 && drop.Source == lootSourceDemon {
		weights[normal] = 0
	}
	if normal >= 0 && uncommon >= 0 && itemType == types.ItemTypeRing {
		weights[uncommon] += weights[normal]
		weights[normal] = 0
	}
	return weights
}

// pickRarity draws one rarity by weight. ok is false when there is nothing to
// draw. A Fabled result is left for rollDrop to resolve. FS-4R9M9 §Requirements 21.
func pickRarity(r lootRand, rarities []lootRarity, weights []float64) (lootRarity, bool) {
	var sum float64
	for _, w := range weights {
		sum += w
	}
	if sum <= 0 {
		return lootRarity{}, false
	}
	x := r.Float64() * sum
	var picked lootRarity
	for i, w := range weights {
		if w <= 0 {
			continue
		}
		picked = rarities[i] // the last positive row absorbs float rounding
		if x < w {
			break
		}
		x -= w
	}
	return picked, true
}

func rarityByCode(rarities []lootRarity, code string) (lootRarity, bool) {
	for _, rar := range rarities {
		if rar.Code == code {
			return rar, true
		}
	}
	return lootRarity{}, false
}

// rolledName names a rolled item; consumables keep their base name and rings
// take the armor prefixes. FS-4R9M9 §Requirements 14, 15.
func rolledName(r lootRand, base types.ItemConfig, step int) string {
	switch base.ItemType {
	case types.ItemTypeWeapon:
		return affixName(r, weaponPrefixes, base.Name, step)
	case types.ItemTypeArmor, types.ItemTypeRing:
		return affixName(r, armorPrefixes, base.Name, step)
	}
	return base.Name
}

// normal: base; uncommon: prefix base; rare: + suffix; runed: + grand suffix
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
