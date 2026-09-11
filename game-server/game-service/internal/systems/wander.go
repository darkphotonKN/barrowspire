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
	if region.PauseRemaining > 0 {
		region.PauseRemaining -= deltaTime
		velocity.VX, velocity.VY = 0, 0
		return
	}

	if !region.HasDestination {
		s.choose(region, transform)
	}

	dx := region.DestinationX - transform.X
	dy := region.DestinationY - transform.Y
	distanceSq := dx*dx + dy*dy

	// arrived
	if distanceSq <= arrivalRadius*arrivalRadius {
		region.HasDestination = false
		region.PauseRemaining = constants.NPCPauseSeconds
		velocity.VX, velocity.VY = 0, 0
		return
	}

	// Getting no closer means something is in the way — a wall, a building, a
	// delver standing in a doorway. Give the destination up rather than lean on
	// it forever.
	if distanceSq >= region.LastDistanceSq {
		region.StalledFor += deltaTime
		if region.StalledFor >= constants.NPCStallSeconds {
			s.choose(region, transform)
		}
	} else {
		region.StalledFor = 0
	}
	region.LastDistanceSq = distanceSq

	distance := math.Sqrt(distanceSq)
	velocity.VX = dx / distance
	velocity.VY = dy / distance
}

// choose picks somewhere new inside the region and forgets any stall.
func (s *WanderSystem) choose(region *components.WanderRegion, transform *components.TransformComponent) {
	region.DestinationX = region.X + rand.Float64()*region.W
	region.DestinationY = region.Y + rand.Float64()*region.H
	region.HasDestination = true
	region.StalledFor = 0

	dx := region.DestinationX - transform.X
	dy := region.DestinationY - transform.Y
	region.LastDistanceSq = dx*dx + dy*dy
}

// How near counts as arrived.
const arrivalRadius = 12.0
