package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/**
* Call the Hound sets a hound at its point for 40 s: a book effect with a body,
* health of 40 % of the archer's max and the archer's base speed. It bites the
* nearest monster within 5 cells of it for 8 + 0.5 × the archer's level
* physical every 1.0 s at a 1-cell reach; with no monster that near it follows
* the archer to within 2 cells, and with the archer out of play it stands.
* When its time is up or its health reaches 0 it goes, leaving nothing. One
* per archer: a new call sends the old one away. FS-X2CMM §E R28–R29.
*
* It is never a delver (no PlayerComponent, never InPlay), so the end rule, the
* party, escape, loot and experience never count it, and a floor change wipes
* it with the floor. Monsters may take it as a quarry and strike it; no
* delver's hit lands on it. Its kills are its archer's: a bite is a hit from the
* archer's member id, as the burning trail's are (FS-4R9M9 R36).
*
* Four hooks, a line each: the ground counts it a body of its own kind
* (BodyHound, body.go), which monsters hunt and a plate is held by (R58), and
* the monster AI steers it after the monsters (runHounds); combat lands its
* bites (houndsBite); CanHit spares it every delver's hit (sparesHound). The
* BookSystem ages it with the other book effects and takes it at no health.
* Its bay at a shut secret door or a waiting ambush is the BookRevealSystem's
* (book_reveal.go, R49).
**/

const (
	// houndSeconds is how long a hound stands.
	houndSeconds = 40.0
	// houndHealthShare is its health, as a share of the archer's max.
	houndHealthShare = 0.40
	// houndBiteBase and houndBitePerLevel make a bite's physical power.
	houndBiteBase     = 8.0
	houndBitePerLevel = 0.5
	// houndBiteSeconds is the shortest time between two bites.
	houndBiteSeconds = 1.0
	// houndBiteShow is how long a bite shows as `bite` on the wire.
	houndBiteShow = 0.3
	// houndReachCells, houndSightCells, houndHeelCells: how near a monster
	// must stand to be bitten, to be gone after, and how near it keeps to its
	// archer.
	houndReachCells = 1.0
	houndSightCells = 5.0
	houndHeelCells  = 2.0
)

// resolveCallTheHound sends away the archer's hound, if one stands, and sets
// a new one at the cast's point, its health, bite and reach fixed now, its
// cells the cast's floor's.
func resolveCallTheHound(world *ecs.EntityManager, cast BookCast) {
	sendAwayHoundOf(world, cast.Caster.ID)

	hound := SetDownBookEffect(world, components.BookEffectHound, cast.TargetX, cast.TargetY, houndSeconds, cast.Caster)
	most := max(int(math.Round(houndHealthShare*float64(maxHealthOf(cast.Caster)))), 1)
	hound.AddComponent(components.NewHealthComponent(most, most))
	hound.AddComponent(components.NewVelocityComponent(0, 0, constants.DefaultSpeed))
	hound.AddComponent(&components.HoundComponent{
		OwnerMemberID: memberIDOf(cast.Caster),
		BitePower:     houndBiteBase + houndBitePerLevel*float64(delverLevel(cast.Caster)),
		Reach:         houndReachCells * cast.CellSize,
		Sight:         houndSightCells * cast.CellSize,
		Heel:          houndHeelCells * cast.CellSize,
		Action:        components.HoundActionIdle,
	})
}

// sendAwayHoundOf takes the archer's hound from the floor, if one stands.
func sendAwayHoundOf(world *ecs.EntityManager, archerID uuid.UUID) {
	for _, entity := range world.GetAllEntities() {
		if entity.HasComponent(ecs.ComponentTypeHound) && archerOf(entity) == archerID {
			world.RemoveEntity(entity.ID)
		}
	}
}

// archerOf is the body whose call set the hound down, uuid.Nil for anything
// that is no book effect.
func archerOf(hound *ecs.Entity) uuid.UUID {
	if ec, ok := hound.GetComponent(ecs.ComponentTypeBookEffect); ok {
		return ec.(*components.BookEffectComponent).CasterID
	}
	return uuid.Nil
}

// HoundOf is the entity's hound, false for anything that is not one.
func HoundOf(entity *ecs.Entity) (*components.HoundComponent, bool) {
	hc, ok := entity.GetComponent(ecs.ComponentTypeHound)
	if !ok {
		return nil, false
	}
	return hc.(*components.HoundComponent), true
}

// standingHound is whether the entity is a hound with health and time left: a
// body a monster may take as its quarry, that bites and heels.
func standingHound(entity *ecs.Entity) bool {
	return entity.HasComponent(ecs.ComponentTypeHound) && alive(entity) && !BookEffectExpired(entity)
}

// houndDown is whether the entity is a hound at no health: it goes on the
// next tick, its one state as dead sent.
func houndDown(entity *ecs.Entity) bool {
	return entity.HasComponent(ecs.ComponentTypeHound) && !alive(entity)
}

// sparesHound is whether the hit is one a hound never takes: any delver's.
// The hound's own bite is the archer's hit, and it bites monsters only.
func sparesHound(attack components.AttackSnapshot, target *ecs.Entity) bool {
	return attack.AttackerMemberID != uuid.Nil && target.HasComponent(ecs.ComponentTypeHound)
}

// --- the steering, on the monster AI's tick ---

// runHounds steers every hound standing on the floor for this tick, after the
// monsters have thought: after the nearest monster within its sight until it
// stands within its reach, else to within its heel of its archer in play, else
// it stands. It walks by path on a dungeon floor, as a monster does. It only
// sets its velocity and action: the MovementSystem moves it, and combat bites.
func (s *MonsterAISystem) runHounds(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		hound, ok := HoundOf(entity)
		if !ok || !standingHound(entity) {
			continue
		}
		at, hasPlace := bodyCentre(entity)
		vc, hasVelocity := entity.GetComponent(ecs.ComponentTypeVelocity)
		if !hasPlace || !hasVelocity {
			continue
		}
		velocity := vc.(*components.VelocityComponent)
		hound.Route.SearchIn = max(hound.Route.SearchIn-deltaTime, 0)
		hound.BiteShow = max(hound.BiteShow-deltaTime, 0)

		goal, near, ok := s.houndGoal(entity, hound, at, entities)
		if ok && distance(at, goal) > near {
			x, y := router{s.grid}.towards(&hound.Route, at, goal.X, goal.Y)
			velocity.VX, velocity.VY = unitToward(at, x, y)
		} else {
			velocity.VX, velocity.VY = 0, 0
			forget(&hound.Route)
		}
		hound.Action = houndAction(hound, velocity)
	}
}

// houndGoal is where the hound heads and how near it need come: the nearest
// living monster within its sight, to its reach; else its archer in play, to
// its heel. False when it has neither.
func (s *MonsterAISystem) houndGoal(entity *ecs.Entity, hound *components.HoundComponent, at *components.TransformComponent, entities []*ecs.Entity) (*components.TransformComponent, float64, bool) {
	if prey, ok := nearestMonster(at, hound.Sight, entities); ok {
		to, _ := bodyCentre(prey)
		return to, hound.Reach, true
	}
	archer := archerOf(entity)
	for _, other := range entities {
		if other.ID == archer && InPlay(other) {
			to, ok := bodyCentre(other)
			return to, hound.Heel, ok
		}
	}
	return nil, 0, false
}

// houndAction is what the hound shows this tick: its bite while it shows,
// else running while it walks, else idle.
func houndAction(hound *components.HoundComponent, velocity *components.VelocityComponent) components.HoundAction {
	switch {
	case hound.BiteShow > 0:
		return components.HoundActionBite
	case velocity.VX != 0 || velocity.VY != 0:
		return components.HoundActionRun
	default:
		return components.HoundActionIdle
	}
}

// unitToward is the unit direction from at to (x, y); zero standing on it.
func unitToward(at *components.TransformComponent, x, y float64) (float64, float64) {
	dx, dy := x-at.X, y-at.Y
	d := math.Hypot(dx, dy)
	if d == 0 {
		return 0, 0
	}
	return dx / d, dy / d
}

// nearestMonster is the nearest living monster within radius of at, the
// lower entity id at a tie (nearerFirst).
func nearestMonster(at *components.TransformComponent, radius float64, entities []*ecs.Entity) (*ecs.Entity, bool) {
	var best *ecs.Entity
	bestDistance := math.Inf(1)
	for _, entity := range entities {
		if !entity.HasComponent(ecs.ComponentTypeEnemy) || !alive(entity) {
			continue
		}
		to, ok := bodyCentre(entity)
		if !ok {
			continue
		}
		if d := distance(at, to); d <= radius && (best == nil || nearerFirst(d, entity.ID, bestDistance, best.ID) < 0) {
			best, bestDistance = entity, d
		}
	}
	return best, best != nil
}

// --- the bite, on combat's tick ---

// houndsBite lands every standing hound's bite that is due: on the nearest
// living monster within its reach, once its last bite is 1 s past. A bite is a
// physical hit at its power, coefficient 1, nothing scaling it and no crit,
// from the hound's body and the archer's member id, through applyHit: the
// monster turns on the hound, and a killing bite is the archer's kill (R29).
func (s *CombatSystem) houndsBite(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		hound, ok := HoundOf(entity)
		if !ok || !standingHound(entity) {
			continue
		}
		if hound.BiteIn = max(hound.BiteIn-deltaTime, 0); hound.BiteIn > castEpsilon {
			continue
		}
		at, ok := bodyCentre(entity)
		if !ok {
			continue
		}
		prey, ok := nearestMonster(at, hound.Reach, entities)
		if !ok {
			continue
		}
		s.applyHit(components.AttackSnapshot{
			AttackerEntityID: entity.ID,
			AttackerMemberID: hound.OwnerMemberID,
			DamageType:       components.DamagePhysical,
			Power:            hound.BitePower,
			Coefficient:      1,
		}, prey)
		hound.BiteIn = houndBiteSeconds
		hound.BiteShow = houndBiteShow
		hound.Action = components.HoundActionBite
	}
}

// --- readers ---

func maxHealthOf(entity *ecs.Entity) int {
	if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok {
		return hc.(*components.HealthComponent).MaxHealth
	}
	return 0
}

func memberIDOf(entity *ecs.Entity) uuid.UUID {
	if pc, ok := entity.GetComponent(ecs.ComponentTypePlayer); ok {
		return pc.(*components.PlayerComponent).MemberID
	}
	return uuid.Nil
}
