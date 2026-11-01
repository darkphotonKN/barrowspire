package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// PotionComponent is a delver's drinking for this run: the shared drink
// cooldown and the record of the consumed items. It is added on the first
// drink and rides the body, so it survives whatever the body survives.
// FS-P9G8R §Requirements 9–12.
type PotionComponent struct {
	// CooldownRemaining is the seconds of simulation time left before the
	// delver may drink again, 0 when none. Shared by all three slots.
	CooldownRemaining float64
	// ConsumedItemIDs is the item_instances id of every stored-loadout potion
	// drunk this run, in the order drunk. A potion looted in this run has no
	// row and is never listed.
	ConsumedItemIDs []uuid.UUID
}

func (p *PotionComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypePotion
}
