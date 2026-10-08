package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// EquipmentSlot is one of a delver's equipment slots: the kind of item it takes
// (and, for armor, which piece), whether what it holds counts as gear, and where
// it lives on the EquipmentComponent.
type EquipmentSlot struct {
	// Name is the slot's loadout name, as the items service knows it.
	Name      string
	ItemType  types.ItemType
	ArmorSlot types.ArmorSlot // armor only
	// Gear is whether the slot's item counts toward the wearer's bonuses.
	// Consumables sit in slots but never do.
	Gear bool
	// Holder is the slot's field on the equipment.
	Holder func(*components.EquipmentComponent) **uuid.UUID
}

// EquipmentSlots is every equipment slot, the one list of them. Anything that
// walks a delver's equipment (the gear sum, equipping, the floor keep rule, the
// extraction at a run's end) walks this, so a slot added here is never silently
// dropped by one of them. Slots taking the same kind of item are listed in the
// order they fill.
var EquipmentSlots = []EquipmentSlot{
	{Name: "weapon", ItemType: types.ItemTypeWeapon, Gear: true, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.WeaponSlot }},
	{Name: "head", ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead, Gear: true, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.HeadSlot }},
	{Name: "chest", ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotChest, Gear: true, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.ChestSlot }},
	{Name: "gloves", ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotGloves, Gear: true, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.GlovesSlot }},
	{Name: "legs", ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotLegs, Gear: true, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.LegsSlot }},
	{Name: "ring_1", ItemType: types.ItemTypeRing, Gear: true, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.Ring1Slot }},
	{Name: "ring_2", ItemType: types.ItemTypeRing, Gear: true, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.Ring2Slot }},
	{Name: "consumable_1", ItemType: types.ItemTypeConsumable, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.Consumable1 }},
	{Name: "consumable_2", ItemType: types.ItemTypeConsumable, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.Consumable2 }},
	{Name: "consumable_3", ItemType: types.ItemTypeConsumable, Holder: func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.Consumable3 }},
}

// SlotsFor is the slots an item of this type (and armor piece) goes in, in the
// order they fill. None for an item nothing can wear.
func SlotsFor(itemType types.ItemType, armorSlot types.ArmorSlot) []EquipmentSlot {
	var slots []EquipmentSlot
	for _, slot := range EquipmentSlots {
		if slot.ItemType != itemType {
			continue
		}
		if itemType == types.ItemTypeArmor && slot.ArmorSlot != armorSlot {
			continue
		}
		slots = append(slots, slot)
	}
	return slots
}

// WornIDs is the id of every item in the equipment's slots.
func WornIDs(eq *components.EquipmentComponent) []uuid.UUID {
	var ids []uuid.UUID
	for _, slot := range EquipmentSlots {
		if id := *slot.Holder(eq); id != nil {
			ids = append(ids, *id)
		}
	}
	return ids
}
