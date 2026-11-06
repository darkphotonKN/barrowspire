package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// GuardedComponent marks a container that will not open while any of its
// guards still stands: the monsters its room spawned as guards or as its pack,
// by entity id, wherever they have wandered. Nothing in it changes as they
// fall; the open asks of the world whether any still stands. Server-only: it is
// never sent. FS-KE075 §J Requirements 57–59.
type GuardedComponent struct {
	Guards []uuid.UUID
}

func (g *GuardedComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeGuarded
}

func NewGuardedComponent(guards []uuid.UUID) *GuardedComponent {
	return &GuardedComponent{Guards: guards}
}
