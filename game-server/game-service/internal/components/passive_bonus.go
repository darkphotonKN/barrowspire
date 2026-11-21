package components

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// PassiveBonusComponent is what the body's held passive ranks add (FS-8RZ51
// R25): built at seating and again by a spend in town, held apart from the
// character's own stats like worn gear, never written into them. Percentages
// of max HP are already whole points here, of OwnMaxHealth (R26).
type PassiveBonusComponent struct {
	// Attributes, summed with worn ones wherever gear's are read.
	Strength     int
	Agility      int
	Intelligence int

	// AttackSpeedPercent and MoveSpeedPercent count inside gear's caps (R25).
	AttackSpeedPercent int
	MoveSpeedPercent   int
	// AttackSpeedPastCapPercent counts after gear's cap: the Berserker's
	// (FS-E1ZDG §D R16).
	AttackSpeedPastCapPercent int
	// CritPoints are whole crit points, summed with gear's (R29).
	CritPoints int
	// ParryWindowSeconds lengthens the parry stance's window (R29).
	ParryWindowSeconds float64

	// MaxHealth and MaxResource are the bonus to the maxima, MaxResource to the
	// class resource the tree names (stamina or mana).
	MaxHealth   int
	MaxResource int
	// MaxHealthTaken is what the specialization takes off the class body's
	// max HP (OwnMaxHealth): the Berserker's blood price, 0 for any other
	// (FS-E1ZDG §D R14).
	MaxHealthTaken int
	// RegenPercent is a percent of the class resource's base regen.
	RegenPercent float64

	// The kickers' per-rank stats, by the attack row they change (R29): a
	// percent more on its coefficient, a change to its cost, a percent more on
	// its projectiles' flight speed, a percent more on its cooldown. Nil when
	// no held node changes any.
	CoefficientPercent     map[AttackKind]float64
	CostChange             map[AttackKind]int
	ProjectileSpeedPercent map[AttackKind]float64
	CooldownPercent        map[AttackKind]float64
	// Kickers is every kicker rule the body holds: its node at rank 3. The
	// rules' numbers are the systems' that run them.
	Kickers map[passivetree.Kicker]bool

	// OwnMaxHealth is the basis of a percent of max HP: own max HP (class base
	// plus level growth, no gear) when the body was seated (R26).
	OwnMaxHealth int
	// AppliedMaxHealth and AppliedMaxResource are the bonus the maxima carry
	// right now, so a recompute moves them by the change.
	AppliedMaxHealth   int
	AppliedMaxResource int
}

func (p *PassiveBonusComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypePassiveBonus
}
