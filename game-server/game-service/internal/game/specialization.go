package game

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
)

// gainedSpecialization is the pick's one-off changes to the body that has just
// become spec (FS-E1ZDG §B R8), run once from RaisePassiveRanks under the
// world's lock: the Sellsword's parry-charge max (§J R34). The Berserker's max
// HP clamp (§D R17) hooks here too.
func gainedSpecialization(entity *ecs.Entity, spec string) {
	switch spec {
	case passivetree.Sellsword:
		systems.ApplySellswordPool(entity)
	}
}
