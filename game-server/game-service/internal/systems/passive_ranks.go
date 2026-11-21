package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// PassiveRanks is the passive tree ranks the body holds (FS-8RZ51 R31): what
// the tree's effects, the tree ability's gate (FS-04EEA) and the
// specialization (FS-E1ZDG) read. Empty, never nil, for a body holding none
// or an entity that is no body. Read only: never write the map.
func PassiveRanks(entity *ecs.Entity) passivetree.Ranks {
	pc, ok := entity.GetComponent(ecs.ComponentTypePassiveRanks)
	if !ok {
		return passivetree.Ranks{}
	}
	return pc.(*components.PassiveRanksComponent).Ranks
}
