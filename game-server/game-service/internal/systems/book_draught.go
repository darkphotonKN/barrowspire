package systems

import (
	"errors"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* The draught (FS-X2CMM §E R27): the book effect a completed Brew sets at the
* archer's feet. It has no time of its own: it stands until a delver of the
* run drinks it, by interacting with it within the interact reach, or until
* the floor ends. Drinking takes it from the world, cures the drinker's poison
* (§J R54, through CurePoison) and heals the drinker 30 % of their max health
* over 6 s, an even part each tick, never above max; a second draught drunk
* during a heal restarts it at the new full amount.
*
* The heal is the drinker's: the book's draught state times it, and their
* DraughtHealComponent counts what it has given. The BookSystem's Update gives
* each part (healDraughts).
* Not a health potion (carried, key 1).
**/

// Why a drink of a draught is refused. The session answers the reach as any
// interact out of reach is answered; the rest go quietly.
var (
	ErrNotADraught       = errors.New("not a draught")
	ErrDrinkerOutOfPlay  = errors.New("drinker not in play")
	ErrDraughtOutOfReach = errors.New("draught out of the interact reach")
)

const (
	// draughtSeconds is how long a draught's heal runs.
	draughtSeconds = 6.0
	// draughtShare is the share of the drinker's max health it heals.
	draughtShare = 0.30
)

// resolveBrew sets a draught down at the archer's feet, where they stand as
// the cast completes.
func resolveBrew(world *ecs.EntityManager, cast BookCast) {
	at, ok := bodyCentre(cast.Caster)
	if !ok {
		return
	}
	SetDownBookEffect(world, components.BookEffectDraught, at.X, at.Y, 0, cast.Caster)
}

// IsDraught is whether the entity is a draught standing on the floor.
func IsDraught(entity *ecs.Entity) bool {
	kind, ok := bookEffectKind(entity)
	return ok && kind == components.BookEffectDraught
}

// DrinkDraught has the drinker drink the draught: taken from the world, the
// drinker's poison cured, and its heal started on the drinker, or restarted at
// the full amount over one already running. A refused drink leaves both as
// they were.
func (s *BookSystem) DrinkDraught(drinker, draught *ecs.Entity) error {
	if !IsDraught(draught) {
		return ErrNotADraught
	}
	if !InPlay(drinker) {
		return ErrDrinkerOutOfPlay
	}
	book, ok := bookOf(drinker)
	if !ok {
		return ErrDrinkerOutOfPlay
	}
	from, ok := bodyCentre(drinker)
	if !ok {
		return ErrDraughtOutOfReach
	}
	at, ok := bodyCentre(draught)
	if !ok || !WithinInteractRange(from.X, from.Y, at.X, at.Y) {
		return ErrDraughtOutOfReach
	}

	hc, _ := drinker.GetComponent(ecs.ComponentTypeHealth)
	drinker.AddComponent(&components.DraughtHealComponent{Amount: whole(float64(hc.(*components.HealthComponent).MaxHealth) * draughtShare)})
	book.States[components.BookStateDraught] = draughtSeconds
	CurePoison(drinker)
	s.em.RemoveEntity(draught.ID)
	return nil
}

// healDraughts gives every drinker this tick's part of their draught's heal.
// It runs before the books' states count down.
func (s *BookSystem) healDraughts(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		if dc, ok := entity.GetComponent(ecs.ComponentTypeDraughtHeal); ok {
			healDraught(entity, dc.(*components.DraughtHealComponent), deltaTime)
		}
	}
}

// healDraught gives the delver this tick's part of a draught's heal: what is
// due by the time run so far, less what it has given, never above max. The
// last part ends the heal and its state, so the whole amount is given in its
// 6 s.
func healDraught(entity *ecs.Entity, heal *components.DraughtHealComponent, deltaTime float64) {
	book, ok := bookOf(entity)
	left, on := 0.0, false
	if ok {
		left, on = book.States[components.BookStateDraught]
	}
	if !on {
		entity.RemoveComponent(ecs.ComponentTypeDraughtHeal)
		return
	}

	due := heal.Amount
	if left -= deltaTime; left > castEpsilon {
		due = whole(float64(heal.Amount) * (draughtSeconds - left) / draughtSeconds)
	} else {
		entity.RemoveComponent(ecs.ComponentTypeDraughtHeal)
		delete(book.States, components.BookStateDraught)
	}

	part := due - heal.Given
	heal.Given = due
	hc, ok := entity.GetComponent(ecs.ComponentTypeHealth)
	if !ok || !InPlay(entity) {
		return // a fallen or escaped drinker's heal runs out unspent
	}
	health := hc.(*components.HealthComponent)
	health.CurrentHealth = min(health.CurrentHealth+part, health.MaxHealth)
}

// bookEffectKind is the kind of book effect the entity is, false for anything
// else.
func bookEffectKind(entity *ecs.Entity) (components.BookEffectKind, bool) {
	if entity == nil {
		return "", false
	}
	ec, ok := entity.GetComponent(ecs.ComponentTypeBookEffect)
	if !ok {
		return "", false
	}
	return ec.(*components.BookEffectComponent).Kind, true
}
