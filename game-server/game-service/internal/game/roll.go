package game

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* roll applies a queued roll on the tick: the delver rolls along (dirX, dirY).
* Escape runs only; anywhere else, and whatever StartRoll refuses (out of play,
* inside the roll cooldown, already rolling, a charge in flight, a bad
* heading), it is refused silently, nothing spent and nothing sent back.
* FS-7P736 §A R1–R2, R6.
**/
func (s *Session) roll(playerID uuid.UUID, dirX, dirY float64) {
	if s.worldType != types.WorldTypeRun {
		slog.Debug("Refusing a roll outside a run", "session_id", s.ID, "player_id", playerID, "world_type", s.worldType)
		return
	}
	delver, ok := s.delverBody(playerID)
	if !ok {
		return
	}
	if !systems.StartRoll(delver, dirX, dirY) {
		slog.Debug("Refusing a roll", "session_id", s.ID, "player_id", playerID)
	}
}

// rolling is whether the player's delver is rolling: while they are, an
// attack, an ability, a page cast or an interact they send is dropped as it
// arrives, never queued for after. FS-7P736 §A R8.
func (s *Session) rolling(playerID uuid.UUID) bool {
	delver, ok := s.delverBody(playerID)
	return ok && systems.Rolling(delver)
}

// delverBody is the player's body in this world, false when they have none.
func (s *Session) delverBody(playerID uuid.UUID) (*ecs.Entity, bool) {
	s.mu.RLock()
	entityID, here := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()
	if !here {
		return nil, false
	}
	return s.EntityManager.GetEntity(entityID)
}
