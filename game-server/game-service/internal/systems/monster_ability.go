package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
	Monster abilities: a monster's one special move, sheet data copied onto it
	at spawn. The MonsterAISystem chooses one in place of a swing and winds it
	up, its area or cone fixed where it will land; the CombatSystem lands it on
	delvers only, at the monster's level damage × the ability's multiplier.
	FS-C8VM7 §B R10-R14.
*/

// abilityReady reports whether a hunting monster uses its ability now, in
// place of starting its next swing: it has one, cooled, its attack interval
// has elapsed, and its target stands inside the ability's distances (and, for
// a shot, in sight by the shot sight test). FS-C8VM7 §B R12.
func (s *MonsterAISystem) abilityReady(monster *components.MonsterComponent, at *components.TransformComponent, target quarry) bool {
	ability := monster.Ability
	if ability.Kind == "" || monster.AbilityCooldown > 0 || monster.AttackCooldown > 0 {
		return false
	}
	d := distance(at, target.at)
	if d < ability.MinRange || d > ability.MaxRange {
		return false
	}
	if ability.Shape == components.AbilityShots && s.grid != nil {
		return s.grid.Clear(at.X, at.Y, target.at.X, target.at.Y, ability.ShotRadius)
	}
	return true
}

// startAbility stands a monster, faces its target and winds its ability up,
// fixed where it stands and the way it faces now. Its cooldown starts here,
// and the ability takes the swing's place in the attack interval. FS-C8VM7 §B
// R12, R13.
func startAbility(monster *components.MonsterComponent, at *components.TransformComponent, velocity *components.VelocityComponent, target quarry) {
	velocity.VX, velocity.VY = 0, 0
	face(monster, at, target.at)
	monster.AttackCooldown = monster.AttackInterval
	monster.AbilityCooldown = monster.Ability.Cooldown
	monster.AbilityPending = components.PendingAbility{
		Remaining: monster.Ability.WindUp,
		X:         at.X,
		Y:         at.Y,
		FacingX:   monster.FacingX,
		FacingY:   monster.FacingY,
	}
	monster.Action = components.MonsterActionAbility
}

// windUpAbility holds a monster still through its ability's wind-up and, when
// it ends, hands the ability to the CombatSystem. An area or cone lands where
// it was fixed, whoever is left to hit; a shot keeps turning to its target and
// leaves at where they stand at the end, and with no target is not loosed.
// FS-C8VM7 §B R13, §Edge States.
func windUpAbility(
	deltaTime float64,
	entity *ecs.Entity,
	monster *components.MonsterComponent,
	at *components.TransformComponent,
	velocity *components.VelocityComponent,
	target quarry,
	hunting bool,
) {
	velocity.VX, velocity.VY = 0, 0
	monster.Action = components.MonsterActionAbility
	shot := monster.Ability.Shape == components.AbilityShots
	if shot && hunting {
		face(monster, at, target.at)
	}

	pending := &monster.AbilityPending
	pending.Remaining -= deltaTime
	if pending.Remaining > 0 {
		return
	}
	fixed := *pending
	*pending = components.PendingAbility{}

	if !shot {
		strike(entity, components.AttackIntent{
			Kind:    components.AttackMonsterAbility,
			TargetX: fixed.X,
			TargetY: fixed.Y,
			FacingX: fixed.FacingX,
			FacingY: fixed.FacingY,
		})
		return
	}
	if hunting {
		strike(entity, components.AttackIntent{
			Kind:    components.AttackMonsterAbility,
			TargetX: target.at.X,
			TargetY: target.at.Y,
		})
	}
}

// landAbility lands a monster's ability as its wind-up ends: its area or cone
// on every delver in it, or its shots. Each hit is the monster's level damage
// (an elite's or champion's, as its Combat holds it) × the multiplier,
// physical, with the base crit, mitigated. FS-C8VM7 §B R14.
func (s *CombatSystem) landAbility(attacker *ecs.Entity, intent components.AttackIntent, entities []*ecs.Entity) {
	mc, ok := attacker.GetComponent(ecs.ComponentTypeEnemy)
	if !ok {
		return
	}
	ability := mc.(*components.MonsterComponent).Ability
	spec := attackSpec{damageType: components.DamagePhysical, scaling: scaleNone, coefficient: ability.Multiplier}

	switch ability.Shape {
	case components.AbilityAreaAroundSelf:
		s.abilityArea(attacker, intent.TargetX, intent.TargetY, ability.Radius, spec, entities)
	case components.AbilityCone:
		s.abilityCone(attacker, intent, ability, spec, entities)
	case components.AbilityShots:
		tc, ok := attacker.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			return
		}
		spec.projectile = abilityShots(ability)
		s.fire(attacker, tc.(*components.TransformComponent), intent.TargetX, intent.TargetY, spec)
	}
}

// abilityArea hits every delver whose body overlaps the circle.
func (s *CombatSystem) abilityArea(attacker *ecs.Entity, x, y, radius float64, spec attackSpec, entities []*ecs.Entity) {
	attack := s.snapshot(attacker, spec)
	for _, target := range delversHit(attack, entities, s.playerDamage) {
		to := target.at
		if math.Hypot(to.X-x, to.Y-y) <= radius+constants.PlayerRadius {
			s.applyHit(attack, target.entity)
		}
	}
}

// abilityCone hits every delver whose centre is within the cone's reach of its
// apex and within half its angle of its facing.
func (s *CombatSystem) abilityCone(attacker *ecs.Entity, intent components.AttackIntent, ability components.MonsterAbility, spec attackSpec, entities []*ecs.Entity) {
	attack := s.snapshot(attacker, spec)
	facing := math.Atan2(intent.FacingY, intent.FacingX)
	halfArc := ability.Arc / 2 * math.Pi / 180
	for _, target := range delversHit(attack, entities, s.playerDamage) {
		dx, dy := target.at.X-intent.TargetX, target.at.Y-intent.TargetY
		if math.Hypot(dx, dy) > ability.Radius {
			continue
		}
		if math.Abs(normalizeAngle(math.Atan2(dy, dx)-facing)) > halfArc {
			continue
		}
		s.applyHit(attack, target.entity)
	}
}

// placedDelver is a delver an ability may hit, and where it stands.
type placedDelver struct {
	entity *ecs.Entity
	at     *components.TransformComponent
}

// delversHit is every delver the attack may land on: a monster's ability hits
// delvers only, never a monster or anything else with health.
func delversHit(attack components.AttackSnapshot, entities []*ecs.Entity, playerDamage PlayerDamage) []placedDelver {
	var out []placedDelver
	for _, entity := range entities {
		if !entity.HasComponent(ecs.ComponentTypePlayer) || !CanHit(attack, entity, playerDamage) {
			continue
		}
		tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		out = append(out, placedDelver{entity: entity, at: tc.(*components.TransformComponent)})
	}
	return out
}

// abilityShots is a shot ability's projectiles: Shots of them, Fan degrees
// apart and centred on the aim.
func abilityShots(ability components.MonsterAbility) projectileSpec {
	n := max(ability.Shots, 1)
	fan := ability.Fan * math.Pi / 180
	spread := make([]float64, n)
	for i := range spread {
		spread[i] = (float64(i) - float64(n-1)/2) * fan
	}
	return projectileSpec{
		kind:        ability.ProjectileType,
		speed:       ability.ShotSpeed,
		maxDistance: ability.ShotMaxFlight,
		radius:      ability.ShotRadius,
		spread:      spread,
	}
}
