package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// Combustion's numbers. Charter defaults (FS-E1ZDG §F R23).
const (
	// combustionReach is how far from the struck monster's centre, in px, a
	// monster's centre may be and still take the explosion.
	combustionReach = 60.0
	// combustionShare is the explosion's share of the crit's damage.
	combustionShare = 0.5
)

// combust is the Pyromancer's Combustion (FS-E1ZDG §F R22–24): a fireball hit
// of theirs that crit a monster for damage, read before its health was
// clamped, so a killing crit explodes too, hits every other monster within
// combustionReach of it for max(1, round(combustionShare × damage)). The
// explosion is the Pyromancer's hit, unmitigated, never a crit, and of no row,
// so it never explodes in turn; a kill it makes is theirs. Delvers and
// destructibles are never hit by it, and a crit on a delver never explodes.
// The caster is read at the hit, as the kickers are: one gone from the world
// sets nothing off.
func (s *CombatSystem) combust(attack components.AttackSnapshot, struck *ecs.Entity, damage int, crit bool) {
	if !crit || !isFireball(attack.Kind) || !struck.HasComponent(ecs.ComponentTypeEnemy) {
		return
	}
	caster, ok := s.em.GetEntity(attack.AttackerEntityID)
	if !ok || Specialization(caster) != passivetree.Pyromancer {
		return
	}
	tc, ok := struck.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return
	}
	at := tc.(*components.TransformComponent)

	explosion := components.AttackSnapshot{
		AttackerEntityID: attack.AttackerEntityID,
		AttackerMemberID: attack.AttackerMemberID,
		DamageType:       components.DamageMagic,
		TrueDamage:       max(1, whole(float64(damage)*combustionShare)),
	}
	s.hitAround(explosion, at.X, at.Y, combustionReach, s.monstersBut(struck), allRound)
}

// monstersBut is every monster in the world other than the one given.
func (s *CombatSystem) monstersBut(struck *ecs.Entity) []*ecs.Entity {
	var others []*ecs.Entity
	for _, entity := range s.em.GetAllEntities() {
		if entity.ID != struck.ID && entity.HasComponent(ecs.ComponentTypeEnemy) {
			others = append(others, entity)
		}
	}
	return others
}
