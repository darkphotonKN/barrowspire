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

	// ReservedFor is the member a field drop pile is held for while its
	// killer-first window is open: the killer, from landing until the window
	// ends, then uuid.Nil. Always uuid.Nil on a chest and on a run's pile.
	// FS-X2F2H §Requirements 33, 35.
	ReservedFor uuid.UUID
	// Age is how long, in seconds, a field drop pile has lain since it landed
	// (FS-X2F2H §Requirements 33–34); the field's tick advances it. Always 0
	// on a chest and in a run.
	Age float64
	// OpenedFor is how long, in seconds, a field chest has stood since its
	// first open, back to 0 as it restocks (FS-3QHQZ §Requirements 19); the
	// field's tick advances it. Always 0 on a pile and in a run.
	OpenedFor float64
}

func (d *ContainerComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeContainer
}

// NewContainerComponent is a chest.
func NewContainerComponent(containerID uuid.UUID) *ContainerComponent {
	return &ContainerComponent{ContainerID: containerID, Kind: ContainerKindChest}
}
