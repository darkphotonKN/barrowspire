package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
MonsterAISystem decides what each living monster does this tick: wander,
chase, wind up or strike. FS-77AB6 §Requirements 26.

It only sets a monster's velocity, facing and AI state. MovementSystem moves
and collides it, exactly as it does a delver, and a strike is an attack intent
the CombatSystem resolves later in the same tick. Runs in a run only, before
movement.
*/
type MonsterAISystem struct {
	// roll draws uniformly from [0, 1) for wander destinations; injected so
	// tests can pin it
	roll func() float64
}

func NewMonsterAISystem(roll func() float64) *MonsterAISystem {
	return &MonsterAISystem{roll: roll}
}

// quarry is an in-play delver a monster may chase: what it is and where it stands.
type quarry struct {
	id uuid.UUID
	at *components.TransformComponent
}

// NOTE: this runs every game tick, before MovementSystem.
func (s *MonsterAISystem) Update(deltaTime float64, entities []*ecs.Entity) {
	delvers := quarries(entities)

	for _, entity := range entities {
		mc, isMonster := entity.GetComponent(ecs.ComponentTypeEnemy)
		if !isMonster || !alive(entity) {
			continue
		}
		monster := mc.(*components.MonsterComponent)

		tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		vc, hasVelocity := entity.GetComponent(ecs.ComponentTypeVelocity)
		if !hasTransform || !hasVelocity {
			continue
		}
		at := tc.(*components.TransformComponent)
		velocity := vc.(*components.VelocityComponent)

		s.think(deltaTime, entity, monster, at, velocity, delvers)
	}
}

// think runs one monster's tick: keep, drop or acquire a target, then wind up,
// strike, chase or wander.
func (s *MonsterAISystem) think(
	deltaTime float64,
	entity *ecs.Entity,
	monster *components.MonsterComponent,
	at *components.TransformComponent,
	velocity *components.VelocityComponent,
	delvers []quarry,
) {
	monster.AttackCooldown = max(monster.AttackCooldown-deltaTime, 0)

	target, hunting := s.target(monster, at, delvers)

	if monster.WindUpRemaining > 0 {
		s.windUp(deltaTime, entity, monster, at, velocity, target, hunting)
		return
	}

	if !hunting {
		s.wander(deltaTime, monster, at, velocity)
		return
	}

	if distance(at, target.at) > monster.AttackRange {
		s.chase(monster, at, velocity, target)
		return
	}

	// in range: stand and face it, and swing once the interval has elapsed
	velocity.VX, velocity.VY = 0, 0
	face(monster, at, target.at)
	if monster.AttackCooldown > 0 {
		// any action but attack between swings, so each one reads as new
		monster.Action = components.MonsterActionIdle
		return
	}
	monster.WindUpRemaining = monster.WindUp
	monster.AttackCooldown = monster.AttackInterval
	monster.Action = components.MonsterActionAttack
}

// target settles who the monster is after this tick. The current target is kept
// while it is in play and inside the leash radius; otherwise it is dropped. With
// none, a delver who hit it since its last tick is taken up at any distance,
// else the nearest delver inside its aggro radius. A hit is answered once.
//
// A target taken up for a hit from beyond the leash radius is exempt from the
// leash until the monster has closed inside that radius of them once, so a
// kiting archer gets no free kills. FS-77AB6 §Requirements 26 "Leash"
// (user decision 2026-10-09).
func (s *MonsterAISystem) target(monster *components.MonsterComponent, at *components.TransformComponent, delvers []quarry) (quarry, bool) {
	attacker := monster.LastAttacker
	monster.LastAttacker = uuid.Nil

	target, ok := find(monster.Target, delvers)
	if ok {
		if distance(at, target.at) <= monster.LeashRadius {
			monster.Retaliating = false
		} else if !monster.Retaliating {
			ok = false
		}
	}
	if !ok {
		target, ok = find(attacker, delvers)
		monster.Retaliating = ok && distance(at, target.at) > monster.LeashRadius
	}
	if !ok {
		target, ok = nearest(at, monster.AggroRadius, delvers)
	}

	if !ok {
		monster.Target = uuid.Nil
		return quarry{}, false
	}
	if monster.Target != target.id {
		monster.Target = target.id
		// back from the hunt, it walks somewhere fresh, not to a stale spot
		monster.Wander = components.Wandering{}
	}
	return target, true
}

// windUp holds a monster still through its wind-up and, when it ends, strikes if
// the target is still within range × 1.25; otherwise the swing whiffs.
func (s *MonsterAISystem) windUp(
	deltaTime float64,
	entity *ecs.Entity,
	monster *components.MonsterComponent,
	at *components.TransformComponent,
	velocity *components.VelocityComponent,
	target quarry,
	hunting bool,
) {
	velocity.VX, velocity.VY = 0, 0
	monster.Action = components.MonsterActionAttack

	monster.WindUpRemaining -= deltaTime
	if monster.WindUpRemaining > 0 {
		return
	}
	monster.WindUpRemaining = 0

	if !hunting || distance(at, target.at) > monster.AttackRange*strikeReach {
		return
	}
	ic, ok := entity.GetComponent(ecs.ComponentTypeAttackIntent)
	if !ok {
		return
	}
	intents := ic.(*components.AttackIntentComponent)
	intents.Pending = append(intents.Pending, components.AttackIntent{
		Kind:           components.AttackMonsterStrike,
		TargetEntityID: target.id,
	})
}

// A strike lands on a target still within this multiple of the attack range
// when the wind-up ends. FS-77AB6 §Requirements 26 "Attack".
const strikeReach = 1.25

// wander walks a monster with no target to random spots around home.
func (s *MonsterAISystem) wander(deltaTime float64, monster *components.MonsterComponent, at *components.TransformComponent, velocity *components.VelocityComponent) {
	walk(deltaTime, &monster.Wander, monsterPace, at, velocity, func() (float64, float64) {
		// uniform over the disc around home
		r := constants.MonsterHomeRadius * math.Sqrt(s.roll())
		angle := 2 * math.Pi * s.roll()
		return monster.HomeX + r*math.Cos(angle), monster.HomeY + r*math.Sin(angle)
	})

	if velocity.VX == 0 && velocity.VY == 0 {
		monster.Action = components.MonsterActionIdle
		return
	}
	monster.FacingX, monster.FacingY = velocity.VX, velocity.VY
	monster.Action = components.MonsterActionMove
}

var monsterPace = pace{pause: constants.MonsterPauseSeconds, stall: constants.MonsterStallSeconds}

// chase steers straight at the target at full speed. No pathfinding: a wall in
// between body-blocks it (FS-77AB6 §Out of Scope).
func (s *MonsterAISystem) chase(monster *components.MonsterComponent, at *components.TransformComponent, velocity *components.VelocityComponent, target quarry) {
	face(monster, at, target.at)
	velocity.VX, velocity.VY = monster.FacingX, monster.FacingY
	monster.Action = components.MonsterActionMove
}

// face turns a monster towards a point. Facing is never zero: standing on the
// point, it keeps the way it faced.
func face(monster *components.MonsterComponent, at, toward *components.TransformComponent) {
	dx, dy := toward.X-at.X, toward.Y-at.Y
	d := math.Hypot(dx, dy)
	if d == 0 {
		return
	}
	monster.FacingX, monster.FacingY = dx/d, dy/d
}

func distance(a, b *components.TransformComponent) float64 {
	return math.Hypot(b.X-a.X, b.Y-a.Y)
}

// quarries is every delver in play: alive, not escaped, not left behind. Nobody
// else can be acquired, and a target who drops out of this is dropped.
func quarries(entities []*ecs.Entity) []quarry {
	var out []quarry
	for _, entity := range entities {
		if !InPlay(entity) {
			continue
		}
		tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		out = append(out, quarry{id: entity.ID, at: tc.(*components.TransformComponent)})
	}
	return out
}

// find is the delver with this id among those in play.
func find(id uuid.UUID, delvers []quarry) (quarry, bool) {
	if id == uuid.Nil {
		return quarry{}, false
	}
	for _, d := range delvers {
		if d.id == id {
			return d, true
		}
	}
	return quarry{}, false
}

// nearest is the closest delver within radius of at, by distance alone: no line
// of sight in v1.
func nearest(at *components.TransformComponent, radius float64, delvers []quarry) (quarry, bool) {
	var best quarry
	bestDistance := math.Inf(1)
	for _, d := range delvers {
		distance := math.Hypot(d.at.X-at.X, d.at.Y-at.Y)
		if distance <= radius && distance < bestDistance {
			best, bestDistance = d, distance
		}
	}
	return best, !math.IsInf(bestDistance, 1)
}
