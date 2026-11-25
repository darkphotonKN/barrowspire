package game

import (
	"errors"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// The use_item replies' refusal reasons, from which the client writes its own
// lines. FS-9JV5K §D R17; §Change: The Restoring Draught D4.
const (
	// RefusalNotPoisoned is an antidote used by a delver who is not poisoned
	RefusalNotPoisoned = "not_poisoned"
	// RefusalResourceFull is a Restoring Draught used by a delver whose class
	// resource is already at its max
	RefusalResourceFull = "resource_full"
	// RefusalNotInBag is a use of an item that is not in the user's bag
	RefusalNotInBag = "not_in_bag"
	// RefusalNotUsable is a use of a bag item that cannot be used
	RefusalNotUsable = "not_usable"
)

// useRefusals are the refusals the user is told of, with their message.
var useRefusals = map[error]struct{ reason, message string }{
	systems.ErrUseNotPoisoned:  {RefusalNotPoisoned, "you are not poisoned"},
	systems.ErrUseResourceFull: {RefusalResourceFull, "you are already full"},
	systems.ErrUseNotInBag:     {RefusalNotInBag, "that item is not in your bag"},
	systems.ErrUseNotUsable:    {RefusalNotUsable, "that item cannot be used"},
}

/**
* useItem applies a queued use_item on the tick: the user uses an item in their
* bag (an antidote ends their poison, a Restoring Draught refills half their
* class resource, and it is spent). Escape runs only, the user in play:
* elsewhere, and out of play, it is refused quietly, as a drink is. The user
* is replied { success: true }, or { success: false, reason } with nothing
* spent. FS-9JV5K §D R17; §Change: The Restoring Draught D3-D4.
**/
func (s *Session) useItem(playerID, itemID uuid.UUID) {
	if s.worldType != types.WorldTypeRun {
		slog.Debug("Refusing use_item outside a run", "session_id", s.ID, "player_id", playerID, "world_type", s.worldType)
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

	err := systems.NewPotionSystem(s.EntityManager).UseItem(delver, itemID)
	if errors.Is(err, systems.ErrUseOutOfPlay) {
		slog.Debug("Refusing use_item out of play", "session_id", s.ID, "player_id", playerID)
		return
	}
	if s.refuseUse(playerID, err) {
		return
	}
	if err != nil {
		slog.Error("use_item failed", "session_id", s.ID, "player_id", playerID, "item_entity_id", itemID, "error", err)
		return
	}

	slog.Info("Bag item used", "session_id", s.ID, "player_id", playerID, "item_entity_id", itemID)
	if err := s.sender.SendMessageToPlayer(playerID, types.Message{
		Action:  string(constants.ActionUseItem),
		Payload: map[string]interface{}{"success": true},
	}); err != nil {
		slog.Debug("Could not tell the user their item was used", "player_id", playerID, "error", err)
	}
}

// refuseUse replies the use_item refusal err stands for, false when err is
// none of them.
func (s *Session) refuseUse(playerID uuid.UUID, err error) bool {
	refusal, refused := useRefusals[err]
	if refused {
		s.sendRefusalToPlayer(playerID, string(constants.ActionUseItem), refusal.message, refusal.reason, nil)
	}
	return refused
}
