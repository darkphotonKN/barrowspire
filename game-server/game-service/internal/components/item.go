package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

type ItemComponent struct {
	TemplateID uuid.UUID
	ItemType   types.ItemType // "weapon", "armor", "consumable"
	Name       string

	// Weapon stats
	AttackPower  int
	CriticalRate float64
	WeaponType   string

	// Armor stats
	DefenseRating   int
	MagicResistance int
	ArmorSlot       types.ArmorSlot

	// Consumable stats
	HealingAmount int
	ManaAmount    int
	BuffDuration  int

	// Shared
	BuyPrice    int
	SellPrice   int
	Description string

	// InstanceID is the item_instances.id this component was hydrated from.
	// nil for world items (chests / in-match drops) that have no DB row yet.
	InstanceID *uuid.UUID

	// RarityID is the item_rarities.id rolled for (or stored on) this item; empty = none.
	RarityID string
	// RarityCode is that rarity's code (normal … fabled); empty = none.
	RarityCode string

	// RequiredLevel is the character level needed to equip this item; 0 = unset (level 1).
	RequiredLevel int

	// ItemLevel is fixed at the roll; 0 = unrolled. FS-4R9M9 §Requirements 10.
	ItemLevel int
	// Affixes are the item's rolled (or a unique's fixed) stat bonuses.
	Affixes []types.Affix

	// A unique's effect code and its one-line text; empty for anything else.
	UniqueEffectCode string
	UniqueEffectText string
}

func (i *ItemComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeItem
}

func NewItemComponent(templateID uuid.UUID, itemType types.ItemType, name string) *ItemComponent {
	return &ItemComponent{
		TemplateID: templateID,
		ItemType:   itemType,
		Name:       name,
	}
}
