package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

type OpenableComponent struct {
	IsOpen        bool
	HasBeenOpened bool
}

func (o *OpenableComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeOpenable
}

func NewOpenableComponent(isOpen bool) *OpenableComponent {
	return &OpenableComponent{IsOpen: isOpen, HasBeenOpened: false}
}
