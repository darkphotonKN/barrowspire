package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
	The passive tree's kickers in combat. FS-8RZ51 §F R29.

	A kicker's per-rank stat and its rank-3 rule both read the body's
	PassiveBonusComponent, which sumPassives built from the ranks it holds: the
	stats change the attack row as a cast resolves (withPassives), the rules
	hook the CombatSystem where their event happens (a cast resolved, a hit
	landing, a kill, a charge ending). No rule reads the ranks itself. The
	rules' numbers are here; the tree names only the rule.

	A refund is a gain of the class resource capped at its max, to a body in
	play. A forced crit is that one hit rolled at 100% crit chance.
*/

// Kicker numbers. Charter defaults (R29).
const (
	// Heavy Hand: a slash hitting multiHitSlashTargets or more monsters
	// refunds multiHitSlashRefund stamina.
	multiHitSlashTargets = 2
	multiHitSlashRefund  = 5
	// Thick Skin: below half max HP, damage taken is lowHPDamageReduction less.
	lowHPDamageReduction = 0.10
	// Long Wind: a kill refunds killStaminaRefund stamina.
	killStaminaRefund = 15
	// Bull Rush: the first hit after a charge ends, within postDashCritWindow,
	// is a forced crit.
	postDashCritWindow = 3.0 // seconds
	// Kindling: a left-click fireball's crit refunds fireballCritRefund mana.
	fireballCritRefund = 5
	// Deep Well: mana regen deepWellRegenPercent more, of the class's base.
	deepWellRegenPercent = 25.0
	// Searing: fireballs pierce searingPierce more monsters.
	searingPierce = 1
	// postDashCritEpsilon absorbs the float drift of summing tick lengths.
	postDashCritEpsilon = 1e-9
)

// holdsKicker reports whether the body holds the kicker rule: its node at R3.
func holdsKicker(entity *ecs.Entity, kicker passivetree.Kicker) bool {
	return passiveBonus(entity).Kickers[kicker]
}

// withPassives is the attack row as the caster's passive bonus changes it: a
// coefficient a percent higher, a cost lowered (never below 0), projectiles
// faster, and at R3 Wide Volley's two more fireballs and Searing's pierce.
// The row itself is never written.
func withPassives(spec attackSpec, bonus components.PassiveBonusComponent) attackSpec {
	kind := spec.kind
	spec.coefficient *= 1 + bonus.CoefficientPercent[kind]/100
	spec.cost = max(spec.cost+bonus.CostChange[kind], 0)
	spec.projectile.speed *= 1 + bonus.ProjectileSpeedPercent[kind]/100

	if kind == components.AttackTripleFireball && bonus.Kickers[passivetree.KickerFiveFireballVolley] {
		spec.projectile.spread = widenSpread(spec.projectile.spread)
	}
	if isFireball(kind) && bonus.Kickers[passivetree.KickerFireballExtraPierce] {
		spec.pierce += searingPierce
	}
	return spec
}

// widenSpread is a spread one more step either side, the step being its outer
// gap: -0.26, 0, 0.26 becomes -0.52 … 0.52. A spread of one is left as it is.
func widenSpread(spread []float64) []float64 {
	n := len(spread)
	if n < 2 {
		return spread
	}
	left, right := spread[0]-(spread[1]-spread[0]), spread[n-1]+(spread[n-1]-spread[n-2])
	out := make([]float64, 0, n+2)
	out = append(out, left)
	out = append(out, spread...)
	return append(out, right)
}

func isFireball(kind components.AttackKind) bool {
	return kind == components.AttackFireball || kind == components.AttackTripleFireball
}

// CastCost is what one cast of kind costs this delver's class resource as it
// resolves, their passives' cost changes taken in: what the wire prices their
// ability at. FS-8AY7S §Requirements 17; FS-8RZ51 R29.
func CastCost(entity *ecs.Entity, kind components.AttackKind) int {
	spec, ok := attackTable[kind]
	if !ok {
		return 0
	}
	spec.kind = kind
	return withPassives(spec, passiveBonus(entity)).cost
}

// refund gains the body amount of its class resource, capped at its max. A
// body out of play gains nothing.
func refund(entity *ecs.Entity, amount int) {
	if !InPlay(entity) {
		return
	}
	if rc, ok := entity.GetComponent(ecs.ComponentTypeResource); ok {
		pool := rc.(*components.ResourceComponent)
		pool.Current = min(pool.Current+amount, pool.Max)
	}
}

// kickAfterCast runs the rules on a resolved cast of kind that hit
// monstersHit monsters: Heavy Hand's multi-hit refund.
func kickAfterCast(caster *ecs.Entity, kind components.AttackKind, monstersHit int) {
	if kind == components.AttackSlash && monstersHit >= multiHitSlashTargets && holdsKicker(caster, passivetree.KickerMultiHitSlashRefund) {
		refund(caster, multiHitSlashRefund)
	}
}

// damageTaken is what a hit of damage takes from the target: Thick Skin's
// share less while it is below half its max HP, before the hit lands.
func damageTaken(target *ecs.Entity, health *components.HealthComponent, damage int) int {
	if health.CurrentHealth*2 >= health.MaxHealth || !holdsKicker(target, passivetree.KickerLowHPDamageReduction) {
		return damage
	}
	return ReducedDamage(damage, lowHPDamageReduction)
}

// kickAfterHit runs the rules on a landed hit of attack for its attacker, a
// crit or a kill as it was: Long Wind's kill refund and Kindling's crit
// refund. A hit whose attacker is gone runs nothing.
func (s *CombatSystem) kickAfterHit(attack components.AttackSnapshot, crit, kill bool) {
	if !kill && !crit {
		return
	}
	attacker, ok := s.em.GetEntity(attack.AttackerEntityID)
	if !ok {
		return
	}
	if kill && holdsKicker(attacker, passivetree.KickerKillStaminaRefund) {
		refund(attacker, killStaminaRefund)
	}
	if crit && attack.Kind == components.AttackFireball && holdsKicker(attacker, passivetree.KickerFireballCritRefund) {
		refund(attacker, fireballCritRefund)
	}
}

// markDashEnded lays Bull Rush's mark on a body holding its rule whose charge
// has just ended, or lays it afresh.
func markDashEnded(entity *ecs.Entity) {
	if holdsKicker(entity, passivetree.KickerPostDashForcedCrit) {
		entity.AddComponent(&components.DashEndedComponent{Remaining: postDashCritWindow})
	}
}

// tickDashEnded runs Bull Rush's mark down by a tick, and lifts it once its
// window is over.
func tickDashEnded(entity *ecs.Entity, deltaTime float64) {
	dc, ok := entity.GetComponent(ecs.ComponentTypeDashEnded)
	if !ok {
		return
	}
	mark := dc.(*components.DashEndedComponent)
	mark.Remaining -= deltaTime
	if mark.Remaining <= postDashCritEpsilon {
		entity.RemoveComponent(ecs.ComponentTypeDashEnded)
	}
}

// forcedCrit reports whether this hit is a forced crit, taking the mark that
// made it one: the first hit after a Bull Rush charge ended. Only a hit that
// can crit takes the mark, never a burning trail's pulse or a reflected
// strike.
func (s *CombatSystem) forcedCrit(attack components.AttackSnapshot) bool {
	if attack.CritChance <= 0 || attack.TrueDamage > 0 {
		return false
	}
	attacker, ok := s.em.GetEntity(attack.AttackerEntityID)
	if !ok || !attacker.HasComponent(ecs.ComponentTypeDashEnded) {
		return false
	}
	attacker.RemoveComponent(ecs.ComponentTypeDashEnded)
	return true
}
