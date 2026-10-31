package game

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// extractedEquipmentOf is what the delver wears as it leaves the run, slot by
// slot over the one slot list.
func extractedEquipmentOf(items map[uuid.UUID]*components.ItemComponent, equipment *components.EquipmentComponent) types.ExtractedEquipment {
	extracted := types.ExtractedEquipment{}
	for _, slot := range systems.EquipmentSlots {
		field := extractedField(&extracted, slot.Name)
		if field == nil {
			slog.Error("Equipment slot has no extraction field, its item stays behind.", "slot", slot.Name)
			continue
		}
		*field = extractedSlot(items, *slot.Holder(equipment))
	}
	return extracted
}

// losesFinds reports whether a body leaves a run without its unsafe finds: it
// was eliminated and did not escape. FS-18Z5F §E R23.
func losesFinds(body *ecs.Entity, player *components.PlayerComponent) bool {
	if player.Escape {
		return false
	}
	hc, ok := body.GetComponent(ecs.ComponentTypeHealth)
	return ok && hc.(*components.HealthComponent).IsEliminated
}

// safeItems is items without the unsafe finds: what a dead delver extracts. A
// worn find missing from it extracts as an empty slot. FS-18Z5F §E R23.
func safeItems(items map[uuid.UUID]*components.ItemComponent) map[uuid.UUID]*components.ItemComponent {
	safe := make(map[uuid.UUID]*components.ItemComponent, len(items))
	for id, item := range items {
		if !item.Unsafe {
			safe[id] = item
		}
	}
	return safe
}

// extractedField is the extraction's field for the slot of that name, nil for a
// slot the extraction does not know.
func extractedField(extracted *types.ExtractedEquipment, slotName string) **types.ExtractedItem {
	switch slotName {
	case "weapon":
		return &extracted.WeaponSlot
	case "head":
		return &extracted.HeadSlot
	case "chest":
		return &extracted.ChestSlot
	case "gloves":
		return &extracted.GlovesSlot
	case "legs":
		return &extracted.LegsSlot
	case "ring_1":
		return &extracted.Ring1Slot
	case "ring_2":
		return &extracted.Ring2Slot
	case "consumable_1":
		return &extracted.Consumable1
	case "consumable_2":
		return &extracted.Consumable2
	case "consumable_3":
		return &extracted.Consumable3
	}
	return nil
}

// extractedSlot is what an equipment slot extracts: the item in it, or nil
// for an empty slot or an item no longer in the world.
func extractedSlot(items map[uuid.UUID]*components.ItemComponent, slot *uuid.UUID) *types.ExtractedItem {
	if slot == nil {
		return nil
	}
	item, ok := items[*slot]
	if !ok {
		return nil
	}
	return extractedItemFrom(item)
}

// extractedItemFrom is an item as it leaves the run: its stats, identity and
// the roll it keeps for life. FS-4R9M9 §Requirements 49, 53.
func extractedItemFrom(item *components.ItemComponent) *types.ExtractedItem {
	return &types.ExtractedItem{
		TemplateID:      item.TemplateID,
		ItemType:        string(item.ItemType),
		Name:            item.Name,
		AttackPower:     item.AttackPower,
		CriticalRate:    item.CriticalRate,
		WeaponType:      item.WeaponType,
		DefenseRating:   item.DefenseRating,
		MagicResistance: item.MagicResistance,
		ArmorSlot:       string(item.ArmorSlot),
		HealingAmount:   item.HealingAmount,
		ManaAmount:      item.ManaAmount,
		BuffDuration:    item.BuffDuration,
		BuyPrice:        item.BuyPrice,
		SellPrice:       item.SellPrice,
		Description:     item.Description,
		InstanceID:      item.InstanceID,
		RarityID:        item.RarityID,
		ItemLevel:       item.ItemLevel,
		RequiredLevel:   item.RequiredLevel,
		Affixes:         item.Affixes,
	}
}
