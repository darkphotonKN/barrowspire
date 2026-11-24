package systems

import (
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/**
* Cast time (FS-X2CMM §D). A page with a cast time is not resolved on the tick
* it is taken: its caster starts casting it (BookComponent.Casting), and the
* tick counts it in simulation time, after its movement and combat, as a timed
* open is counted (FS-MQYEX). Once the cast time has run out the page's cost
* and target are judged again; if they hold it is paid for and has its effect
* through the same resolve an instant page takes, else it ends with nothing.
*
* A cast breaks, with no effect, no cost and no cooldown, on the tick that
* finds its caster out of play or gone from the world, their body not where it
* stood when the cast was taken (whatever moved it), health lost to the tick's
* combat, or an attack or cast of theirs gone off in it (R18). A floor change
* ends it too (ReadyBookForNewFloor). A break is judged before the cast time's
* end: one on the last tick has no effect. Casting does not root (R20): walking
* is never refused, it breaks the cast.
**/

// castEpsilon absorbs the float error of counting a whole cast time in
// tick-sized steps, so 1 s of ticks always reaches it.
const castEpsilon = 1e-9

// castRangeSlackCells is how far past the page's range, in cells, a target
// may have shuffled by the cast's end and still count (R17).
const castRangeSlackCells = 1.0

// gateNotCasting: one cast at a time; a page cast while casting is refused,
// instant or not (R19).
func gateNotCasting(_ BookCast, book *components.BookComponent) error {
	if book.Casting != nil {
		return ErrAlreadyCasting
	}
	return nil
}

// startCasting begins the accepted cast from zero, where the caster stands
// now and with the health they hold now (R16).
func startCasting(cast BookCast, book *components.BookComponent) {
	casting := &components.BookCasting{
		Page:     cast.Page.ID,
		Total:    cast.Page.CastTime,
		TargetX:  cast.TargetX,
		TargetY:  cast.TargetY,
		CellSize: cast.CellSize,
	}
	if at, ok := centreOf(cast.Caster); ok {
		casting.FromX, casting.FromY = at.X, at.Y
	}
	if hc, ok := cast.Caster.GetComponent(ecs.ComponentTypeHealth); ok {
		casting.HealthBeforeCombat = hc.(*components.HealthComponent).CurrentHealth
	}
	if cast.Target != nil {
		casting.TargetID = cast.Target.ID
	}
	book.Casting = casting
}

// MarkHealth notes the health each casting delver takes into the tick's
// combat, the one place a hit costs health: AdvanceCasts, after it, reads a
// hit from the health that is missing. A heal earlier in the tick is already
// counted, so it neither hides a hit nor passes for one.
func (s *BookSystem) MarkHealth(entities []*ecs.Entity) {
	for _, entity := range entities {
		book, ok := bookOf(entity)
		if !ok || book.Casting == nil {
			continue
		}
		if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok {
			book.Casting.HealthBeforeCombat = hc.(*components.HealthComponent).CurrentHealth
		}
	}
}

// AdvanceCasts is the tick on every cast in progress, after the tick's
// movement and combat: a broken one ends with nothing, one whose cast time
// has run out completes (R17), the rest count the tick. attackers is the
// bodies whose attack or cast went off in the tick's combat
// (CombatSystem.Attackers); walkable judges a ground page's point again.
func (s *BookSystem) AdvanceCasts(deltaTime float64, entities []*ecs.Entity, attackers []uuid.UUID, walkable func(x, y float64) bool) {
	for _, entity := range entities {
		book, ok := bookOf(entity)
		if !ok || book.Casting == nil {
			continue
		}
		casting := book.Casting
		if s.castBroken(entity, casting, slices.Contains(attackers, entity.ID)) {
			book.Casting = nil
			continue
		}
		if casting.Elapsed >= casting.Total-castEpsilon {
			book.Casting = nil
			s.complete(entity, book, casting, walkable)
			continue
		}
		casting.Elapsed += deltaTime
	}
}

// castBroken is whether the tick's movement and combat broke the caster's
// cast; attacked is whether an attack or cast of theirs went off in it (R18).
func (s *BookSystem) castBroken(caster *ecs.Entity, casting *components.BookCasting, attacked bool) bool {
	if !InPlay(caster) {
		return true
	}
	// the tick's entities were read before its intents took the body out
	if _, stands := s.em.GetEntity(caster.ID); !stands {
		return true
	}
	if at, ok := centreOf(caster); ok && (at.X != casting.FromX || at.Y != casting.FromY) {
		return true
	}
	if hc, ok := caster.GetComponent(ecs.ComponentTypeHealth); ok &&
		hc.(*components.HealthComponent).CurrentHealth < casting.HealthBeforeCombat {
		return true
	}
	return attacked
}

// complete judges the page's cost and target once more, the target within
// range plus one cell, and, if they hold, pays for the page and has its
// effect; if not, the cast ends with nothing (R17).
func (s *BookSystem) complete(caster *ecs.Entity, book *components.BookComponent, casting *components.BookCasting, walkable func(x, y float64) bool) {
	page, ok := classBooks[casting.Page]
	if !ok {
		return
	}
	cast := BookCast{
		Caster:   caster,
		Page:     page,
		TargetX:  casting.TargetX,
		TargetY:  casting.TargetY,
		Target:   s.castTarget(casting.TargetID),
		CellSize: casting.CellSize,
		Walkable: walkable,
	}
	recheck := cast
	recheck.Page.RangeCells += castRangeSlackCells
	for _, gate := range []bookGate{gateInPlay, gateCost, gateTarget} {
		if gate(recheck, book) != nil {
			return
		}
	}
	s.resolve(cast, book)
}

// castTarget is the entity a cast named, nil when it named none or it is gone.
func (s *BookSystem) castTarget(id uuid.UUID) *ecs.Entity {
	if id == uuid.Nil {
		return nil
	}
	target, ok := s.em.GetEntity(id)
	if !ok {
		return nil
	}
	return target
}

// PointInWall is whether (x, y) lies inside a wall's rect, top-left corner
// in, the far edges out: no ground for a page's point (R14).
func PointInWall(entities []*ecs.Entity, x, y float64) bool {
	for _, entity := range entities {
		wall, ok := blockerOf(entity, ecs.ComponentTypeWall)
		if ok && x >= wall.x && x < wall.x+wall.w && y >= wall.y && y < wall.y+wall.h {
			return true
		}
	}
	return false
}
