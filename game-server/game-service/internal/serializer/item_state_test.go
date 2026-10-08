package serializer

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Every item in world state, worn, carried or in a container, carries its
// item type (so a statless item is never guessed to be a ring), its
// rarity code, item level, required level, affixes, magic resistance and, for a
// unique, its effect text; a ring is shown like any other item.
// FS-4R9M9 §Requirements 54.
func TestSerializeBackendState_ItemsCarryTheirRoll(t *testing.T) {
	affixes := []types.Affix{{Stat: types.AffixStrength, Tier: 2, Value: 5}, {Stat: types.AffixMaxHealth, Tier: 1, Value: 8}}
	tests := []struct {
		name string
		item components.ItemComponent
	}{
		{"unique weapon", components.ItemComponent{ItemType: types.ItemTypeWeapon, Name: "Gravewarden's Edge", RarityCode: "fabled", ItemLevel: 9, RequiredLevel: 6, Affixes: affixes, UniqueEffectCode: "life_on_kill", UniqueEffectText: "Heals you when you slay a foe."}},
		{"armor", components.ItemComponent{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead, Name: "Bone Helm", RarityCode: "rare", ItemLevel: 9, RequiredLevel: 6, Affixes: affixes, DefenseRating: 2, MagicResistance: 4}},
		{"ring", components.ItemComponent{ItemType: types.ItemTypeRing, Name: "Iron Band", RarityCode: "uncommon", ItemLevel: 9, RequiredLevel: 6, Affixes: affixes}},
		{"statless armor", components.ItemComponent{ItemType: types.ItemTypeArmor, Name: "Shroud", ItemLevel: 9, RequiredLevel: 6, Affixes: affixes}},
		{"statless consumable", components.ItemComponent{ItemType: types.ItemTypeConsumable, Name: "Ash Tonic", ItemLevel: 9, RequiredLevel: 6, Affixes: affixes}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			memberID := uuid.New()
			wornItem, carriedItem, inChestItem := tt.item, tt.item, tt.item
			worn := addItem(em, &wornItem)
			carried := addItem(em, &carriedItem)
			inChest := addItem(em, &inChestItem)

			delver := em.CreateEntity()
			delver.AddComponent(components.NewPlayerComponent(memberID, "warrior", "Wren", false))
			delver.AddComponent(components.NewTransformComponent(10, 10))
			delver.AddComponent(components.NewVelocityComponent(0, 0, 1))
			delver.AddComponent(components.NewItemIDListComponent([]uuid.UUID{carried}))
			delver.AddComponent(components.NewEquipmentComponent(&components.EquipmentConfig{Ring1Slot: &worn}))

			chest := em.CreateEntity()
			chest.AddComponent(components.NewContainerComponent(uuid.New()))
			chest.AddComponent(components.NewTransformComponent(20, 20))
			chest.AddComponent(components.NewItemIDListComponent([]uuid.UUID{inChest}))

			state, err := NewStateSerializer(em).SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
			require.NoError(t, err)

			me := state.Players[memberID]
			require.NotNil(t, me)
			require.Len(t, me.Inventory, 1)
			require.Len(t, state.Containers, 1)
			require.Len(t, state.Containers[0].Items, 1)
			for where, shown := range map[string]*types.ItemState{
				"worn":           me.Equipment.Ring1,
				"carried":        me.Inventory[0],
				"in a container": state.Containers[0].Items[0],
			} {
				require.NotNil(t, shown, where)
				assert.Equal(t, tt.item.ItemType, shown.ItemType, where)
				assert.Equal(t, tt.item.RarityCode, shown.Rarity, where)
				assert.Equal(t, 9, shown.ItemLevel, where)
				assert.Equal(t, 6, shown.RequiredLevel, where)
				assert.Equal(t, affixes, shown.Affixes, where)
				assert.Equal(t, int32(tt.item.MagicResistance), shown.MagicResistance, where)
				assert.Equal(t, tt.item.UniqueEffectText, shown.UniqueEffect, where)
			}
		})
	}
}

// The wire names the client reads. A plain item leaves the new fields off.
func TestItemState_RollFields_WireNames(t *testing.T) {
	raw, err := json.Marshal(&types.ItemState{
		Name: "Bone Helm", ItemType: types.ItemTypeArmor, Rarity: "rare", ItemLevel: 9, MagicResistance: 4, UniqueEffect: "Heals you.",
		Affixes: []types.Affix{{Stat: types.AffixStrength, Tier: 2, Value: 5}},
	})
	require.NoError(t, err)
	assert.Contains(t, string(raw), `"item_type":"armor"`)
	assert.Contains(t, string(raw), `"rarity":"rare"`)
	assert.Contains(t, string(raw), `"item_level":9`)
	assert.Contains(t, string(raw), `"magic_resistance":4`)
	assert.Contains(t, string(raw), `"unique_effect":"Heals you."`)
	assert.Contains(t, string(raw), `"affixes":[{"stat":"strength","tier":2,"value":5}]`)

	plain, err := json.Marshal(&types.ItemState{Name: "Tonic"})
	require.NoError(t, err)
	for _, field := range []string{"rarity", "item_level", "affixes", "magic_resistance", "unique_effect"} {
		assert.NotContains(t, string(plain), field)
	}
}
