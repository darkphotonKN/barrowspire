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
	// BookEffectRune is the Binding Glyph page's rune (R24); its catch rides
	// the same entity as a RuneComponent.
	BookEffectRune BookEffectKind = "rune"
	// BookEffectDraught is the Brew page's draught (R27): it has no time of
	// its own, and stands until a delver drinks it or the floor ends.
	BookEffectDraught BookEffectKind = "draught"
	// BookEffectHound is the Call the Hound page's hound (R28): a body on the
	// floor with health of its own, its bite and heel a HoundComponent on the
	// same entity. It goes at its time or at no health.
	BookEffectHound BookEffectKind = "hound"
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

// RuneComponent is a rune's catch, on the rune's own book effect entity: how
// far its ring reaches from its centre and each monster it has held so far,
// in the order caught. A monster is caught once per rune. FS-X2CMM §E R24.
type RuneComponent struct {
	// Radius is the ring's reach from the rune's centre, in px.
	Radius float64
	// Caught is each monster the rune has stunned.
	Caught []uuid.UUID
}

func (r *RuneComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeRune
}
