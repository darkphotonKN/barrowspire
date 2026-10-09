package game

import (
	"fmt"
	"log/slog"

	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// lootPool is the session's catalogue as the loot roll sees it: one base pool
// per item type and, apart, the uniques. A unique never enters a base pool.
// FS-4R9M9 §Requirements 5, 6, 8, 12.
type lootPool struct {
	Weapons     []lootTemplate
	Armor       []lootTemplate
	Consumables []lootTemplate
	Rings       []lootTemplate
	Uniques     []uniqueTemplate
}

// uniqueTemplate is a unique as the roll sees it: its template (Config carries
// the effect code and text) and its fixed affixes as stat ranges.
// FS-4R9M9 §Requirements 6, 27.
type uniqueTemplate struct {
	lootTemplate
	FixedAffixes []affixRange
}

// affixRange is a unique's fixed affix: a stat and the inclusive range it rolls in.
type affixRange struct {
	Stat     string
	Min, Max int
}

// knownUniqueEffects are the effect codes this game-service implements; a
// unique with any other never drops. FS-4R9M9 §Requirements 30.
var knownUniqueEffects = map[string]bool{
	types.UniqueEffectKillFrenzy:      true,
	types.UniqueEffectMeleeReflect:    true,
	types.UniqueEffectPierce:          true,
	types.UniqueEffectKillHeal:        true,
	types.UniqueEffectBurningDash:     true,
	types.UniqueEffectFloorAttributes: true,
}

// count is how many base templates the pool holds, uniques not counted.
func (p lootPool) count() int {
	return len(p.Weapons) + len(p.Armor) + len(p.Consumables) + len(p.Rings)
}

// of is the base pool of one item type; nil for a type with none.
func (p lootPool) of(itemType types.ItemType) []lootTemplate {
	switch itemType {
	case types.ItemTypeWeapon:
		return p.Weapons
	case types.ItemTypeArmor:
		return p.Armor
	case types.ItemTypeRing:
		return p.Rings
	case types.ItemTypeConsumable:
		return p.Consumables
	}
	return nil
}

// buildLootPool files every catalogue template into its pool. An unparseable
// id or an item type the game does not know refuses the whole catalogue; a
// unique with an unknown effect is only left out.
func buildLootPool(templates []*pbitems.ItemTemplate) (lootPool, error) {
	var pool lootPool
	for _, t := range templates {
		lt, err := lootTemplateFrom(t)
		if err != nil {
			return lootPool{}, err
		}

		if u := t.GetUnique(); u != nil {
			if !knownUniqueEffects[u.GetEffectCode()] {
				slog.Warn("Unique has an effect this game-service does not know, leaving it out of the loot pool.",
					"template_id", t.GetId(),
					"item_name", t.GetItemName(),
					"effect_code", u.GetEffectCode(),
				)
				continue
			}
			pool.Uniques = append(pool.Uniques, uniqueTemplate{lootTemplate: lt, FixedAffixes: affixRangesFrom(u.GetFixedAffixes())})
			continue
		}

		switch lt.Config.ItemType {
		case types.ItemTypeWeapon:
			pool.Weapons = append(pool.Weapons, lt)
		case types.ItemTypeArmor:
			pool.Armor = append(pool.Armor, lt)
		case types.ItemTypeConsumable:
			pool.Consumables = append(pool.Consumables, lt)
		case types.ItemTypeRing:
			pool.Rings = append(pool.Rings, lt)
		}
	}
	return pool, nil
}

// lootTemplateFrom reads one catalogue template: the stats of its item type,
// its required level and min item level (an unset one is 1) and, for a unique,
// its effect.
func lootTemplateFrom(t *pbitems.ItemTemplate) (lootTemplate, error) {
	templateID, err := uuid.Parse(t.GetId())
	if err != nil {
		return lootTemplate{}, fmt.Errorf("parsing template id %q: %w", t.GetId(), err)
	}

	config := types.ItemConfig{
		TemplateID:    templateID,
		ItemType:      types.ItemType(t.GetItemType()),
		Name:          t.GetItemName(),
		Description:   t.GetDescription(),
		BuyPrice:      int(t.GetBaseBuyPrice()),
		SellPrice:     int(t.GetBaseSellPrice()),
		RequiredLevel: int(t.GetRequiredLevel()),
	}

	switch config.ItemType {
	case types.ItemTypeWeapon:
		config.WeaponType = t.GetWeaponType()
		config.AttackPower = int(t.GetAttackPower())
		config.CriticalRate = float64(t.GetCriticalRate())
	case types.ItemTypeArmor:
		config.DefenseRating = int(t.GetDefenseRating())
		config.MagicResistance = int(t.GetMagicResistance())
		config.ArmorSlot = types.ArmorSlot(t.GetArmorSlot())
	case types.ItemTypeConsumable:
		config.HealingAmount = int(t.GetHealingAmount())
		config.ManaAmount = int(t.GetManaAmount())
		config.BuffDuration = int(t.GetBuffDuration())
	case types.ItemTypeRing:
		// no base stats: a ring's power is its affixes (FS-4R9M9 §Requirements 5)
	default:
		return lootTemplate{}, fmt.Errorf("template %s has unknown item type %q", templateID, t.GetItemType())
	}

	u := t.GetUnique()
	if u != nil {
		config.UniqueEffectCode = u.GetEffectCode()
		config.UniqueEffectText = u.GetEffectText()
	}

	return lootTemplate{
		Config:       config,
		MinItemLevel: max(int(t.GetMinItemLevel()), 1),
		Unique:       u != nil,
	}, nil
}

func affixRangesFrom(ranges []*pbitems.AffixRange) []affixRange {
	out := make([]affixRange, 0, len(ranges))
	for _, r := range ranges {
		out = append(out, affixRange{Stat: r.GetStat(), Min: int(r.GetMin()), Max: int(r.GetMax())})
	}
	return out
}
