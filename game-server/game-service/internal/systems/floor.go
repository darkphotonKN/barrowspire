package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// CurrentFloor finds which floor a run is on from the entity list a system is
// handed each tick. A hub has no floors, so it reports false there.
// FS-F6F88 §Requirements 3.
func CurrentFloor(entities []*ecs.Entity) (*components.FloorComponent, bool) {
	for _, entity := range entities {
		if fc, ok := entity.GetComponent(ecs.ComponentTypeFloor); ok {
			return fc.(*components.FloorComponent), true
		}
	}

	return nil, false
}
