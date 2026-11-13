package game

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

/*
	The Spire's tiered roster: what a family, a variant and a tier are, and the
	functions that read the roster table in monster_tuning.go. Which family,
	role or look an archetype has is that table, never a check on the archetype.
	FS-C8VM7 §A R1-R9.
*/

// monsterRole is what a family is on a floor: its pool guarantees and the
// slots it fills (FS-C8VM7 §A R2).
type monsterRole string

const (
	roleFodder monsterRole = "fodder"
	roleBrute  monsterRole = "brute"
	roleRanged monsterRole = "ranged"
)

// monsterFamily groups the variants that share a body and a role, step 0
// first: every step's sheet is built from step 0's by the step rule.
type monsterFamily struct {
	Name string
	Role monsterRole
	// PoolWeight is what each variant weighs in a floor pool's draw; 0 is 1
	// (FS-C8VM7 §C R20)
	PoolWeight int
	// Capped families are held to DarkWarriorCapMax a floor (FS-C8VM7 §C R24)
	Capped   bool
	Variants []monsterVariant
}

// monsterVariant is one named step of a family. Its sheet is keyed by
// Archetype; a step past 0 takes Name on the sheet the step rule builds.
type monsterVariant struct {
	Archetype components.MonsterArchetype
	Name      string
	// Unlock is the lowest tier whose floors may draw it
	Unlock int
	// ShieldLook is its blade + shield look's archetype, empty for a variant
	// with one look (FS-C8VM7 §A R8)
	ShieldLook components.MonsterArchetype
	// Ability is its monster ability, both looks' (FS-C8VM7 §B R11); zero for
	// none. It is the variant's own: the step rule never carries it up.
	Ability components.MonsterAbility
}

// rosterEntry is where an archetype stands on the roster: its family, its
// step and its variant. Both looks of a goblin variant have the same entry.
type rosterEntry struct {
	Family  *monsterFamily
	Step    int
	Variant monsterVariant
}

// tierOf is the tier a base level falls in: five levels a tier, the last
// open-ended (FS-C8VM7 §A R1).
func tierOf(baseLevel int) int {
	return min((max(baseLevel, 1)-1)/TierLevelSpan+1, MaxTier)
}

// variantOf is the roster's entry for an archetype, either look of a goblin;
// false for a boss or a field creature.
func variantOf(archetype components.MonsterArchetype) (rosterEntry, bool) {
	entry, ok := rosterIndex[archetype]
	return entry, ok
}

// rollLook is the archetype a spawn of this variant takes: its shield look at
// GoblinShieldShare when it has one, else itself (FS-C8VM7 §A R8).
func (v monsterVariant) rollLook(rng populationRand) components.MonsterArchetype {
	if v.ShieldLook != "" && rng.Float64() < GoblinShieldShare {
		return v.ShieldLook
	}
	return v.Archetype
}

// rosterIndex is every roster archetype's entry, shield looks included.
var rosterIndex = indexRoster(spireRoster)

func indexRoster(roster []monsterFamily) map[components.MonsterArchetype]rosterEntry {
	index := map[components.MonsterArchetype]rosterEntry{}
	for i := range roster {
		family := &roster[i]
		for step, v := range family.Variants {
			entry := rosterEntry{Family: family, Step: step, Variant: v}
			index[v.Archetype] = entry
			if v.ShieldLook != "" {
				index[v.ShieldLook] = entry
			}
		}
	}
	return index
}

// The roster's sheets past each family's step 0, and its shield looks with
// their experience and drop rows, are built from the table once, at start.
func init() {
	for _, family := range spireRoster {
		addVariantSheets(family)
	}
}

/**
* addVariantSheets builds each step's sheet from the one below by the step rule
* (stepUp) and gives each step its variant's ability, then gives each shield look its blade look's sheet with
* GoblinShieldDefense more defence, and the blade look's experience and drop
* rows (FS-C8VM7 §A R5, R8; §E R32-R33).
**/
func addVariantSheets(family monsterFamily) {
	base := monsterSheets[family.Variants[0].Archetype]
	below := base
	for step, v := range family.Variants {
		if step > 0 {
			below = stepUp(base, below, step, v.Name)
		}
		// set after the step rule, which would carry step 0's up the family
		below.Ability = v.Ability
		monsterSheets[v.Archetype] = below
		if v.ShieldLook == "" {
			continue
		}
		shield := below
		shield.Defense += GoblinShieldDefense
		monsterSheets[v.ShieldLook] = shield
		killExperienceBase[v.ShieldLook] = killExperienceBase[v.Archetype]
		MonsterDrops[v.ShieldLook] = MonsterDrops[v.Archetype]
	}
}

/**
* stepUp is step k of a family at level 1: HP, damage, defence and magic
* resistance are step 0's times their growth to the k, each rounded half up,
* defence at least the step below's + 1; move speed gains VariantStepSpeedGain
* a step. Everything else, timings, radii and shot, is step 0's.
* FS-C8VM7 §A R5.
**/
func stepUp(base, below monsterSheet, k int, name string) monsterSheet {
	grow := func(v int, growth float64) int {
		// the epsilon keeps a product that should land on .5 from rounding down
		return int(math.Floor(float64(v)*math.Pow(growth, float64(k)) + 0.5 + 1e-9))
	}

	sheet := base
	sheet.Name = name
	sheet.HP = grow(base.HP, VariantStepHPGrowth)
	sheet.Damage = grow(base.Damage, VariantStepDamageGrowth)
	sheet.Defense = max(grow(base.Defense, VariantStepMitigationGrowth), below.Defense+1)
	sheet.MagicResistance = grow(base.MagicResistance, VariantStepMitigationGrowth)
	sheet.MoveSpeed = base.MoveSpeed + VariantStepSpeedGain*float64(k)
	return sheet
}
