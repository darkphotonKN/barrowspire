package systems

import (
	"errors"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// Why a use_item is refused. A refused use spends nothing. FS-9JV5K §D R17;
// §Change: The Restoring Draught D4.
var (
	ErrUseOutOfPlay    = errors.New("delver is out of play")
	ErrUseNotInBag     = errors.New("item is not in the delver's bag")
	ErrUseNotUsable    = errors.New("item is not usable")
	ErrUseNotPoisoned  = errors.New("delver is not poisoned")
	ErrUseResourceFull = errors.New("delver's class resource is full")
)

/**
* UseItem has the delver use the item in their bag. An antidote ends the
* delver's poison at once (CurePoison); a Restoring Draught refills half their
* class resource's max (restoreHalfResource). Either is then spent, its entity
* removed and it leaves the bag, its instance id (when it has a row) recorded
* as consumed as a drunk potion's is. No cooldown starts. A refused use
* changes nothing and says why: out of play, not in the bag, not usable, or
* what the item's effect refuses (not poisoned, resource full). FS-9JV5K §D
* R17; §Change: The Restoring Draught D3-D4.
**/
func (p *PotionSystem) UseItem(delver *ecs.Entity, itemID uuid.UUID) error {
	if !InPlay(delver) {
		return ErrUseOutOfPlay
	}

	lc, ok := delver.GetComponent(ecs.ComponentTypeItemIDList)
	if !ok {
		return ErrUseNotInBag
	}
	bag := lc.(*components.ItemIDListComponent)
	if !slices.Contains(bag.ItemIDs, itemID) {
		return ErrUseNotInBag
	}

	item, ok := p.itemOf(itemID)
	if !ok {
		return ErrUseNotUsable
	}
	effect := useEffectOf(item)
	if effect == nil {
		return ErrUseNotUsable
	}
	if err := effect(delver); err != nil {
		return err
	}

	if item.InstanceID != nil {
		potions := potionsOf(delver)
		potions.Consumed = append(potions.Consumed, components.ConsumedItem{
			InstanceID: *item.InstanceID,
			Item:       ownCopy(*item),
		})
		if !delver.HasComponent(ecs.ComponentTypePotion) {
			delver.AddComponent(potions)
		}
	}

	p.em.RemoveEntity(itemID)
	// a fresh slice: a snapshot may still hold the old one
	bag.ItemIDs = slices.DeleteFunc(slices.Clone(bag.ItemIDs), func(id uuid.UUID) bool { return id == itemID })

	return nil
}

// useEffectOf is what using item does to the delver, applied whole or refused
// with nothing changed; nil for an item that cannot be used.
func useEffectOf(item *components.ItemComponent) func(*ecs.Entity) error {
	switch {
	case types.IsAntidote(item.ItemType, item.Name):
		return cureWithAntidote
	case types.IsRestoringDraught(item.ItemType, item.Name):
		return restoreHalfResource
	}
	return nil
}

// cureWithAntidote ends the delver's poison, refused when they are not
// poisoned. FS-9JV5K §D R17.
func cureWithAntidote(delver *ecs.Entity) error {
	if !CurePoison(delver) {
		return ErrUseNotPoisoned
	}
	return nil
}

/**
* restoreHalfResource refills the delver's class resource by half its max as
* it stands (gear and passives in it), rounded down and at least 1, capped at
* the max. Refused, the pool untouched, when it is already full; a body with
* no pool has nothing to restore and cannot use one. FS-9JV5K §Change: The
* Restoring Draught D3-D4.
**/
func restoreHalfResource(delver *ecs.Entity) error {
	rc, ok := delver.GetComponent(ecs.ComponentTypeResource)
	if !ok {
		return ErrUseNotUsable
	}
	pool := rc.(*components.ResourceComponent)
	if pool.Current >= pool.Max {
		return ErrUseResourceFull
	}
	pool.Current = min(pool.Current+max(pool.Max/2, 1), pool.Max)
	if pool.Current == pool.Max {
		// as regen leaves a full pool: no part-point waiting
		pool.Accrued = 0
	}
	return nil
}

// itemOf is the item component of the entity itemID, false when there is none.
func (p *PotionSystem) itemOf(itemID uuid.UUID) (*components.ItemComponent, bool) {
	entity, ok := p.em.GetEntity(itemID)
	if !ok {
		return nil, false
	}
	ic, ok := entity.GetComponent(ecs.ComponentTypeItem)
	if !ok {
		return nil, false
	}
	return ic.(*components.ItemComponent), true
}
