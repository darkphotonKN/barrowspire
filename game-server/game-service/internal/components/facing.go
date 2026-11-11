package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// Facing is one of the 8 world-compass directions a character can face, by the
// name the client sends and the state relays. FS-JS7C8 §E R27.
type Facing string

const (
	FacingN  Facing = "n"
	FacingNE Facing = "ne"
	FacingE  Facing = "e"
	FacingSE Facing = "se"
	FacingS  Facing = "s"
	FacingSW Facing = "sw"
	FacingW  Facing = "w"
	FacingNW Facing = "nw"
)

// FacingComponent is the facing a player's client last sent for their body,
// added on the first face. Presentation only: the serializer relays it and no
// system reads it. A new body (a world switch, a reconnect, a handoff) starts
// without one. FS-JS7C8 §E R31–R32, R35.
type FacingComponent struct {
	Facing Facing
}

func (f *FacingComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeFacing
}
