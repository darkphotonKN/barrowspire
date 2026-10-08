package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// GearBonusComponent is what a delver's worn gear adds this tick: the sum of the
// affixes of every item in the weapon, armor and ring slots, never the
// consumable slots. The GearSystem rewrites it every tick; the character's own
// stats are never touched by it. FS-4R9M9 §Requirements 39–40.
type GearBonusComponent struct {
	// Attributes, added to the character's own wherever they are read.
	Strength     int
	Agility      int
	Intelligence int
	// Vitality has no affix; unique effects (R37) raise it.
	Vitality int

	// FlatDamage is added to an attack's power, beside the weapon's attack_power.
	FlatDamage int
	// CritChance is in percentage points, added to the weapon's crit chance.
	CritChance int
	// AttackSpeedPercent and MoveSpeedPercent are the totals already capped.
	AttackSpeedPercent int
	MoveSpeedPercent   int

	// Defense and MagicResistance are added to mitigation, beside armor.
	Defense         int
	MagicResistance int

	// MaxHealth and MaxMana are this tick's bonus to the maxima. MaxHealth
	// includes the max HP of every point of Vitality, the character's own too.
	MaxHealth int
	MaxMana   int
	// AppliedMaxHealth and AppliedMaxMana are the bonus the maxima carry right
	// now, so the next change is applied as a delta and level-up growth, which
	// lands on the same maxima, is never lost.
	AppliedMaxHealth int
	AppliedMaxMana   int
}

func (g *GearBonusComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeGearBonus
}
