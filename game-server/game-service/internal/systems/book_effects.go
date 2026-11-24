package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* Book effects (FS-X2CMM §E, §F R34): what a completed book ability leaves on
* the floor, each an entity of its own with a place and a time left, sent to
* every recipient of the run. A page sets one down with SetDownBookEffect from
* its resolver; the BookSystem's Update runs every one down and takes it from
* the world once its time is up. None climbs: a floor change removes every
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
	if effect.Remaining -= deltaTime; effect.Remaining <= castEpsilon || houndDown(entity) {
		s.em.RemoveEntity(entity.ID)
	}
}
