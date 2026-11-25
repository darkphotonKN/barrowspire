package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
The Blessing (FS-5FZ4J §G R44) is a delver status from the hallowed altar's
prayer: a component on the body, so it is kept across every floor change, and
taken off at death by the elimination. It raises the delver's class-resource
regen (ResourceSystem) and the drop chance of the kills credited to them (the
kill drop roll); it never stacks and never leaves the run.
*/

// Bless blesses entity; a blessed one stays as it was.
func Bless(entity *ecs.Entity) {
	if !entity.HasComponent(ecs.ComponentTypeBlessed) {
		entity.AddComponent(&components.BlessedComponent{})
	}
}

// Blessed is whether entity carries the Blessing.
func Blessed(entity *ecs.Entity) bool {
	return entity.HasComponent(ecs.ComponentTypeBlessed)
}

// loseBlessing takes a dead delver's Blessing off, on the tick of death.
func loseBlessing(entity *ecs.Entity) {
	entity.RemoveComponent(ecs.ComponentTypeBlessed)
}
