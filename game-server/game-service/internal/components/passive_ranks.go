package components

import (
	"maps"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// PassiveRanksComponent is the passive tree ranks a body holds: set at seating
// from the character in play, raised on the HUB world body by a spend in town
// (FS-8RZ51 R20, R27, R31). The systems read it here, never the record. Ranks
// is never written in place, so a frame holding it stays whole: a change
// replaces the component.
type PassiveRanksComponent struct {
	Ranks passivetree.Ranks
}

// NewPassiveRanksComponent holds a copy of ranks; never a nil map.
func NewPassiveRanksComponent(ranks passivetree.Ranks) *PassiveRanksComponent {
	held := make(passivetree.Ranks, len(ranks))
	maps.Copy(held, ranks)
	return &PassiveRanksComponent{Ranks: held}
}

func (p *PassiveRanksComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypePassiveRanks
}
