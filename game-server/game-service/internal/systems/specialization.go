package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// Specialization is the specialization the body is (FS-E1ZDG §B R7): the one
// its held tier-6 node grants, read from its ranks through the shared table,
// never stored. Empty before the pick, for ranks naming no tier-6 node of its
// class (R10), and for an entity that is no body. The read every
// specialization's effect uses.
func Specialization(entity *ecs.Entity) string {
	pc, ok := entity.GetComponent(ecs.ComponentTypePlayer)
	if !ok {
		return ""
	}
	spec, _ := passivetree.SpecializationOf(pc.(*components.PlayerComponent).Class, PassiveRanks(entity))
	return spec
}
