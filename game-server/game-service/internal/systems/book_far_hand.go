package systems

import (
	"errors"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/**
* Far Hand (FS-X2CMM §B R9, §J R50 as reconciled at wave 2). The mage's page
* works its target within 6 cells as if the mage had interacted with it
* standing beside it, or springs a detected trap. What working it does is the
* session's interact (game/class_book_far_hand.go): the book reaches it through
* FarReach, the one entry point the session supplies in the page's
* PageEntryPoints, so this package never knows the session. It is had when the 1 s cast completes,
* before the page is paid for, so a refusal by the world spends nothing.
*
* The targets are named here, and nothing else is one: a lever or the bridge
* lever still up, a shut chest or sack, a floor door (shut or open: an interact
* toggles it) and a detected trap still armed. A plate takes no interact (it
* is held by weight), and a stone block, a brazier, the stair key, stairs, the
* escape door, an altar, a tome, a merchant, a barrier (the gate, a secret
* door), a cage, an encounter NPC and a lore piece are no Far Hand target. The
* rule is judged at the cast and again at completion (R17).
**/

// ErrNoFarReach refuses a Far Hand in a world that supplies no far reach.
var ErrNoFarReach = errors.New("the world takes no interact from a distance")

// FarReach is the world's interact from a distance: it works target for
// worker, a member id, as if they had interacted with it standing beside it,
// or springs a trap at them, or refuses with nothing worked.
type FarReach interface {
	ReachFar(worker uuid.UUID, target *ecs.Entity) error
}

// enterFarHand has Far Hand's effect: the world works the target for the
// caster, or its refusal comes back as the cast's.
func enterFarHand(cast BookCast) error {
	if cast.FarReach == nil {
		return ErrNoFarReach
	}
	return cast.FarReach.ReachFar(memberIDOf(cast.Caster), cast.Target)
}

// farHandTarget is whether Far Hand may name e.
func farHandTarget(e *ecs.Entity) bool {
	switch {
	case e.HasComponent(ecs.ComponentTypeTrap):
		return springable(e)
	case e.HasComponent(ecs.ComponentTypeSealPiece):
		pc, _ := e.GetComponent(ecs.ComponentTypeSealPiece)
		piece := pc.(*components.SealPieceComponent)
		lever := piece.Kind == components.SealPieceLever || piece.Kind == components.SealPieceBridgeLever
		return lever && !piece.Active && !e.HasComponent(ecs.ComponentTypeStoneBlock)
	case e.HasComponent(ecs.ComponentTypeContainer):
		oc, ok := e.GetComponent(ecs.ComponentTypeOpenable)
		return ok && !oc.(*components.OpenableComponent).IsOpen
	case e.HasComponent(ecs.ComponentTypeDoor):
		// a barrier is a door to the walk, never one a delver toggles
		return !e.HasComponent(ecs.ComponentTypeBarrier) && e.HasComponent(ecs.ComponentTypeOpenable)
	}
	return false
}

// springable is whether a trap may be sprung from afar: detected for the
// party and armed (a gas vent always is).
func springable(e *ecs.Entity) bool {
	tc, _ := e.GetComponent(ecs.ComponentTypeTrap)
	dc, ok := e.GetComponent(ecs.ComponentTypeDetectable)
	return ok && dc.(*components.DetectableComponent).Detected && tc.(*components.TrapComponent).Armed
}
