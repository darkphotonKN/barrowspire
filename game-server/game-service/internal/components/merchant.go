package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

// WareKind is what a merchant sells. FS-9JV5K §A R3-R4.
type WareKind string

const (
	WareHealthPotion WareKind = "health_potion"
	WareAntidote     WareKind = "antidote"
	WareTomeOfFilth  WareKind = "tome_of_filth"
)

// Ware is one line of a merchant's stock: its price in gold, how many are
// neither sold nor reserved, and the item a sale creates, nil for the tome,
// which is run state.
type Ware struct {
	Kind  WareKind
	Price int64
	Left  int
	Item  *types.ItemConfig
}

// MerchantComponent is the wandering merchant standing on his floor, and his
// wares, rolled at his spawn and shared by the party. He has no health and no
// body the ground counts: nothing targets, hits or is weighed by him.
// FS-9JV5K §A R1-R3.
type MerchantComponent struct {
	Wares []Ware
}

func (m *MerchantComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeMerchant
}

// Ware is the merchant's line of kind, nil when he does not sell it.
func (m *MerchantComponent) Ware(kind WareKind) *Ware {
	for i := range m.Wares {
		if m.Wares[i].Kind == kind {
			return &m.Wares[i]
		}
	}
	return nil
}
