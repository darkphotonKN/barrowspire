package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// ContainerKind is what a container is: a floor's chest, or a drop pile a
// slain monster left. Both are taken from the same way. FS-4R9M9 §Requirements 46, 55.
type ContainerKind string

const (
	ContainerKindChest    ContainerKind = "chest"
	ContainerKindDropPile ContainerKind = "drop_pile"
)

type ContainerComponent struct {
	ContainerID uuid.UUID
	Kind        ContainerKind
}

func (d *ContainerComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeContainer
}

// NewContainerComponent is a chest.
func NewContainerComponent(containerID uuid.UUID) *ContainerComponent {
	return &ContainerComponent{ContainerID: containerID, Kind: ContainerKindChest}
}
