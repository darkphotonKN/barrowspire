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
* A trap is sprung as if stepped on with no body on its cell. Nothing else
* is worked: the reach refuses any other branch itself (farHandWorks), so a
* change to the page's target rule never opens the stairs or the escape door
* to it.
**/

// ErrTrapNotSprung is a Far Hand on a trap that was not armed by the time it
// was worked.
var ErrTrapNotSprung = errors.New("the trap is not armed")

// ErrNoFarHandWork is a far reach at a target that takes none of the interact
// branches Far Hand works.
var ErrNoFarHandWork = errors.New("far hand works no such target")

// ReachFar works target for worker as if they had interacted with it standing
// beside it, or springs it, a trap. systems.FarReach. Only the branches Far
// Hand works are run (farHandWorks), so the stairs, the escape door or any
// other branch is never taken from afar, whatever the page's own target rule
// lets through.
func (s *Session) ReachFar(worker uuid.UUID, target *ecs.Entity) error {
	if !farHandWorks(target) {
		return ErrNoFarHandWork
	}
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

// farHandWorks is whether target takes one of the interact branches Far Hand
// works: a trap, a container, a floor door (never a barrier, the gate or a
// secret door) or a lever or the bridge lever (never a block). The branch's
// own state (a lever already down, a chest open) is the branch's to judge.
func farHandWorks(target *ecs.Entity) bool {
	switch {
	case target.HasComponent(ecs.ComponentTypeStairs), target.HasComponent(ecs.ComponentTypeEscapeDoor):
		return false
	case target.HasComponent(ecs.ComponentTypeTrap), target.HasComponent(ecs.ComponentTypeContainer):
		return true
	case target.HasComponent(ecs.ComponentTypeSealPiece):
		pc, _ := target.GetComponent(ecs.ComponentTypeSealPiece)
		kind := pc.(*components.SealPieceComponent).Kind
		lever := kind == components.SealPieceLever || kind == components.SealPieceBridgeLever
		return lever && !target.HasComponent(ecs.ComponentTypeStoneBlock)
	case target.HasComponent(ecs.ComponentTypeDoor):
		return !target.HasComponent(ecs.ComponentTypeBarrier)
	}
	return false
}
