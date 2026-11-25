package game

import (
	"errors"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* Far Hand's reach (FS-X2CMM §J R50 as reconciled at wave 2), the entry point
* the book's FarReach port names. The page has judged its target (a lever or
* bridge lever still up, a shut chest or sack, a floor door, a detected and
* armed trap: systems/book_far_hand.go); this works it.
*
* Anything but a trap is the mage's own interact, run through the very branch
* an E press takes, with its reach measured from the target's own middle, so
* from beside it: a lever pulled out of turn darts the mage, a lever's ambush
* wakes on them, a guarded chest is refused, and the world's answers come on
* the interact's reply as they would to an E press. A shut chest or sack
* starts the mage's timed open (FS-MQYEX), counted where the mage stands:
* moving, a hit or an attack of theirs cancels it, as it would at the chest.
* A trap is sprung as if stepped on with no body on its cell.
**/

// ErrTrapNotSprung is a Far Hand on a trap that was not armed by the time it
// was worked.
var ErrTrapNotSprung = errors.New("the trap is not armed")

// ReachFar works target for worker as if they had interacted with it standing
// beside it, or springs it, a trap. systems.FarReach.
func (s *Session) ReachFar(worker uuid.UUID, target *ecs.Entity) error {
	if target.HasComponent(ecs.ComponentTypeTrap) {
		s.mu.RLock()
		entityID := s.playerIDToEntitiesID[worker]
		s.mu.RUnlock()
		by, ok := s.EntityManager.GetEntity(entityID)
		if !ok {
			return ErrEntityNotFound
		}
		if !s.springTrap(target, by) {
			return ErrTrapNotSprung
		}
		return nil
	}
	x, y, ok := systems.TargetMiddle(target)
	if !ok {
		return ErrEntityNotFound
	}
	return s.interactFrom(worker, target.ID, components.NewTransformComponent(x, y))
}
