package systems

import (
	"bytes"
	"math"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// Split Shot's numbers. Charter defaults (FS-E1ZDG §G R25–26).
const (
	// splitReach is how far from the struck monster's centre, in px, the split
	// arrow's mark may stand.
	splitReach = 220.0
	// splitShare is the split arrow's share of the arrow's raw damage.
	splitShare = 0.6
)

// split is the Hunter's Split Shot (FS-E1ZDG §G R25–28): a left-click arrow
// of theirs that crit a monster, a killing crit included, fires one split
// arrow from where the struck monster stands straight at where the nearest
// other living monster within splitReach of it stands now. The split arrow
// is an ordinary arrow, at the row's speed and max flight: the arrow's
// snapshot at splitShare of its coefficient, its own crit roll still to come,
// no pierce, marked never to split, and the struck monster already hit so it
// never lands there. Each impact of a piercing arrow that crits splits on its
// own. Shadow Shot never splits. The caster is read at the hit, as the
// kickers are: one gone from the world fires nothing.
func (s *CombatSystem) split(attack components.AttackSnapshot, struck *ecs.Entity, crit bool) {
	if !crit || attack.Kind != components.AttackArrow || attack.Split || !struck.HasComponent(ecs.ComponentTypeEnemy) {
		return
	}
	caster, ok := s.em.GetEntity(attack.AttackerEntityID)
	if !ok || Specialization(caster) != passivetree.Hunter {
		return
	}
	tc, ok := struck.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return
	}
	from := tc.(*components.TransformComponent)
	markX, markY, ok := s.nearestMonster(from, struck)
	if !ok {
		return
	}

	splitArrow := attack
	splitArrow.Coefficient *= splitShare
	splitArrow.Pierce = 0
	splitArrow.Split = true

	p := attackTable[components.AttackArrow].projectile
	angle := math.Atan2(markY-from.Y, markX-from.X)
	shot := s.em.CreateEntity()
	shot.AddComponent(components.NewTransformComponent(from.X, from.Y))
	shot.AddComponent(components.NewVelocityComponent(math.Cos(angle)*p.speed, math.Sin(angle)*p.speed, p.speed))
	projectile := components.NewProjectileComponent(splitArrow, p.speed, p.maxDistance, p.radius, p.kind)
	projectile.HitEntityIDs = []uuid.UUID{struck.ID}
	shot.AddComponent(projectile)
}

// nearestMonster is where the living monster other than struck nearest to
// from stands, within splitReach; a tie goes to the lower entity id, so the
// pick never rides on the world's iteration order. False when none is.
func (s *CombatSystem) nearestMonster(from *components.TransformComponent, struck *ecs.Entity) (x, y float64, ok bool) {
	var nearest *ecs.Entity
	best := splitReach
	for _, monster := range s.monstersBut(struck) {
		if !alive(monster) {
			continue
		}
		tc, has := monster.GetComponent(ecs.ComponentTypeTransform)
		if !has {
			continue
		}
		at := tc.(*components.TransformComponent)
		dist := math.Hypot(at.X-from.X, at.Y-from.Y)
		if dist > best || (dist == best && nearest != nil && bytes.Compare(monster.ID[:], nearest.ID[:]) > 0) {
			continue
		}
		nearest, best, x, y = monster, dist, at.X, at.Y
	}
	return x, y, nearest != nil
}
