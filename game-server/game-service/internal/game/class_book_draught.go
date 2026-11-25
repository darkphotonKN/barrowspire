package game

import (
	"errors"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// drinkDraught has the delver drink the archer's draught they interact with:
// gone from the floor, its heal started on them. Runs only, the one world a
// draught stands in. Out of the interact reach the delver is told so, as any
// interact out of reach is; any other refusal goes quietly. It takes none of
// the interact holds: a draught is drunk once, and is gone. FS-X2CMM §E R27.
func (s *Session) drinkDraught(playerID uuid.UUID, draught *ecs.Entity) error {
	if s.worldType != types.WorldTypeRun {
		return fmt.Errorf("drink a draught: %w", systems.ErrNotADraught)
	}

	s.mu.RLock()
	entityID, here := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()
	drinker, ok := s.EntityManager.GetEntity(entityID)
	if !here || !ok {
		return fmt.Errorf("drink a draught: %w", ErrEntityNotFound)
	}

	err := systems.NewBookSystem(s.EntityManager).DrinkDraught(drinker, draught)
	if errors.Is(err, systems.ErrDraughtOutOfReach) {
		s.sendErrorToPlayer(playerID, string(constants.ActionInteract), "too far away to interact")
		return ErrOutOfRange
	}
	if err != nil {
		return fmt.Errorf("drink a draught: %w", err)
	}
	return nil
}
