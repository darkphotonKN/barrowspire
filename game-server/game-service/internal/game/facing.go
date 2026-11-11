package game

import (
	"errors"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// ErrUnknownFacing marks a face naming none of the 8 facings.
var ErrUnknownFacing = errors.New("unknown facing")

// facings are the 8 names a face may carry.
var facings = map[components.Facing]bool{
	components.FacingN: true, components.FacingNE: true, components.FacingE: true, components.FacingSE: true,
	components.FacingS: true, components.FacingSW: true, components.FacingW: true, components.FacingNW: true,
}

// handleFace keeps the facing the player's client sent on their body, for the
// state to relay. A name outside the 8, a delver out of play (a dead body keeps
// the facing it fell in) and a player with no body here are refused, and the
// stored facing stands. Nothing reads it but the serializer. FS-JS7C8 §E R31,
// R35.
func (s *Session) handleFace(playerID uuid.UUID, facing string) error {
	if !facings[components.Facing(facing)] {
		return fmt.Errorf("face %q: %w", facing, ErrUnknownFacing)
	}
	if err := s.delverInPlay(playerID); err != nil {
		return fmt.Errorf("face: %w", err)
	}

	s.mu.RLock()
	entityID, ok := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()
	if !ok {
		return fmt.Errorf("face: player %s: %w", playerID, ErrEntityNotFound)
	}
	body, ok := s.EntityManager.GetEntity(entityID)
	if !ok {
		return fmt.Errorf("face: player entity %s: %w", entityID, ErrEntityNotFound)
	}

	if fc, ok := body.GetComponent(ecs.ComponentTypeFacing); ok {
		fc.(*components.FacingComponent).Facing = components.Facing(facing)
		return nil
	}
	body.AddComponent(&components.FacingComponent{Facing: components.Facing(facing)})
	return nil
}
