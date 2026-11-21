package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// shadowShotRefund is the stamina a Shadow Ranger's Shadow Shot refunds per
// monster it hits. Charter default (FS-E1ZDG §H R30).
const shadowShotRefund = 8

// shadowRangersShadowShot reports whether a cast of kind by caster is a
// Shadow Ranger's Shadow Shot (FS-E1ZDG §H R29–31): it pierces every target
// in its line, set on its snapshot as it is cast, and refunds stamina per
// monster it hits. It still hits each target once and stops at a wall, a
// closed door or its max flight; its cost, cooldown, damage and hold stay
// the row's.
func shadowRangersShadowShot(caster *ecs.Entity, kind components.AttackKind) bool {
	return kind == components.AttackShadowShot && Specialization(caster) == passivetree.ShadowRanger
}

// shadowRefund is the Shadow Ranger's refund (FS-E1ZDG §H R30): each monster
// their Shadow Shot hits refunds shadowShotRefund stamina on that tick,
// capped at max. A delver or a dummy it hits refunds nothing. The caster is
// read at the hit, as the kickers are: one gone from the world, or out of
// play, gets nothing back.
func (s *CombatSystem) shadowRefund(attack components.AttackSnapshot, struck *ecs.Entity) {
	if !struck.HasComponent(ecs.ComponentTypeEnemy) {
		return
	}
	caster, ok := s.em.GetEntity(attack.AttackerEntityID)
	if ok && shadowRangersShadowShot(caster, attack.Kind) {
		refund(caster, shadowShotRefund)
	}
}
