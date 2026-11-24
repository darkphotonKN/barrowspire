package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/**
* The Scar of the Long Night gives the warrior long night for 6 s. While it
* runs every living monster within 5 cells of the warrior, there when it
* starts or come since, takes the warrior as its target and holds them as a
* retaliation is held, past its leash; and every hit on the warrior deals 30 %
* less. A stunned monster stays stunned. When it ends, monsters choose their
* targets as they normally do. FS-X2CMM §E R31.
*
* Two hooks read the warrior's book, once each: the monster AI's taunt, before
* a monster settles its target (MonsterAISystem.think), and the cut, where a
* hit's damage is taken (CombatSystem.applyHit). Never last_stand: that is the
* Guardian's saving rule.
**/

const (
	// longNightSeconds is how long the Long Night lasts.
	longNightSeconds = 6.0
	// longNightCells is how near a monster must come to be turned.
	longNightCells = 5.0
	// longNightCut is the share of every hit the warrior is spared.
	longNightCut = 0.30
)

// resolveLongNight sets long night on the warrior, its reach measured in the
// cast's floor cell.
func resolveLongNight(_ *ecs.EntityManager, cast BookCast) {
	if book, ok := bookOf(cast.Caster); ok {
		book.LongNightReach = longNightCells * cast.CellSize
	}
	setBookState(cast.Caster, components.BookStateLongNight, longNightSeconds)
}

// longNight is a warrior in play under the Long Night, as the monsters read
// them this tick: who and where, and how far they turn monsters.
type longNight struct {
	quarry
	reach float64
}

// longNights appends every warrior in play under the Long Night to dst.
func longNights(dst []longNight, entities []*ecs.Entity) []longNight {
	for _, entity := range entities {
		book, ok := bookOf(entity)
		if !ok || !nightRuns(book) || !InPlay(entity) {
			continue
		}
		if at, ok := centreOf(entity); ok {
			dst = append(dst, longNight{quarry: quarry{id: entity.ID, at: at}, reach: book.LongNightReach})
		}
	}
	return dst
}

// taunt turns the monster on a warrior under the Long Night before it settles
// its target: the one it already holds, else the nearest within whose reach it
// stands. It holds them as a retaliation is, so its leash does not drop them
// while the night runs. A stun is left as it is: the monster takes the target
// and stands.
func (s *MonsterAISystem) taunt(monster *components.MonsterComponent, at *components.TransformComponent) {
	warrior, ok := heldNight(monster.Target, s.nights)
	if !ok {
		warrior, ok = nearestNight(at, s.nights)
	}
	if !ok {
		return
	}
	if monster.Target != warrior.id {
		monster.Target = warrior.id
		// a new target, as target() takes one: somewhere fresh, no stale path
		monster.Wander = components.Wandering{}
		forget(&monster.Route)
	}
	monster.Retaliating = true
}

// heldNight is the warrior under the night the monster already holds.
func heldNight(target uuid.UUID, nights []longNight) (longNight, bool) {
	for _, night := range nights {
		if night.id == target {
			return night, true
		}
	}
	return longNight{}, false
}

// nearestNight is the nearest warrior under the night whose reach at lies
// within.
func nearestNight(at *components.TransformComponent, nights []longNight) (longNight, bool) {
	var best longNight
	bestDistance := math.Inf(1)
	for _, night := range nights {
		if d := distance(at, night.at); d <= night.reach && d < bestDistance {
			best, bestDistance = night, d
		}
	}
	return best, !math.IsInf(bestDistance, 1)
}

// underLongNight is what a hit of damage takes from the target under the Long
// Night: 30 % less. Anyone else, and a hit of nothing, it leaves whole.
func underLongNight(target *ecs.Entity, damage int) int {
	if book, ok := bookOf(target); !ok || !nightRuns(book) || damage <= 0 {
		return damage
	}
	return ReducedDamage(damage, longNightCut)
}

// nightRuns is whether the book's Long Night is running.
func nightRuns(book *components.BookComponent) bool {
	_, on := book.States[components.BookStateLongNight]
	return on
}
