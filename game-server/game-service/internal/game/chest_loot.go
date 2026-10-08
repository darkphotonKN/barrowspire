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
	return lootDrop{ItemLevel: areaLevel(s.EntityManager.GetAllEntities()), Source: lootSourceStandard, NoRings: true}
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

	depth := 1
	if floor, ok := systems.CurrentFloor(entities); ok {
		depth = max(floor.Depth, 1)
	}
	return level + MonsterLevelPerFloor*(depth-1)
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
