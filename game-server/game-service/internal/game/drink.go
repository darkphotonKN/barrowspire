package game

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// Drink queues the member's drink of a health potion for the next tick. Every
// check is made there, against the world as it is then. FS-P9G8R §Requirements 4.
func (s *Session) Drink(playerID uuid.UUID) {
	s.queueIntent(func() { s.drinkPotion(playerID) })
}

// drinkPotion applies a queued drink on the tick. Escape runs only: the hub
// and the fields refuse it as silently as the run does (FS-P9G8R §Requirements 3).
func (s *Session) drinkPotion(playerID uuid.UUID) {
	if s.worldType != types.WorldTypeRun {
		slog.Debug("Refusing drink_potion outside a run", "session_id", s.ID, "player_id", playerID, "world_type", s.worldType)
		return
	}

	s.mu.RLock()
	entityID, here := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()
	if !here {
		return
	}
	delver, ok := s.EntityManager.GetEntity(entityID)
	if !ok {
		return
	}

	if err := systems.NewPotionSystem(s.EntityManager).Drink(delver); err != nil {
		slog.Debug("Refusing drink_potion", "session_id", s.ID, "player_id", playerID, "reason", err)
	}
}
