package game

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

/*
	Loot tuning: every number the loot roll uses, in one place, so a playtest
	can retune growth without touching logic. FS-4R9M9 §Requirements 13,
	16–18, 21, 23, 64. Balance direction: no loot explosion, slow stat growth —
	a flat curve, narrow affix tiers.

	The base rarity weights are NOT here: they stay in item_rarities
	(drop_rate_multiplier, retuned by UPDATE) and reach the roll as data.
	Base tiers are catalogue data too: each template carries its own
	min_item_level and required_level (FS-4R9M9 §Requirements 1).
*/

// LootTier is one rung of the I / II / III ladder an affix tier sits on: the
// lowest item level it can roll at and the character level it then requires.
// It is the same ladder the catalogue's base tiers use. FS-4R9M9 §Requirements 1, 16, 23.
type LootTier struct {
	MinItemLevel  int
	RequiredLevel int
}

// LootTiers is indexed by tier − 1.
var LootTiers = []LootTier{
	{MinItemLevel: 1, RequiredLevel: 1},   // I
	{MinItemLevel: 8, RequiredLevel: 6},   // II
	{MinItemLevel: 15, RequiredLevel: 13}, // III
}

// RarityRoll is what a rarity does to a rolled item: the multiplier on its
// integer base stats and how many affixes it takes, uniform in
// [AffixMin, AffixMax]. FS-4R9M9 §Requirements 13, 18.
type RarityRoll struct {
	StatMultiplier float64
	AffixMin       int
	AffixMax       int
}

// RarityRolls is keyed by item_rarities.rarity_code. Fabled has no entry: a
// Fabled result is a unique, or a Runed item when none is eligible (R25–27).
var RarityRolls = map[string]RarityRoll{
	rarityNormal:   {StatMultiplier: 1.00, AffixMin: 0, AffixMax: 0},
	rarityUncommon: {StatMultiplier: 1.05, AffixMin: 1, AffixMax: 1},
	rarityRare:     {StatMultiplier: 1.10, AffixMin: 2, AffixMax: 2},
	rarityRuned:    {StatMultiplier: 1.15, AffixMin: 3, AffixMax: 4},
}

// Base stat roll. FS-4R9M9 §Requirements 13.
const (
	// integer stats roll base × uniform(LootStatSpreadMin, LootStatSpreadMax) × rarity multiplier
	LootStatSpreadMin = 0.8
	LootStatSpreadMax = 1.2

	// critical_rate rolls base ± spread, clamped to [0, cap]; no per-tier step
	LootCritSpread = 0.02
	LootCritCap    = 0.50
)

// Rarity weight modifiers, applied in this order. FS-4R9M9 §Requirements 21.
const (
	// Rare, Runed and Fabled weights × (1 + item level / divisor)
	RarityItemLevelDivisor = 40.0
	// an elite drop multiplies every weight above Normal
	EliteRarityWeightMultiplier = 2.0
	// a demon drop multiplies every weight above Normal and zeroes Normal's
	DemonRarityWeightMultiplier = 4.0
)

// Caps on summed affix percentages, enforced where gear bonuses are applied.
// FS-4R9M9 §Requirements 17.
const (
	AttackSpeedCapPercent = 50
	MoveSpeedCapPercent   = 30
)

// GearCaps hands those caps to the GearSystem.
var GearCaps = systems.GearCaps{AttackSpeedPercent: AttackSpeedCapPercent, MoveSpeedPercent: MoveSpeedCapPercent}

// HealthPerVitality is the max HP each point of Vitality adds: the class's own,
// its level growth and its gear's alike. It never heals. (user decision 2026-10-09)
const HealthPerVitality = 5

// Attributes hands the GearSystem what an attribute point is worth.
var Attributes = systems.AttributeTuning{HealthPerVitality: HealthPerVitality}

// The unique effects' numbers. FS-4R9M9 §Requirements 32–36.
const (
	// kill_frenzy (Wightfang): each kill is a stack of +15% attack speed, up to
	// 3, all expiring 4 s after the latest kill.
	FrenzyAttackSpeedPercent = 15
	FrenzyMaxStacks          = 3
	FrenzyDurationSeconds    = 4.0
	// kill_heal (The Hollow Crown): a kill restores 4% of max health, at least 1.
	KillHealPercent = 4
	// melee_reflect (Gravewarden's Oath): 20% of a monster's strike, at least 1,
	// back at the striker, unmitigated.
	MeleeReflectPercent = 20
	// pierce (Lantern of the Drowned): one more distinct target per projectile.
	PierceExtraTargets = 1
	// burning_dash (Ashwalk Greaves): the dashed path burns for 3 s, hitting
	// every monster within 30 px of it every 0.5 s at power 4 + wearer level.
	BurningTrailSeconds      = 3.0
	BurningTrailPulseSeconds = 0.5
	BurningTrailHalfWidth    = 30.0
	BurningTrailBasePower    = 4
)

// UniqueEffects hands the GearSystem and the CombatSystem the effects' numbers.
var UniqueEffects = systems.UniqueEffectTuning{
	FrenzyAttackSpeedPercent: FrenzyAttackSpeedPercent,
	ReflectPercent:           MeleeReflectPercent,
	PierceExtraTargets:       PierceExtraTargets,
	BurningTrail: systems.BurningTrailTuning{
		Seconds:      BurningTrailSeconds,
		PulseSeconds: BurningTrailPulseSeconds,
		HalfWidth:    BurningTrailHalfWidth,
		BasePower:    BurningTrailBasePower,
	},
}

// AffixBand is one tier's inclusive value range.
type AffixBand struct {
	Min int
	Max int
}

// AffixRule is one row of the affix table: a stat, its band per tier (indexed
// by tier − 1, matching LootTiers) and what it rolls on — item types, or armor
// slots for armor. FS-4R9M9 §Requirements 17.
type AffixRule struct {
	Stat  string
	Bands []AffixBand
	On    []string
}

var (
	onAttributes = []string{string(types.ItemTypeWeapon), string(types.ItemTypeArmor), string(types.ItemTypeRing)}
	onDefensive  = []string{string(types.ItemTypeArmor), string(types.ItemTypeRing)}
	onOffensive  = []string{string(types.ItemTypeWeapon), string(types.ArmorSlotGloves), string(types.ItemTypeRing)}

	attributeBands = []AffixBand{{1, 2}, {3, 4}, {5, 6}}
	poolBands      = []AffixBand{{4, 7}, {8, 12}, {13, 18}}
	percentBands   = []AffixBand{{2, 3}, {4, 5}, {6, 7}}
	stepBands      = []AffixBand{{1, 1}, {2, 2}, {3, 3}}
)

// AffixTable is the affix table. Values are integers: % affixes are whole
// percent, crit is percentage points.
var AffixTable = []AffixRule{
	{Stat: types.AffixStrength, Bands: attributeBands, On: onAttributes},
	{Stat: types.AffixAgility, Bands: attributeBands, On: onAttributes},
	{Stat: types.AffixIntelligence, Bands: attributeBands, On: onAttributes},
	{Stat: types.AffixMaxHealth, Bands: poolBands, On: onDefensive},
	{Stat: types.AffixMaxMana, Bands: poolBands, On: onDefensive},
	{Stat: types.AffixAttackSpeed, Bands: percentBands, On: onOffensive},
	{Stat: types.AffixMoveSpeed, Bands: percentBands, On: []string{string(types.ArmorSlotLegs), string(types.ItemTypeRing)}},
	{Stat: types.AffixCritChance, Bands: stepBands, On: []string{string(types.ItemTypeWeapon), string(types.ArmorSlotHead), string(types.ArmorSlotGloves), string(types.ItemTypeRing)}},
	{Stat: types.AffixFlatDamage, Bands: stepBands, On: onOffensive},
	{Stat: types.AffixDefense, Bands: attributeBands, On: onDefensive},
	{Stat: types.AffixMagicResistance, Bands: attributeBands, On: onDefensive},
}

// MonsterDrop is one row of the monster drop table: the chance a kill drops
// at all, how many items it then drops (uniform in [MinItems, MaxItems]), the
// rarity bias they roll with and the weighted item type of each.
// FS-4R9M9 §Requirements 44.
type MonsterDrop struct {
	Chance             float64
	MinItems, MaxItems int
	Source             lootSource
	TypeSplit          []ItemTypeWeight
}

// ItemTypeWeight is one item type's share of a drop's type split.
type ItemTypeWeight struct {
	ItemType types.ItemType
	Weight   int
}

var (
	// weapon / armor / ring / consumable 30 / 40 / 10 / 20
	standardDropSplit = []ItemTypeWeight{
		{types.ItemTypeWeapon, 30}, {types.ItemTypeArmor, 40}, {types.ItemTypeRing, 10}, {types.ItemTypeConsumable, 20},
	}
	// weapon / armor / ring 35 / 45 / 20, never a consumable
	demonDropSplit = []ItemTypeWeight{
		{types.ItemTypeWeapon, 35}, {types.ItemTypeArmor, 45}, {types.ItemTypeRing, 20},
	}
)

// MonsterDrops is the drop table by archetype. A new archetype adds a row; one
// without a row drops nothing.
var MonsterDrops = map[components.MonsterArchetype]MonsterDrop{
	components.MonsterArchetypeGhoul: {Chance: 0.08, MinItems: 1, MaxItems: 1, Source: lootSourceStandard, TypeSplit: standardDropSplit},
	components.MonsterArchetypeTroll: {Chance: 0.15, MinItems: 1, MaxItems: 1, Source: lootSourceStandard, TypeSplit: standardDropSplit},
	components.MonsterArchetypeDemon: BossMonsterDrop,
}

// EliteMonsterDrop is any elite's row, whatever its archetype.
var EliteMonsterDrop = MonsterDrop{Chance: 0.50, MinItems: 1, MaxItems: 1, Source: lootSourceElite, TypeSplit: standardDropSplit}

// BossMonsterDrop is the demon's row: always 2 or 3 items.
var BossMonsterDrop = MonsterDrop{Chance: 1, MinItems: 2, MaxItems: 3, Source: lootSourceDemon, TypeSplit: demonDropSplit}
