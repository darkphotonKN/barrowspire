package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
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
TimedOpenSystem counts each delver's timed open, and cancels it.
FS-MQYEX §Requirements 2, 4–13.

A timed open starts at zero on the reach. Every tick from the one that applied
the reach counts the tick's simulation time on it, and the first tick to find
the whole duration already counted completes it: at 30 ticks a second a 1.5 s
timed open completes on the 45th tick after the reach's, never earlier. A
completed one leaves the body and is reported; opening the container is the
caller's.

A timed open is cancelled on the tick that finds its delver out of play, their
body not where it stood at the reach, health lost to the tick's combat, or the
container out of reach or gone. A cancel is judged before the timer's end,
leaves the body silently and is reported to nobody; nothing else cancels.
*/
type TimedOpenSystem struct {
	em *ecs.EntityManager
}

func NewTimedOpenSystem(em *ecs.EntityManager) *TimedOpenSystem {
	return &TimedOpenSystem{em: em}
}

// Start begins the delver's timed open on the container, from zero, where the
// body stands now. It takes the place of one the delver had on another
// container; on the container they are already opening it changes nothing, so
// a second reach neither restarts nor shortens the time (§Requirements 12).
func (s *TimedOpenSystem) Start(delver *ecs.Entity, containerID uuid.UUID, duration float64) {
	if oc, ok := delver.GetComponent(ecs.ComponentTypeTimedOpen); ok && oc.(*components.TimedOpenComponent).ContainerID == containerID {
		return
	}
	open := &components.TimedOpenComponent{ContainerID: containerID, Duration: duration}
	if tc, ok := delver.GetComponent(ecs.ComponentTypeTransform); ok {
		at := tc.(*components.TransformComponent)
		open.FromX, open.FromY = at.X, at.Y
	}
	if hc, ok := delver.GetComponent(ecs.ComponentTypeHealth); ok {
		open.HealthBeforeCombat = hc.(*components.HealthComponent).CurrentHealth
	}
	delver.AddComponent(open)
}

// MarkHealth notes the health each timed open's delver takes into the tick's
// combat, the one place a hit costs health: Update, after it, reads a hit from
// the health that is missing. A heal or a change of gear earlier in the tick
// is already counted, so neither hides a hit nor passes for one.
func (s *TimedOpenSystem) MarkHealth(entities []*ecs.Entity) {
	for _, entity := range entities {
		oc, ok := entity.GetComponent(ecs.ComponentTypeTimedOpen)
		if !ok {
			continue
		}
		if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok {
			oc.(*components.TimedOpenComponent).HealthBeforeCombat = hc.(*components.HealthComponent).CurrentHealth
		}
	}
}

// Update is the tick on every timed open, after the tick's movement and
// combat: a cancelled one leaves the body, the rest count the tick, and the
// ones that completed on it are reported, in the order of entities.
func (s *TimedOpenSystem) Update(deltaTime float64, entities []*ecs.Entity) []CompletedTimedOpen {
	var completed []CompletedTimedOpen
	for _, entity := range entities {
		oc, ok := entity.GetComponent(ecs.ComponentTypeTimedOpen)
		if !ok {
			continue
		}
		open := oc.(*components.TimedOpenComponent)
		// a cancel is judged before the timer's end: one on the last tick
		// opens nothing (§Requirements 10)
		if s.cancelled(entity, open) {
			entity.RemoveComponent(ecs.ComponentTypeTimedOpen)
			continue
		}
		if open.Elapsed >= open.Duration-timedOpenEpsilon {
			entity.RemoveComponent(ecs.ComponentTypeTimedOpen)
			completed = append(completed, CompletedTimedOpen{DelverEntityID: entity.ID, ContainerID: open.ContainerID})
			continue
		}
		open.Elapsed += deltaTime
	}
	return completed
}

// cancelled is whether the tick's movement and combat left the delver's timed
// open cancelled. FS-MQYEX §Requirements 6–9.
func (s *TimedOpenSystem) cancelled(delver *ecs.Entity, open *components.TimedOpenComponent) bool {
	// only a delver in play acts: one who died, escaped or was left behind
	// has none
	if !InPlay(delver) {
		return true
	}
	// the body is not where it stood at the reach, whatever moved it
	if tc, ok := delver.GetComponent(ecs.ComponentTypeTransform); ok {
		at := tc.(*components.TransformComponent)
		if at.X != open.FromX || at.Y != open.FromY {
			return true
		}
	}
	// a hit cost the delver health in the tick's combat
	if hc, ok := delver.GetComponent(ecs.ComponentTypeHealth); ok {
		if hc.(*components.HealthComponent).CurrentHealth < open.HealthBeforeCombat {
			return true
		}
	}
	// the container is out of reach, by the reach's own measure, or gone from
	// the world, as it is after a floor change
	container, ok := s.em.GetEntity(open.ContainerID)
	if !ok {
		return true
	}
	return !withinInteractRange(delver, container)
}

// withinInteractRange is whether the two stand within the interact range of
// each other; a thing with no place is in reach of nothing.
func withinInteractRange(a, b *ecs.Entity) bool {
	ac, aok := a.GetComponent(ecs.ComponentTypeTransform)
	bc, bok := b.GetComponent(ecs.ComponentTypeTransform)
	if !aok || !bok {
		return false
	}
	from, to := ac.(*components.TransformComponent), bc.(*components.TransformComponent)
	// the reach's own sum, so the two agree to the last bit at the edge
	distance := math.Sqrt(math.Pow(from.X-to.X, 2) + math.Pow(from.Y-to.Y, 2))
	return distance <= constants.DefaultInteractableRange
}
