package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// RespawnComponent is a fallen field player's wait to rise: put on the body by
// the FieldRespawnSystem on the tick it falls, taken off on the tick it rises
// (FS-X2F2H §Requirements 23).
type RespawnComponent struct {
	// Remaining is the time still to wait, s.
	Remaining float64
}

func (r *RespawnComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeRespawn
}
