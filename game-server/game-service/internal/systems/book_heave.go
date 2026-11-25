package systems

import (
	"errors"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* Heave (the Scar of the Gate) shoves an adjacent stone block one full cell
* directly away from the warrior, as a walked push would take it: along the
* axis the warrior stands most along from the block's centre, along the row
* on an exact diagonal. The Spire's push rule judges the cell (refused: rock,
* a shut barrier, another block, a body, out of the block's plates room), at
* the cast and again at its completion; a shove refused at completion ends
* the cast with nothing, as any target that no longer holds. The block then
* lands as a push lands (ShoveStoneBlock), the warrior its pusher, so a plate
* it comes to rest on is held on the warrior's account.
*
* There is no jammed portcullis to force: the gate opens only by its seals
* (ADR-0092). FS-X2CMM §B R12, §J R52 as reconciled at wave 2.
**/

// ErrBlockWontShove is a Heave whose block may not go the way it is shoved.
var ErrBlockWontShove = errors.New("the stone block may not be shoved that way")

// isStoneBlock is whether e is a stone block, Heave's one target
// (pageInteractables), judged with the page's range before gateHeave.
func isStoneBlock(e *ecs.Entity) bool {
	return e.HasComponent(ecs.ComponentTypeStoneBlock)
}

// gateHeave is Heave's own condition, its target a stone block in range
// already: the cell beyond it, away from the warrior, one a push may take it
// to over the floor's cells.
func gateHeave(world *ecs.EntityManager, cast BookCast) error {
	dx, dy, ok := heaveWay(cast)
	if !ok || !StoneBlockShovable(cast.Cells, cast.Target, dx, dy, world.GetAllEntities()) {
		return ErrBlockWontShove
	}
	return nil
}

// resolveHeave shoves the block, gateHeave having passed on this tick.
func resolveHeave(world *ecs.EntityManager, cast BookCast) {
	if dx, dy, ok := heaveWay(cast); ok {
		ShoveStoneBlock(cast.Cells, cast.Target, dx, dy, cast.Caster.ID, world.GetAllEntities())
	}
}

// heaveWay is the unit step away from the warrior that the block is shoved:
// along x when the warrior stands at least as far off along x as along y,
// else along y. False with the warrior on the block's centre.
func heaveWay(cast BookCast) (dx, dy int, ok bool) {
	from, placed := bodyCentre(cast.Caster)
	to, standing := bodyCentre(cast.Target)
	if !placed || !standing {
		return 0, 0, false
	}
	offX, offY := to.X-from.X, to.Y-from.Y
	switch {
	case offX == 0 && offY == 0:
		return 0, 0, false
	case math.Abs(offX) >= math.Abs(offY):
		return int(math.Copysign(1, offX)), 0, true
	default:
		return 0, int(math.Copysign(1, offY)), true
	}
}
