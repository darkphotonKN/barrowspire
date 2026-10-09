package systems

import (
	"math"
	"math/rand"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* Walks the hub's residents around.
*
* It only ever sets velocity. Everything else — collision against walls and
* buildings, being pushed by delvers, the world's edge — comes from
* MovementSystem, which runs next and which residents pass through exactly as
* players do. A separate movement path for NPCs would be a second set of
* collision rules to keep in step with the first.
*
* Runs in the hub only; a run has no residents.
**/
type WanderSystem struct{}

func NewWanderSystem() *WanderSystem {
	return &WanderSystem{}
}

// NOTE: this runs every game tick, before MovementSystem.
func (s *WanderSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		npcComp, isNPC := entity.GetComponent(ecs.ComponentTypeNPC)
		if !isNPC {
			continue
		}

		npc := npcComp.(*components.NPCComponent)
		if npc.Wander == nil {
			continue // a function NPC, who stands where the map put them
		}

		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		velocityComp, hasVelocity := entity.GetComponent(ecs.ComponentTypeVelocity)
		if !hasTransform || !hasVelocity {
			continue
		}

		s.step(
			deltaTime,
			npc.Wander,
			transformComp.(*components.TransformComponent),
			velocityComp.(*components.VelocityComponent),
		)
	}
}

func (s *WanderSystem) step(
	deltaTime float64,
	region *components.WanderRegion,
	transform *components.TransformComponent,
	velocity *components.VelocityComponent,
) {
	walk(deltaTime, &region.Wandering, residentPace, transform, velocity, func() (float64, float64) {
		return region.X + rand.Float64()*region.W, region.Y + rand.Float64()*region.H
	})
}

// pace is how long a walker stands on arrival and how long it may fail to close
// on a destination before giving it up.
type pace struct {
	pause, stall float64 // seconds
}

var residentPace = pace{pause: constants.NPCPauseSeconds, stall: constants.NPCStallSeconds}

// walk steers a walker between random destinations that pick chooses: towards
// the current one, standing a while on arrival, and abandoning one it has
// stopped closing on. It only ever sets velocity's direction.
func walk(
	deltaTime float64,
	w *components.Wandering,
	p pace,
	transform *components.TransformComponent,
	velocity *components.VelocityComponent,
	pick func() (x, y float64),
) {
	if w.PauseRemaining > 0 {
		w.PauseRemaining -= deltaTime
		velocity.VX, velocity.VY = 0, 0
		return
	}

	if !w.HasDestination {
		choose(w, transform, pick)
	}

	dx := w.DestinationX - transform.X
	dy := w.DestinationY - transform.Y
	distanceSq := dx*dx + dy*dy

	// arrived
	if distanceSq <= arrivalRadius*arrivalRadius {
		w.HasDestination = false
		w.PauseRemaining = p.pause
		velocity.VX, velocity.VY = 0, 0
		return
	}

	// Getting no closer means something is in the way — a wall, a building, a
	// delver standing in a doorway. Give the destination up rather than lean on
	// it forever.
	if distanceSq >= w.LastDistanceSq {
		w.StalledFor += deltaTime
		if w.StalledFor >= p.stall {
			choose(w, transform, pick)
		}
	} else {
		w.StalledFor = 0
	}
	w.LastDistanceSq = distanceSq

	distance := math.Sqrt(distanceSq)
	velocity.VX = dx / distance
	velocity.VY = dy / distance
}

// choose picks somewhere new and forgets any stall.
func choose(w *components.Wandering, transform *components.TransformComponent, pick func() (x, y float64)) {
	w.DestinationX, w.DestinationY = pick()
	w.HasDestination = true
	w.StalledFor = 0

	dx := w.DestinationX - transform.X
	dy := w.DestinationY - transform.Y
	w.LastDistanceSq = dx*dx + dy*dy
}

// How near counts as arrived.
const arrivalRadius = 12.0
