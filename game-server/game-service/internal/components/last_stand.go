package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// LastStandSpentComponent marks a Guardian whose Last Stand has saved them on
// this floor. With no mark the Last Stand is ready: a body is seated without
// one, and the party moving up a floor lifts it. A field respawn leaves it.
// The CombatSystem lays it as the Last Stand saves. Never on the wire.
// FS-E1ZDG §C R11-12.
type LastStandSpentComponent struct{}

func (l *LastStandSpentComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeLastStandSpent
}
