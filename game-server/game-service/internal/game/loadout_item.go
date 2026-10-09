package game

import (
	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// loadoutItemConfig hydrates a stored instance brought into the world: its
// stats, its identity, and the roll it keeps for life (item level, affixes,
// required level, unique effect). Its rarity code is looked up among the
// session's rarities; unknown, it is left empty. FS-4R9M9 §Requirements 53.
func loadoutItemConfig(item *pbitems.ItemInstance, rarities []lootRarity) types.ItemConfig {
	templateID, _ := uuid.Parse(item.GetTemplateId())
	var instanceID *uuid.UUID
	if id, err := uuid.Parse(item.GetId()); err == nil && id != uuid.Nil {
		instanceID = &id
	}

	config := types.ItemConfig{
		TemplateID:      templateID,
		InstanceID:      instanceID,
		ItemType:        types.ItemType(item.GetItemType()),
		Name:            item.GetName(),
		AttackPower:     int(item.GetAttackPower()),
		CriticalRate:    float64(item.GetCriticalRate()),
		WeaponType:      item.GetWeaponType(),
		DefenseRating:   int(item.GetDefenseRating()),
		MagicResistance: int(item.GetMagicResistance()),
		ArmorSlot:       types.ArmorSlot(item.GetArmorSlot()),
		HealingAmount:   int(item.GetHealingAmount()),
		ManaAmount:      int(item.GetManaAmount()),
		BuffDuration:    int(item.GetBuffDuration()),
		BuyPrice:        int(item.GetBuyPrice()),
		SellPrice:       int(item.GetSellPrice()),
		Description:     item.GetDescription(),
		RarityID:        item.GetRarityId(),

		RequiredLevel:    int(item.GetRequiredLevel()),
		ItemLevel:        int(item.GetItemLevel()),
		Affixes:          affixesFromPb(item.GetAffixes()),
		UniqueEffectCode: item.GetUniqueEffectCode(),
		UniqueEffectText: item.GetUniqueEffectText(),
	}
	for _, r := range rarities {
		if r.ID == config.RarityID {
			config.RarityCode = r.Code
			break
		}
	}
	return config
}

// affixesFromPb copies stored affixes; none is nil.
func affixesFromPb(affixes []*pbitems.Affix) []types.Affix {
	if len(affixes) == 0 {
		return nil
	}
	out := make([]types.Affix, 0, len(affixes))
	for _, a := range affixes {
		out = append(out, types.Affix{Stat: a.GetStat(), Tier: int(a.GetTier()), Value: int(a.GetValue())})
	}
	return out
}
