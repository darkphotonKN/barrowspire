package systems

import (
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* The rune (FS-X2CMM §E R24): the book effect a completed Binding Glyph lays,
* a ring of 0.75 cells at its point for 30 s. Each tick, before the monsters
* think, it stuns every living monster whose centre is inside it and that it
* has not yet caught, nearest first, through the one stun Earthbreaker lands
* (FS-04EEA §C), until it has caught three; on the third it goes. A monster
* already inside when it is laid is caught on its first tick.
**/

const (
	// runeSeconds is how long a rune lies laid uncaught (R24).
	runeSeconds = 30.0
	// runeRadiusCells is the ring's reach from its centre: 1.5 cells across.
	runeRadiusCells = 0.75
	// runeCatches is how many distinct monsters one rune holds before it goes.
	runeCatches = 3
	// runeStun is the stun a rune lands; a boss takes half (runeStunFor).
	runeStun = 4.0 // seconds
)

// resolveBindingGlyph lays a rune at the cast's point, its ring measured in
// the floor's cells the cast was judged in.
func resolveBindingGlyph(world *ecs.EntityManager, cast BookCast) {
	laid := SetDownBookEffect(world, components.BookEffectRune, cast.TargetX, cast.TargetY, runeSeconds, cast.Caster)
	laid.AddComponent(&components.RuneComponent{Radius: runeRadiusCells * cast.CellSize})
}

// catchOnRune stuns the monsters the rune catches on this tick, and takes the
// rune from the world once it has caught its three: true when it went. Any
// entity but a rune is passed over.
func (s *BookSystem) catchOnRune(entity *ecs.Entity, entities []*ecs.Entity) bool {
	rc, ok := entity.GetComponent(ecs.ComponentTypeRune)
	if !ok {
		return false
	}
	ring := rc.(*components.RuneComponent)
	at, ok := centreOf(entity)
	if !ok {
		return false
	}

	for _, held := range uncaughtInside(ring, at, entities) {
		if len(ring.Caught) == runeCatches {
			break
		}
		monster := held.monster
		stun(monster, runeStunFor(monster))
		ring.Caught = append(ring.Caught, held.entity.ID)
	}

	if len(ring.Caught) < runeCatches {
		return false
	}
	s.em.RemoveEntity(entity.ID)
	return true
}

// runeStunFor is how long a rune holds the monster: runeStun, halved on a
// boss as Earthbreaker's is (FS-04EEA §B R10).
func runeStunFor(monster *components.MonsterComponent) float64 {
	if monster.Boss {
		return runeStun / 2
	}
	return runeStun
}

// runeCandidate is a monster inside a rune, with how far its centre is from
// the rune's.
type runeCandidate struct {
	entity  *ecs.Entity
	monster *components.MonsterComponent
	dist    float64
}

// uncaughtInside is every living monster whose centre lies within the ring
// and that it has not caught, nearest first, so the catches a tick shares go
// to the nearest [derived].
func uncaughtInside(ring *components.RuneComponent, at *components.TransformComponent, entities []*ecs.Entity) []runeCandidate {
	var inside []runeCandidate
	for _, entity := range entities {
		mc, ok := entity.GetComponent(ecs.ComponentTypeEnemy)
		if !ok || !alive(entity) || slices.Contains(ring.Caught, entity.ID) {
			continue
		}
		centre, ok := centreOf(entity)
		if !ok {
			continue
		}
		if dist := math.Hypot(centre.X-at.X, centre.Y-at.Y); dist <= ring.Radius {
			inside = append(inside, runeCandidate{entity: entity, monster: mc.(*components.MonsterComponent), dist: dist})
		}
	}
	slices.SortFunc(inside, func(a, b runeCandidate) int {
		return nearerFirst(a.dist, a.entity.ID, b.dist, b.entity.ID)
	})
	return inside
}
