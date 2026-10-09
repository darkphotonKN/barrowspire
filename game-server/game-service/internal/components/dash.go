package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// DashComponent is a charge in flight: the warrior's dash, carried a step a tick
// by the MovementSystem in place of the walk until it is spent or stopped. The
// CombatSystem sets it going on the cast and ends it.
type DashComponent struct {
	// DirX, DirY is the unit heading, fixed on the cast.
	DirX, DirY float64
	// Speed is how fast it carries the body, px per second.
	Speed float64
	// Remaining is the distance still to run, px; 0 once spent or stopped.
	Remaining float64
	// FromX, FromY is where it began: a burning trail runs from here.
	FromX, FromY float64
}

func (d *DashComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeDash
}
