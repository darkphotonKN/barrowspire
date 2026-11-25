package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
The roll (FS-7P736 §A): a delver's dodge. StartRoll sets one going; the
MovementSystem carries it, a step a tick at one fixed speed, as it carries a
charge (§A R3–R4); while it is on the body, the delver is rolling: CanHit lets
no hit land on them (R5) and the session drops what else they ask for (R8).
The RollSystem, first on the tick, ends a roll the last tick spent or stopped
and runs the wait before the next down (R7).
*/

// rollSpeed is the roll's one speed, px per second: its distance over its
// time, whatever the pace, the gear or anything cast. FS-7P736 §A R3.
const rollSpeed = constants.RollDistance / constants.RollDuration

// rollCooldownDone absorbs the float drift of a tick-length count: a wait
// within it of its end is over, so 90 ticks of 1/30 s end a 3 s one.
const rollCooldownDone = 1e-9

// StartRoll sets a roll going along (dirX, dirY), normalised, and starts the
// roll cooldown, reporting whether it did. It refuses, changing nothing, a
// delver out of play, one inside the cooldown, one already rolling, one with a
// charge in flight, and a zero or non-finite heading. Which worlds may roll is
// the session's to judge. FS-7P736 §A R1–R2, R6–R7.
func StartRoll(delver *ecs.Entity, dirX, dirY float64) bool {
	length := math.Hypot(dirX, dirY)
	if length == 0 || math.IsNaN(length) || math.IsInf(length, 0) {
		return false
	}
	if !InPlay(delver) || !delver.HasComponent(ecs.ComponentTypeTransform) {
		return false
	}
	if _, waiting := RollCooldown(delver); waiting || carried(delver) {
		return false
	}
	delver.AddComponent(&components.RollComponent{Carry: components.Carry{
		DirX: dirX / length, DirY: dirY / length,
		Speed:     rollSpeed,
		Remaining: constants.RollDistance,
	}})
	delver.AddComponent(&components.RollCooldownComponent{
		Remaining: constants.RollCooldown,
		Total:     constants.RollCooldown,
	})
	return true
}

// Rolling reports whether a roll is in flight on the entity: from the tick it
// starts to the tick it is spent or stopped. FS-7P736 §A R5, R8.
func Rolling(entity *ecs.Entity) bool {
	return entity.HasComponent(ecs.ComponentTypeRoll)
}

// RollHeading is the heading of the entity's roll in flight, false when it is
// not rolling. FS-7P736 §A R12.
func RollHeading(entity *ecs.Entity) (dirX, dirY float64, rolling bool) {
	rc, ok := entity.GetComponent(ecs.ComponentTypeRoll)
	if !ok {
		return 0, 0, false
	}
	roll := rc.(*components.RollComponent)
	return roll.DirX, roll.DirY, true
}

// RollCooldown is the entity's roll cooldown while it runs, false once the
// next roll is ready. FS-7P736 §A R7, R12.
func RollCooldown(entity *ecs.Entity) (*components.RollCooldownComponent, bool) {
	cc, ok := entity.GetComponent(ecs.ComponentTypeRollCooldown)
	if !ok {
		return nil, false
	}
	return cc.(*components.RollCooldownComponent), true
}

// carried reports whether a move in flight carries the entity in place of its
// walk: a charge or a roll.
func carried(entity *ecs.Entity) bool {
	_, ok := carryOf(entity)
	return ok
}

// carryOf is the move in flight carrying the entity, false for none.
func carryOf(entity *ecs.Entity) (*components.Carry, bool) {
	if dc, ok := entity.GetComponent(ecs.ComponentTypeDash); ok {
		return &dc.(*components.DashComponent).Carry, true
	}
	if rc, ok := entity.GetComponent(ecs.ComponentTypeRoll); ok {
		return &rc.(*components.RollComponent).Carry, true
	}
	return nil, false
}

// RollSystem ends the rolls that are over and runs the roll cooldowns down.
type RollSystem struct{}

func NewRollSystem() *RollSystem {
	return &RollSystem{}
}

// NOTE: this runs every game tick
//
// Update runs first on the tick, before its requests are judged: a roll the
// last tick's movement spent or stopped ends, as does one on a body out of
// play, so the walk, a hit and a request each take again on the tick after a
// roll's last; and every roll cooldown counts the tick down. FS-7P736 §A R5,
// R7–R8, Edge States "Death mid-roll".
func (s *RollSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		if rc, ok := entity.GetComponent(ecs.ComponentTypeRoll); ok {
			if rc.(*components.RollComponent).Remaining <= carryEpsilon || !InPlay(entity) {
				entity.RemoveComponent(ecs.ComponentTypeRoll)
			}
		}
		if cooldown, ok := RollCooldown(entity); ok {
			cooldown.Remaining -= deltaTime
			if cooldown.Remaining <= rollCooldownDone {
				entity.RemoveComponent(ecs.ComponentTypeRollCooldown)
			}
		}
	}
}
