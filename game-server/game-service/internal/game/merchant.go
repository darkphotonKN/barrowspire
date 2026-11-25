package game

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

/**
* The wandering merchant (FS-9JV5K §A). On about a third of floors 2+ below
* the top he stands in a respite room of his own with his wares: health
* potions, antidotes, Restoring Draughts and, rarely, the Tome of Filth. He is a fixture, not a
* body: no health, no player or enemy, so nothing targets or hits him, and the
* ground never counts him (systems.BodyKindOf is BodyNone).
**/

// merchantFor is whether the floor at depth holds the merchant: drawn at
// chance (MerchantFloorChance by default) on floors 2+ below the top; floor 1
// and the top floor draw nothing. FS-9JV5K §A R1.
func merchantFor(rng populationRand, depth int, top bool, chance float64) bool {
	if depth <= firstFloor || top {
		return false
	}
	return rng.Float64() < chance
}

// merchantRoomOpen is the merchant's own rule on top of the respite room's:
// not the switch's or the escape door's room either. FS-9JV5K §A R1.
func (d *dungeonFloor) merchantRoomOpen(room int) bool {
	roles := d.layout.Roles
	if !roles.HasEscapeDoor() {
		return true
	}
	return room != roles.Switch && room != roles.EscapeDoor
}

/**
* layMerchant stands the floor's merchant where he was planned, his wares
* rolled now, the tome among them when he offers it (FS-9JV5K §A R3, §E R18).
* A floor with no merchant planned lays none.
**/
func (s *Session) layMerchant(depth int, d *dungeonFloor) {
	r, ok := d.respiteAt(respiteMerchant)
	if !ok {
		return
	}
	wares := s.merchantWares()
	if s.offerTome(depth) {
		wares = append(wares, components.Ware{Kind: components.WareTomeOfFilth, Price: MerchantTomePrice, Left: MerchantTomeStock})
	}
	CreateMerchantEntity(s.EntityManager, r.at.x, r.at.y, wares)
}

// merchantWares are a merchant's bag wares at his spawn: a health potion, an
// antidote and a Restoring Draught line, each whose template the catalogue
// holds. FS-9JV5K §A R3; §Change: The Restoring Draught D2.
func (s *Session) merchantWares() []components.Ware {
	var wares []components.Ware
	if potion, ok := merchantPotion(s.itemPool.Consumables); ok {
		wares = append(wares, components.Ware{Kind: components.WareHealthPotion, Price: MerchantPotionPrice, Left: MerchantPotionStock, Item: s.wareItem(potion)})
	} else {
		slog.Warn("Merchant sells no health potion: the catalogue has none", "sessionID", s.ID)
	}
	if s.itemPool.Antidote != nil {
		wares = append(wares, components.Ware{Kind: components.WareAntidote, Price: MerchantAntidotePrice, Left: MerchantAntidoteStock, Item: s.wareItem(*s.itemPool.Antidote)})
	} else {
		slog.Warn("Merchant sells no antidote: the catalogue has none", "sessionID", s.ID)
	}
	if s.itemPool.RestoringDraught != nil {
		wares = append(wares, components.Ware{Kind: components.WareRestoringDraught, Price: MerchantDraughtPrice, Left: MerchantDraughtStock, Item: s.wareItem(*s.itemPool.RestoringDraught)})
	} else {
		slog.Warn("Merchant sells no Restoring Draught: the catalogue has none", "sessionID", s.ID)
	}
	return wares
}

/**
* merchantPotion is the health potion the merchant sells: the consumable that
* heals the least and restores no mana, the catalogue's smallest health potion
* (FS-9JV5K R3's HEALTH_POT_SMALL: templates carry no code, so it is found by
* its stats). Among equals, the first. False when no consumable heals alone.
**/
func merchantPotion(consumables []lootTemplate) (lootTemplate, bool) {
	var best lootTemplate
	found := false
	for _, t := range consumables {
		heal := t.Config.HealingAmount
		if heal <= 0 || t.Config.ManaAmount != 0 {
			continue
		}
		if !found || heal < best.Config.HealingAmount {
			best, found = t, true
		}
	}
	return best, found
}

// wareItem is the item a sale of template creates: its base, at the Normal
// rarity when the session knows it, item level 1 and no level needed.
func (s *Session) wareItem(template lootTemplate) *types.ItemConfig {
	item := template.Config
	item.ItemLevel = 1
	item.RequiredLevel = 1
	if normal, ok := rarityByCode(s.lootRarities, rarityNormal); ok {
		item.RarityID, item.RarityCode = normal.ID, normal.Code
	}
	return &item
}

/**
* offerTome rolls whether the floor at depth's merchant offers the tome: at
* MerchantTomeChance, only when the run has no tome plan and a floor above
* his, not the top, can hold the Altar of Consecration. An offer commits the
* altar on this tick, whether or not anyone buys: the tome's floor is his, the
* altar's drawn uniformly from the next floor to height - 1, and the tome is
* laid nowhere. FS-9JV5K §E R18-R19.
**/
func (s *Session) offerTome(depth int) bool {
	if _, planned := s.tomePlan(); planned {
		return false
	}
	floor, ok := systems.CurrentFloor(s.EntityManager.GetAllEntities())
	if !ok || depth >= floor.Count-1 {
		return false
	}
	if s.spawnRand.Float64() >= s.tuning.merchantTomeChance {
		return false
	}
	altarFloor := depth + 1 + s.spawnRand.IntN(floor.Count-1-depth)
	s.setTomePlan(depth, altarFloor)
	if plan, ok := s.tomePlan(); ok {
		plan.Sold = true
	}
	slog.Info("Merchant offers the tome", "sessionID", s.ID, "floor", depth, "altarFloor", altarFloor)
	return true
}

// CreateMerchantEntity stands the wandering merchant at (x, y) with wares.
func CreateMerchantEntity(em *ecs.EntityManager, x, y float64, wares []components.Ware) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(&components.MerchantComponent{Wares: wares})
	entity.AddComponent(components.NewTransformComponent(x, y))
	return entity
}
