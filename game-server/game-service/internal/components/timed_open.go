package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// TimedOpenComponent is a delver's timed open: the shut run container they
// are opening and how far along they are. It rides the delver's body, so a
// delver has at most one, and it is gone once the container opens.
// FS-MQYEX §Requirements 2–5.
type TimedOpenComponent struct {
	// ContainerID is the entity id of the chest or sack being opened.
	ContainerID uuid.UUID
	// Elapsed is the seconds of simulation time counted so far, 0 at the reach.
	Elapsed float64
	// Duration is the seconds it takes, fixed at the reach.
	Duration float64
	// FromX, FromY is where the body stood at the reach.
	FromX, FromY float64
}

func (o *TimedOpenComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeTimedOpen
}
