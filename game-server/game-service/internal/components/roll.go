package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// RollComponent is a roll in flight: the delver's dodge, carried a step a tick
// by the MovementSystem in place of the walk, at one fixed speed, until it is
// spent or stopped. While it is on the body the delver is rolling: untouchable,
// and acting on nothing else. FS-7P736 §A R3–R5, R8.
type RollComponent struct {
	Carry
}

func (r *RollComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeRoll
}

// RollCooldownComponent is the wait before the delver may roll again. It lives
// on the body while it runs, so it carries across floors. FS-7P736 §A R7.
type RollCooldownComponent struct {
	// Remaining is the seconds left; Total the length it started at.
	Remaining, Total float64
}

func (r *RollCooldownComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeRollCooldown
}
