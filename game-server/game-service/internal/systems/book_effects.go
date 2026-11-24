package systems

import (
	"bytes"
	"cmp"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/**
* Book effects (FS-X2CMM §E, §F R34): what a completed book ability leaves on
* the floor, each an entity of its own with a place and a time left, sent to
* every recipient of the run. A page sets one down with SetDownBookEffect from
* its resolver; the BookSystem's Update runs every one down (ageBookEffects)
* and takes it from the world once its time is up. None climbs: a floor change removes every
* entity but the party's (persistentEntityIDs), and these with them.
*
* A new kind is a BookEffectKind, a resolver that sets it down, and, when it
* does more than stand there (a rune's catch, a hound's bite and heel), its own
* step.
**/

// witchlightSeconds is how long a Witchlight's light stands (R21).
const witchlightSeconds = 20.0

// resolveWitchlight sets down a witchlight at the cast's point. It does not
// move on the server (its drift is drawn); any number may stand (R21).
func resolveWitchlight(world *ecs.EntityManager, cast BookCast) {
	SetDownBookEffect(world, components.BookEffectWitchlight, cast.TargetX, cast.TargetY, witchlightSeconds, cast.Caster)
}

// SetDownBookEffect puts a book effect of the kind on the floor at (x, y) for
// the seconds given, set down by the caster.
func SetDownBookEffect(world *ecs.EntityManager, kind components.BookEffectKind, x, y, seconds float64, caster *ecs.Entity) *ecs.Entity {
	effect := world.CreateEntity()
	effect.AddComponent(components.NewTransformComponent(x, y))
	effect.AddComponent(&components.BookEffectComponent{Kind: kind, Remaining: seconds, CasterID: caster.ID})
	return effect
}

// ageBookEffects is the tick on the floor's book effects: a rune first
// catches what stands on it, and goes on its third catch; every effect is then
// run down, and taken from the world once its time is up (a hound too at no
// health).
func (s *BookSystem) ageBookEffects(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		if s.catchOnRune(entity, entities) {
			continue // spent on its third catch, and gone
		}
		s.ageBookEffect(entity, deltaTime)
	}
}

// ageBookEffect runs a book effect down by the tick and takes it from the
// world once its time is up, or a hound once it is at no health, its one state
// as dead sent (book_hound.go); a draught, and anything else, is passed over.
func (s *BookSystem) ageBookEffect(entity *ecs.Entity, deltaTime float64) {
	ec, ok := entity.GetComponent(ecs.ComponentTypeBookEffect)
	if !ok {
		return
	}
	effect := ec.(*components.BookEffectComponent)
	if effect.Kind == components.BookEffectDraught {
		return // no time of its own: it stands until drunk or the floor ends
	}
	if effect.Remaining -= deltaTime; timeUp(effect) || houndDown(entity) {
		s.em.RemoveEntity(entity.ID)
	}
}

// BookEffectExpired is whether the entity is a book effect that is gone: its
// time up, or a rune that has caught its three. Either is taken from the world
// during the tick yet still among the tick's entities, so nothing that runs on
// them after (a hound's bite and heel, a monster's quarry, the state sent) may
// count it. A draught has no time of its own and never expires.
func BookEffectExpired(entity *ecs.Entity) bool {
	ec, ok := entity.GetComponent(ecs.ComponentTypeBookEffect)
	return ok && (timeUp(ec.(*components.BookEffectComponent)) || runeSpent(entity))
}

// runeSpent is whether the entity is a rune that has caught all it holds.
func runeSpent(entity *ecs.Entity) bool {
	rc, ok := entity.GetComponent(ecs.ComponentTypeRune)
	return ok && len(rc.(*components.RuneComponent).Caught) >= runeCatches
}

// timeUp is whether a timed book effect has run its time out.
func timeUp(effect *components.BookEffectComponent) bool {
	return effect.Kind != components.BookEffectDraught && effect.Remaining <= castEpsilon
}

// nearerFirst orders two monsters a book effect may act on, a at da and b at
// db from it: the nearer first, and at a tie the lower entity id, so the
// choice never falls to the order a map gives. A rune's catches and a hound's
// prey are both chosen by it.
func nearerFirst(da float64, a uuid.UUID, db float64, b uuid.UUID) int {
	return cmp.Or(cmp.Compare(da, db), bytes.Compare(a[:], b[:]))
}
