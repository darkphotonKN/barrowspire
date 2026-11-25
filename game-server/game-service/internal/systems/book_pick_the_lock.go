package systems

import (
	"errors"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/**
* Pick the Lock (FS-X2CMM §B R11, §J R55 as reconciled at wave 2). The
* mercenary's page opens an adjacent cage without its key, as FS-4EC7Z's
* open-cage entry point does (game/captives.go OpenCage): the sealed floors
* built no locked doors and no locked chests, so a shut cage is its only
* target, judged at the cast and again at completion (R17): by the book at
* the cast, by the entry point at completion, so a cage its key opened during
* the cast is told cage_open. The book reaches the entry point through
* CageOpener, which the session supplies in the page's PageEntryPoints, so
* this package never knows the session. It is had when the 4 s cast
* completes, before the page is paid for, so a refusal by the world (too many
* allies, a cage its key opened meanwhile) spends nothing.
**/

// ErrNoCages refuses a Pick the Lock in a world that supplies no open-cage
// entry point.
var ErrNoCages = errors.New("the world opens no cage")

// CageOpener is the world's open-cage entry point: it opens the cage cage
// without its key for opener, a member id, freeing its captives as their
// allies, or refuses with the cage left shut. FS-4EC7Z §D R13.
type CageOpener interface {
	OpenCage(cage, opener uuid.UUID) error
}

// enterPickTheLock has Pick the Lock's effect: the world opens the cage for
// the caster, or its refusal comes back as the cast's.
func enterPickTheLock(cast BookCast) error {
	if cast.Cages == nil {
		return ErrNoCages
	}
	return cast.Cages.OpenCage(cast.Target.ID, memberIDOf(cast.Caster))
}

// isCage is whether e is a cage, Pick the Lock's one target.
func isCage(e *ecs.Entity) bool {
	return e.HasComponent(ecs.ComponentTypeCage)
}

// gateShutCage refuses a Pick the Lock on a cage already open, so the 4 s
// are never spent on one. Judged at the cast only (pageCastGates): a cage its
// key opens during the cast is refused at completion by the world's
// open-cage entry point, cage_open, and the caster is told.
func gateShutCage(_ *ecs.EntityManager, cast BookCast) error {
	if cc, ok := cast.Target.GetComponent(ecs.ComponentTypeCage); ok && cc.(*components.CageComponent).Open {
		return ErrBadPageTarget
	}
	return nil
}
