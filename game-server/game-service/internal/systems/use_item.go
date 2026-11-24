package systems

import (
	"errors"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// Why a use_item is refused. A refused use spends nothing. FS-9JV5K §D R17.
var (
	ErrUseOutOfPlay   = errors.New("delver is out of play")
	ErrUseNotInBag    = errors.New("item is not in the delver's bag")
	ErrUseNotUsable   = errors.New("item is not usable")
	ErrUseNotPoisoned = errors.New("delver is not poisoned")
)

/**
* UseItem has the delver use the item in their bag. The one usable item is an
* antidote: it ends the delver's poison at once (CurePoison) and is spent, its
* entity removed and it leaves the bag, its instance id (when it has a row)
* recorded as consumed as a drunk potion's is. No cooldown starts. A refused
* use changes nothing and says why: out of play, not in the bag, not usable,
* or (for an antidote) not poisoned. FS-9JV5K §D R17.
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
	if !ok || !types.IsAntidote(item.ItemType, item.Name) {
		return ErrUseNotUsable
	}

	if !CurePoison(delver) {
		return ErrUseNotPoisoned
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
