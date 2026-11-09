package game

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// chestDrop is what a chest opened now drops at: the floor's area level, from
// a standard source, never a ring. FS-4R9M9 §Requirements 10, 47.
func (s *Session) chestDrop() lootDrop {
	return chestDropAt(areaLevel(s.EntityManager.GetAllEntities()))
}

// guardedTreasureDrop is what a guarded treasure-room chest opened now drops
// at: a chest's drop with the floor's Fabled chance. FS-M8CSE §G R32, R35.
func (s *Session) guardedTreasureDrop() lootDrop {
	drop := s.chestDrop()
	drop.FabledChance = guardedTreasureFabledChance(floorDepth(s.EntityManager.GetAllEntities()))
	return drop
}

// chestDropAt is a chest's drop at the item level given: a standard source,
// never a ring (FS-4R9M9 §Requirements 47). A field chest names its level from
// its band (FS-3QHQZ §Requirements 19).
func chestDropAt(itemLevel int) lootDrop {
	return lootDrop{ItemLevel: itemLevel, Source: lootSourceStandard, NoRings: true}
}

// guardedTreasureFabledChance is a guarded treasure-room chest's Fabled chance
// per item on the floor given: none below its minimum floor, else its rate
// times the floor factor. FS-M8CSE §G R32.
func guardedTreasureFabledChance(floor int) float64 {
	if floor < GuardedTreasureFabledMinFloor {
		return 0
	}
	return GuardedTreasureFabledChance * floorFactor(floor)
}

// areaLevel is the floor's area level: the highest level among the delvers
// still in play, plus the floor's offset, the base FS-77AB6 levels the floor's
// monsters from without their spread. A hub, with no floor, is floor 1.
// FS-4R9M9 §Requirements 10.
func areaLevel(entities []*ecs.Entity) int {
	level := 1
	for _, entity := range entities {
		if systems.InPlay(entity) {
			level = max(level, delverLevel(entity))
		}
	}

	return level + MonsterLevelPerFloor*(floorDepth(entities)-1)
}

// floorDepth is the floor the world is on. A hub, with no floor, is floor 1.
func floorDepth(entities []*ecs.Entity) int {
	if floor, ok := systems.CurrentFloor(entities); ok {
		return max(floor.Depth, 1)
	}
	return 1
}

/**
* dropLoot creates n item entities, each rolled from pool (templates of one
* item type) for drop; a Fabled roll draws from the session's uniques. An
* empty pool, or one with nothing the item level allows, is skipped so the
* other item types still drop.
*
* It takes no session lock (the entity manager guards itself), so a kill
* consumer may call it on the tick without blocking.
**/
func (s *Session) dropLoot(itemType types.ItemType, pool []lootTemplate, n int, drop lootDrop) []uuid.UUID {
	if n == 0 {
		return nil
	}

	ids := make([]uuid.UUID, 0, n)
	for range n {
		item, ok := rollDrop(sharedLootRand{}, pool, s.itemPool.Uniques, s.lootRarities, drop)
		if !ok {
			slog.Warn("No template of item type eligible at item level, skipping its drops.",
				"item_type", itemType,
				"item_level", drop.ItemLevel,
				"skipped", n,
			)
			return ids
		}
		ids = append(ids, CreateItemEntity(s.EntityManager, item).ID)
	}
	return ids
}
