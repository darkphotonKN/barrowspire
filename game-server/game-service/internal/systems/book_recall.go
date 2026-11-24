package systems

import (
	"cmp"
	"log/slog"
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* Recall (FS-X2CMM §E R25). A completed Recall stands every other delver in
* play on the floor (living, not escaped, not left behind) on a free spot
* within 2 cells of the mage, nearest first. A spot is free when a straight
* move from the mage reaches it, as a blink's does (so never in a wall, on
* rock or past a wall), and no body stands on it: the mage, a monster, or a
* teammate already landed. The spots are rings round the mage, a body's
* width out and then a radius further each ring, so the nearest teammate takes
* the nearest spot. A teammate with no free spot stays where they are.
*
* A recalled teammate's charge in flight ends where they stood, and their own
* timed open and cast break: they moved. With no one to pull the cast is
* refused, and a cast whose teammates all fell or left by its end ends with
* nothing (R17), so a solo mage never wastes the floor's use.
**/

// recallReachCells is how far from the mage a teammate may land, in cells.
const recallReachCells = 2.0

// bodyEpsilon keeps two bodies a body's width apart, to the float, from
// counting as one on the other.
const bodyEpsilon = 1e-6

// gateSomeoneToPull refuses a Recall with no teammate in play on the floor.
func gateSomeoneToPull(world *ecs.EntityManager, cast BookCast) error {
	if len(teammatesOf(world.GetAllEntities(), cast.Caster)) == 0 {
		return ErrNoOneToPull
	}
	return nil
}

// resolveRecall stands each teammate on the nearest free spot round the mage,
// the nearest teammate first.
func resolveRecall(world *ecs.EntityManager, cast BookCast) {
	from, ok := centreOf(cast.Caster)
	if !ok {
		return
	}
	entities := world.GetAllEntities()
	spots := recallSpots(from.X, from.Y, cast.CellSize)
	for _, mate := range teammatesOf(entities, cast.Caster) {
		x, y, ok := landing(entities, mate, from, spots, cast.Ground)
		if !ok {
			slog.Warn("Recall left a teammate where they stood: no free spot near the mage", "caster_entity_id", cast.Caster.ID, "teammate_entity_id", mate.ID)
			continue
		}
		pull(mate, x, y, cast.EndCharge)
	}
}

// teammatesOf is every delver in play but the caster, the nearest first, ties
// by entity id so a Recall lands the same way every time.
func teammatesOf(entities []*ecs.Entity, caster *ecs.Entity) []*ecs.Entity {
	from, ok := centreOf(caster)
	if !ok {
		return nil
	}
	var mates []*ecs.Entity
	for _, entity := range entities {
		if entity.ID != caster.ID && InPlay(entity) && entity.HasComponent(ecs.ComponentTypeTransform) {
			mates = append(mates, entity)
		}
	}
	away := func(e *ecs.Entity) float64 {
		at, _ := centreOf(e)
		return math.Hypot(at.X-from.X, at.Y-from.Y)
	}
	slices.SortFunc(mates, func(a, b *ecs.Entity) int {
		return cmp.Or(cmp.Compare(away(a), away(b)), cmp.Compare(a.ID.String(), b.ID.String()))
	})
	return mates
}

// recallSpots are the points a teammate may land on round (x, y), nearest
// first: rings from a body's width out to recallReachCells, a radius apart,
// each with a spot every radius along it.
func recallSpots(x, y, cellSize float64) [][2]float64 {
	r := constants.PlayerRadius
	var spots [][2]float64
	for ring := 2 * r; ring <= recallReachCells*cellSize+bodyEpsilon; ring += r {
		n := int(math.Ceil(2 * math.Pi * ring / r))
		for k := range n {
			turn := 2 * math.Pi * float64(k) / float64(n)
			spots = append(spots, [2]float64{x + ring*math.Cos(turn), y + ring*math.Sin(turn)})
		}
	}
	return spots
}

// landing is the first spot no body but mate's stands on and a straight move
// from the mage reaches; false when none is.
func landing(entities []*ecs.Entity, mate *ecs.Entity, from *components.TransformComponent, spots [][2]float64, ground Ground) (x, y float64, ok bool) {
	if ground == nil {
		return 0, 0, false
	}
	for _, spot := range spots {
		if bodyOn(entities, mate, spot[0], spot[1]) {
			continue
		}
		rx, ry := ground.Reach(entities, from.X, from.Y, spot[0], spot[1])
		if math.Hypot(rx-spot[0], ry-spot[1]) <= bodyEpsilon {
			return spot[0], spot[1], true
		}
	}
	return 0, 0, false
}

// bodyOn is whether a body other than mate's stands within a body's width of
// (x, y). A body is what the walk collides with (MovementSystem.update): a
// thing with a place that walks or charges, never a projectile nor a delver
// out of play.
func bodyOn(entities []*ecs.Entity, mate *ecs.Entity, x, y float64) bool {
	for _, entity := range entities {
		if entity.ID == mate.ID || entity.HasComponent(ecs.ComponentTypeProjectile) {
			continue
		}
		if !entity.HasComponent(ecs.ComponentTypeVelocity) && !entity.HasComponent(ecs.ComponentTypeDash) {
			continue
		}
		if entity.HasComponent(ecs.ComponentTypePlayer) && !InPlay(entity) {
			continue
		}
		at, ok := centreOf(entity)
		if ok && math.Hypot(at.X-x, at.Y-y) < 2*constants.PlayerRadius-bodyEpsilon {
			return true
		}
	}
	return false
}

// pull moves the teammate to (x, y): a charge in flight ends where they stood
// first, and their timed open and cast break.
func pull(mate *ecs.Entity, x, y float64, endCharge func(*ecs.Entity)) {
	if endCharge != nil {
		endCharge(mate)
	}
	mate.RemoveComponent(ecs.ComponentTypeDash)
	mate.RemoveComponent(ecs.ComponentTypeTimedOpen)
	if book, ok := bookOf(mate); ok {
		book.Casting = nil
	}
	at, _ := centreOf(mate)
	at.X, at.Y = x, y
}
