package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// BookEffectKind names what a book ability left on the floor. The wire
// carries the same strings, in the run's book effects. FS-X2CMM §F R34.
type BookEffectKind string

const (
	// BookEffectWitchlight is the Witchlight page's light (R21).
	BookEffectWitchlight BookEffectKind = "witchlight"
	// rune (R24) and the later kinds join here as their pages are built.
)

// BookEffectComponent is a book effect: an entity of its own on the floor, at
// its Transform, with the seconds it has left. Every recipient of the run is
// sent it. It never climbs: a floor change clears it with the floor's other
// entities. FS-X2CMM §E R21, §F R34.
type BookEffectComponent struct {
	Kind BookEffectKind
	// Remaining is the simulation seconds left before it goes.
	Remaining float64
	// CasterID is the body whose cast set it down, so a lasting effect's
	// deeds can be its caster's (R29).
	CasterID uuid.UUID
}

func (e *BookEffectComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeBookEffect
}
