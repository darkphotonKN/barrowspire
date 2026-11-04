package items

import (
	"slices"

	"github.com/google/uuid"
)

// representable is FS-1GZGD A1's only check on a snapshot: an item level of
// at least 1 and every affix well formed (a known stat code, tier 0-3, value
// >= 0). Never a drop rule: any affix count at any rarity and any item level
// above the template's band is fine.
func (s *ItemSnapshot) representable() bool {
	if s.ItemLevel < 1 {
		return false
	}
	for _, a := range s.Affixes {
		if !a.wellFormed() {
			return false
		}
	}
	return true
}

// mintable is representable plus what the stored instance needs to read back
// as the snapshot: a required level of its own (>= 1) and no negative
// durability. A resolve never makes a snapshot that fails these; a grant
// checks them because its snapshot comes from the caller.
func (s *ItemSnapshot) mintable() bool {
	return s.representable() && s.RequiredLevel >= 1 && (s.Durability == nil || *s.Durability >= 0)
}

// instance is a brand-new, AVAILABLE instance of the snapshot with id, owned
// by owner, carrying rarityID (the snapshot's rarity code, looked up). The
// location is the insert's to set.
func (s *ItemSnapshot) instance(id, owner uuid.UUID, rarityID *uuid.UUID) *ItemInstance {
	return &ItemInstance{
		ID:              id,
		TemplateID:      s.TemplateID,
		OwnerMemberID:   owner,
		Source:          grantSource,
		ItemType:        s.ItemType,
		Name:            s.Name,
		RarityID:        rarityID,
		AttackPower:     s.AttackPower,
		CriticalRate:    s.CriticalRate,
		WeaponType:      s.WeaponType,
		DefenseRating:   s.DefenseRating,
		MagicResistance: s.MagicResistance,
		ArmorSlot:       s.ArmorSlot,
		HealingAmount:   s.HealingAmount,
		ManaAmount:      s.ManaAmount,
		BuffDuration:    s.BuffDuration,
		Durability:      s.Durability,
		Description:     s.Description,
		Status:          itemStatusAvailable,
		RequiredLevel:   s.RequiredLevel,
		ItemLevel:       s.ItemLevel,
		Affixes:         slices.Clone(s.Affixes),
	}
}
