package game

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
	Field chests: the Forest's clearing chests (FS-3QHQZ §Requirements 19). A
	field chest rolls when first opened through the Spire's chest roll, at an
	item level drawn from its place's band and kept at its place's drop factor
	(FS-X2F2H's container rule, R32). Anyone may take from it: a chest is never
	reserved. Its place's ChestRestockDelay after that first open it restocks.
*/

/**
* rollChest is what a chest holds on its first open: a field's chest roll in a
* field, the Spire's chest roll at the floor's area level anywhere else.
**/
func (s *Session) rollChest() ([]uuid.UUID, error) {
	place, ok := s.FieldPlace()
	if !ok {
		return s.generateItems()
	}
	return s.fieldChestRoll(s.chestRand, place)
}

/**
* fieldChestRoll is a field chest's roll (R19): the item level uniform in the
* place's band, then the container rule at the place's drop factor.
*
* Draws, in order: the level, then one keep roll per item rolled.
**/
func (s *Session) fieldChestRoll(r lootRand, place FieldPlace) ([]uuid.UUID, error) {
	itemLevel := place.MinLevel + r.IntN(max(place.MaxLevel-place.MinLevel+1, 1))
	return s.fieldContainerRoll(r, itemLevel, place.DropFactor)
}

/**
* restockFieldChests is a field's chests on its tick (R19): each chest opened
* at least once ages by deltaTime from that first open, and once it has stood
* open its place's ChestRestockDelay it restocks: whatever it still holds
* leaves the world, it closes, and its next opening rolls afresh. What was
* taken from it before then is the taker's. A run's chests, and a place that
* names no delay, never restock. It runs on the tick, unlocked, as the piles do;
* the delay is the one cached as the channel was built.
**/
func (s *Session) restockFieldChests(deltaTime float64, entities []*ecs.Entity) {
	s.mu.RLock()
	restockDelay := s.chestRestockDelay
	s.mu.RUnlock()

	if restockDelay <= 0 {
		return
	}

	for _, entity := range entities {
		cc, ok := entity.GetComponent(ecs.ComponentTypeContainer)
		if !ok {
			continue
		}
		chest, ok := cc.(*components.ContainerComponent)
		if !ok || chest.Kind != components.ContainerKindChest {
			continue
		}
		oc, ok := entity.GetComponent(ecs.ComponentTypeOpenable)
		if !ok {
			continue
		}
		openable := oc.(*components.OpenableComponent)
		if !openable.HasBeenOpened {
			continue
		}

		chest.OpenedFor += deltaTime
		if chest.OpenedFor < restockDelay {
			continue
		}

		if lc, ok := entity.GetComponent(ecs.ComponentTypeItemIDList); ok {
			held := lc.(*components.ItemIDListComponent)
			for _, itemID := range held.ItemIDs {
				s.EntityManager.RemoveEntity(itemID)
			}
			held.ItemIDs = nil
		}
		openable.IsOpen, openable.HasBeenOpened = false, false
		chest.OpenedFor = 0
	}
}
