package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// ArrowRainComponent is an Arrow Rain still falling on its circle. It is a
// floor entity, as the burning trail is: it has no place of its own beyond its
// circle and no Player component, so a floor change clears it. Unlike the
// trail it does not go out with its caster. It is not on the wire. The
// CombatSystem steps it and removes it after its last volley. FS-04EEA §E
// R23–R28.
type ArrowRainComponent struct {
	// Attack is the archer's volley hit as the rain resolved: every volley
	// lands it, and every kill it makes is theirs.
	Attack AttackSnapshot
	// X, Y is the circle's centre; Radius how far from it a volley reaches.
	X, Y   float64
	Radius float64
	// VolleysLeft is the volleys still to fall; UntilVolley the seconds until
	// the next.
	VolleysLeft int
	UntilVolley float64
}

func (r *ArrowRainComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeArrowRain
}
