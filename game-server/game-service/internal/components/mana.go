package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

type ManaComponent struct {
	CurrentMana  int
	MaxMana      int
	IsEliminated bool
}

func (h *ManaComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeMana
}

func NewManaComponent(currentHealth, maxHealth int) *ManaComponent {
	return &ManaComponent{CurrentMana: currentHealth, MaxMana: maxHealth, IsEliminated: false}
}
