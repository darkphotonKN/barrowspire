package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// Blood price's numbers. Charter defaults and decided (FS-E1ZDG §D R14, R16,
// R18).
const (
	// bloodPriceMaxHealth is the share of the class body's max HP a Berserker
	// keeps.
	bloodPriceMaxHealth = 0.67
	// bloodPriceAttackSpeedPercent counts after worn attack speed's cap.
	bloodPriceAttackSpeedPercent = 25
	// bloodPriceDamage multiplies the raw damage of the Berserker's own hits.
	bloodPriceDamage = 1.10
	// bloodPriceHealShare is the share of max HP a slash that hits heals.
	bloodPriceHealShare = 0.015
)

// BloodPricedMaxHealth is a Berserker's class body max HP for a class body
// (class base plus level growth) of classBody: round(0.67 × classBody)
// (FS-E1ZDG §D R14–15).
func BloodPricedMaxHealth(classBody int) int {
	return whole(bloodPriceMaxHealth * float64(classBody))
}

// withBloodPrice is the Berserker's part of the passive bonus, for a body
// whose class body max HP is ownMaxHealth: the max HP the price takes off it,
// which gear and the tree add on top of unscaled, and the attack speed past
// the cap. Any other specialization, or none, adds nothing.
func withBloodPrice(bonus *components.PassiveBonusComponent, spec string, ownMaxHealth int) {
	if spec != passivetree.Berserker {
		return
	}
	bonus.MaxHealthTaken = ownMaxHealth - BloodPricedMaxHealth(ownMaxHealth)
	bonus.AttackSpeedPastCapPercent = bloodPriceAttackSpeedPercent
}

// bloodPricedDamage is what the attacker's own hits multiply their coefficient
// by, so their raw damage, before crit and mitigation: bloodPriceDamage for a
// Berserker, 1 for anything else (FS-E1ZDG §D R16). It is read into the
// snapshot of an attack-table cast only, so a worn unique's hit (a reflect, a
// burning trail) is never raised.
func bloodPricedDamage(attacker *ecs.Entity) float64 {
	if Specialization(attacker) != passivetree.Berserker {
		return 1
	}
	return bloodPriceDamage
}

// bloodHeal is the Berserker's heal (FS-E1ZDG §D R18): a slash of theirs that
// landed on at least one target, a monster or not, heals max(1, round(1.5% ×
// max HP)), never above max, once however many it hit. A slash that hit
// nothing, and any other cast, heals nothing.
func bloodHeal(caster *ecs.Entity, kind components.AttackKind, landed int) {
	if kind != components.AttackSlash || landed == 0 || Specialization(caster) != passivetree.Berserker {
		return
	}
	healShareAtLeast(caster, bloodPriceHealShare, 1)
}
