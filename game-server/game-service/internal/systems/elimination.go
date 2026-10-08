package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* Tracks players health levels and processes eliminiations once their
* health levels pass a certain threshold.
*
* The delvers eliminated on a tick are returned, in the order met, for the
* session to record on that same tick. Returning them rather than sending them
* on a channel means a tick still in flight as the world shuts down has nothing
* closed to send on.
**/
type EliminationSystem struct {
}

func NewEliminationSystem() *EliminationSystem {
	return &EliminationSystem{}
}

func (s *EliminationSystem) Update(deltaTime float64, entities []*ecs.Entity, sessionID uuid.UUID) []types.Player {
	var eliminated []types.Player

	for _, entity := range entities {
		playerComp, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)

		if !isPlayer {
			continue
		}

		healthComp, hasHealth := entity.GetComponent(ecs.ComponentTypeHealth)

		if !hasHealth {
			continue
		}

		player := playerComp.(*components.PlayerComponent)
		health := healthComp.(*components.HealthComponent)

		// track eliminated players and hand them back for recording
		if health.CurrentHealth <= 0 && !health.IsEliminated {
			eliminated = append(eliminated, types.Player{
				ID:                   player.MemberID,
				Username:             player.Username,
				CurrentGameSessionId: sessionID,
			})

			// eliminate player
			health.IsEliminated = true

			// the dead stop where they fell: their moves are refused from now on,
			// so nothing else would stop them (FS-77AB6 §Requirements 17)
			if vc, ok := entity.GetComponent(ecs.ComponentTypeVelocity); ok {
				velocity := vc.(*components.VelocityComponent)
				velocity.VX, velocity.VY = 0, 0
			}
		}
	}

	return eliminated
}
