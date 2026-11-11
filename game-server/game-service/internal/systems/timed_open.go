package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// timedOpenEpsilon absorbs the float error of counting a whole timed open in
// tick-sized steps, so 1.5 s of ticks always reaches it.
const timedOpenEpsilon = 1e-9

// CompletedTimedOpen is one timed open whose time has passed: the delver's
// body and the container it was opening.
type CompletedTimedOpen struct {
	DelverEntityID uuid.UUID
	ContainerID    uuid.UUID
}

/*
TimedOpenSystem counts each delver's timed open. FS-MQYEX §Requirements 2, 4–5.

A timed open starts at zero on the reach. Every tick from the one that applied
the reach counts the tick's simulation time on it, and the first tick to find
the whole duration already counted completes it: at 30 ticks a second a 1.5 s
timed open completes on the 45th tick after the reach's, never earlier. A
completed one leaves the body and is reported; opening the container is the
caller's.
*/
type TimedOpenSystem struct{}

func NewTimedOpenSystem() *TimedOpenSystem {
	return &TimedOpenSystem{}
}

// Start begins the delver's timed open on the container, from zero, where the
// body stands now. It takes the place of any the delver had.
func (s *TimedOpenSystem) Start(delver *ecs.Entity, containerID uuid.UUID, duration float64) {
	open := &components.TimedOpenComponent{ContainerID: containerID, Duration: duration}
	if tc, ok := delver.GetComponent(ecs.ComponentTypeTransform); ok {
		at := tc.(*components.TransformComponent)
		open.FromX, open.FromY = at.X, at.Y
	}
	delver.AddComponent(open)
}

// Update counts the tick on every timed open and reports the ones that
// completed on it, in the order of entities.
func (s *TimedOpenSystem) Update(deltaTime float64, entities []*ecs.Entity) []CompletedTimedOpen {
	var completed []CompletedTimedOpen
	for _, entity := range entities {
		oc, ok := entity.GetComponent(ecs.ComponentTypeTimedOpen)
		if !ok {
			continue
		}
		open := oc.(*components.TimedOpenComponent)
		if open.Elapsed >= open.Duration-timedOpenEpsilon {
			entity.RemoveComponent(ecs.ComponentTypeTimedOpen)
			completed = append(completed, CompletedTimedOpen{DelverEntityID: entity.ID, ContainerID: open.ContainerID})
			continue
		}
		open.Elapsed += deltaTime
	}
	return completed
}
