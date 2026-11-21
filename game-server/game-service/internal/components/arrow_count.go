package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// ArrowCountComponent counts the arrows an archer holding Quick Draw's rule
// has fired in this world: every 4th pierces one more monster. The
// CombatSystem lays it on the first and counts on. Never on the wire.
// FS-8RZ51 §F R29.
type ArrowCountComponent struct {
	Fired int
}

func (a *ArrowCountComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeArrowCount
}
