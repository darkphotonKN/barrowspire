package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// ParryComponent is a mercenary's parry stance and whiff lockout, server state
// under ADR-0030's exception. Only a mercenary carries one. The parry charges
// it earns are the mercenary's ResourceComponent, not counted here.
// FS-MAMHR §Requirements 10–18, 28.
type ParryComponent struct {
	// Open is whether the stance is up.
	Open bool
	// OpenFor is how long the open stance has been up, in seconds: 0 on the
	// tick it opens.
	OpenFor float64
	// Negated is whether the open stance has negated a strike yet.
	Negated bool
	// LockoutRemaining is the seconds left on the whiff lockout, 0 when none.
	LockoutRemaining float64
	// Parries is how many strikes this mercenary has parried in this run,
	// at the parry-charge cap included. It only ever rises.
	Parries int
}

func (p *ParryComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeParry
}

func NewParryComponent() *ParryComponent {
	return &ParryComponent{}
}
