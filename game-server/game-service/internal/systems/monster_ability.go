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
	if ability.Kind == "" || ability.Shape == components.AbilityDeathBurst {
		return false
	}
	if monster.AbilityCooldown > 0 || monster.AttackCooldown > 0 {
		return false
	}
	d := distance(at, target.at)
	if d < ability.MinRange || d > ability.MaxRange {
		return false
	}
	switch ability.Shape {
	case components.AbilityShots, components.AbilityLeap:
		// a leap has no shot: its sight is the thin flight, its body's
		// clearance tested as it leaves (R15)
		return s.clear(at.X, at.Y, target.at.X, target.at.Y, ability.ShotRadius)
	}
	return true
}

// clear reports whether a body of half-size half moving straight from a to b
// overlaps only walkable cells; with no grid, always.
func (s *MonsterAISystem) clear(ax, ay, bx, by, half float64) bool {
	return s.grid == nil || s.grid.Clear(ax, ay, bx, by, half)
}

// startAbility stands a monster, faces its target and winds its ability up,
// fixed where it stands and the way it faces now, or for a leap on the point
// its target stands on now. Its cooldown starts here, and the ability takes
// the swing's place in the attack interval. FS-C8VM7 §B R12, R13, R15.
func startAbility(monster *components.MonsterComponent, at *components.TransformComponent, velocity *components.VelocityComponent, target quarry) {
	velocity.VX, velocity.VY = 0, 0
	face(monster, at, target.at)
	monster.AttackCooldown = monster.AttackInterval
	monster.AbilityCooldown = monster.Ability.Cooldown
	pending := components.PendingAbility{
		Remaining: monster.Ability.WindUp,
		X:         at.X,
		Y:         at.Y,
		FacingX:   monster.FacingX,
		FacingY:   monster.FacingY,
	}
	if monster.Ability.Shape == components.AbilityLeap {
		pending.Remaining += monster.Ability.LeapTime
		pending.X, pending.Y = target.at.X, target.at.Y
	}
	monster.AbilityPending = pending
	monster.Action = components.MonsterActionAbility
}

// windUpAbility holds a monster still through its ability's wind-up and, when
// it ends, hands the ability to the CombatSystem. An area or cone lands where
// it was fixed, whoever is left to hit; a shot keeps turning to its target and
// leaves at where they stand at the end, and with no target is not loosed. A
// leap runs as pounce does. FS-C8VM7 §B R13, R15, §Edge States.
func (s *MonsterAISystem) windUpAbility(
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
	if monster.Ability.Shape == components.AbilityLeap {
		s.pounce(deltaTime, entity, monster, at)
		return
	}
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

/*
pounce runs a leap on by a tick: its wind-up, then, if the straight line to the
aimed point is clear for its body, the leap there over its leap time,
colliding with nothing, and the landing, its area centred where it stands. A
line not clear as the wind-up ends calls it off, its cooldown spent; so it
never leaves the floor's walkable cells. With no grid, as on a floor of
buildings, there are no walkable cells to test the line against, and it is
called off the same way, so it never leaps through a house wall.
FS-C8VM7 §B R15.

The leap moves the monster itself, the one place the AI does: the
MovementSystem would collide it.
*/
func (s *MonsterAISystem) pounce(deltaTime float64, entity *ecs.Entity, monster *components.MonsterComponent, at *components.TransformComponent) {
	pending := &monster.AbilityPending
	leap := monster.Ability.LeapTime
	pending.Remaining -= deltaTime

	if !pending.Leaping {
		if pending.Remaining > leap {
			return
		}
		if s.grid == nil || !s.grid.Clear(at.X, at.Y, pending.X, pending.Y, constants.PlayerRadius) {
			*pending = components.PendingAbility{}
			monster.Action = components.MonsterActionIdle
			return
		}
		pending.Leaping = true
		pending.FromX, pending.FromY = at.X, at.Y
	}

	if pending.Remaining > 0 {
		flown := 1 - pending.Remaining/leap
		at.X = pending.FromX + (pending.X-pending.FromX)*flown
		at.Y = pending.FromY + (pending.Y-pending.FromY)*flown
		return
	}
	at.X, at.Y = pending.X, pending.Y
	*pending = components.PendingAbility{}
	strike(entity, components.AttackIntent{Kind: components.AttackMonsterAbility, TargetX: at.X, TargetY: at.Y})
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
	case components.AbilityAreaAroundSelf, components.AbilityLeap:
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
	s.areaHit(s.snapshot(attacker, spec), x, y, radius, entities)
}

// areaHit lands one hit on every delver whose body overlaps the circle.
func (s *CombatSystem) areaHit(attack components.AttackSnapshot, x, y, radius float64, entities []*ecs.Entity) {
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

// armBurst lights a dead monster's death burst on its corpse: its fuse, its
// centre where the corpse lies, and its hit snapshotted now, at the damage it
// had at its death (an elite's if it was one). FS-C8VM7 §B R16.
func armBurst(entity *ecs.Entity, monster *components.MonsterComponent) {
	tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return
	}
	at := tc.(*components.TransformComponent)
	monster.AbilityPending = components.PendingAbility{
		Remaining: monster.Ability.WindUp,
		X:         at.X,
		Y:         at.Y,
		Attack: bareSnapshot(entity, attackSpec{
			damageType:  components.DamagePhysical,
			scaling:     scaleNone,
			coefficient: monster.Ability.Multiplier,
		}),
	}
}

// burnFuses runs every corpse's death burst fuse on by a tick and lands each
// that ends, once, on every delver in its circle, credited to the dead
// monster. FS-C8VM7 §B R16.
func (s *CombatSystem) burnFuses(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		mc, ok := entity.GetComponent(ecs.ComponentTypeEnemy)
		if !ok {
			continue
		}
		monster := mc.(*components.MonsterComponent)
		pending := &monster.AbilityPending
		if monster.Ability.Shape != components.AbilityDeathBurst || pending.Remaining <= 0 {
			continue
		}
		pending.Remaining -= deltaTime
		if pending.Remaining > 0 {
			continue
		}
		burst := *pending
		*pending = components.PendingAbility{}
		s.areaHit(burst.Attack, burst.X, burst.Y, monster.Ability.Radius, entities)
	}
}
