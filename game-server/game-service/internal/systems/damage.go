package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

/*
	The damage formula. Pure math, no entities: the CombatSystem gathers the inputs
	and is the only caller. FS-77AB6 §Requirements 3–5. Every number is a starting
	value, expected to move in play.
*/

const (
	BaseCritChance = 0.05
	CritChanceCap  = 0.50
	CritMultiplier = 1.5

	// a scaling stat of statScalingDivisor doubles the raw hit
	statScalingDivisor = 20.0
	// final = raw × mitigationBase / (mitigationBase + mitigationWeight × M)
	mitigationBase   = 100.0
	mitigationWeight = 2.0

	minimumDamage = 1
)

// Mitigation is what a target brings against a hit.
type Mitigation struct {
	Defense         int // mitigates physical hits
	MagicResistance int // mitigates magic hits
}

// RawDamage is a hit before crit and mitigation.
func RawDamage(power, coefficient float64, scalingStat int) float64 {
	return power * coefficient * (1 + float64(scalingStat)/statScalingDivisor)
}

// CritChance is the base chance plus the equipped weapon's critical_rate, capped.
func CritChance(weaponCritRate float64) float64 {
	return math.Min(BaseCritChance+weaponCritRate, CritChanceCap)
}

// ResolveDamage turns an attack into the health a target loses. roll is a uniform
// draw in [0, 1): the hit crits when it falls under the attack's crit chance.
func ResolveDamage(attack components.AttackSnapshot, target Mitigation, roll float64) (damage int, crit bool) {
	raw := RawDamage(attack.Power, attack.Coefficient, attack.ScalingStat)

	crit = roll < attack.CritChance
	if crit {
		raw *= CritMultiplier
	}

	rating := target.Defense
	if attack.DamageType == components.DamageMagic {
		rating = target.MagicResistance
	}
	rating = max(rating, 0)

	final := int(math.Round(raw * mitigationBase / (mitigationBase + mitigationWeight*float64(rating))))

	return max(final, minimumDamage), crit
}
