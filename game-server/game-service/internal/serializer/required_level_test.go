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

// addItem puts an item entity in the world and returns its id.
func addItem(em *ecs.EntityManager, item *components.ItemComponent) uuid.UUID {
	e := em.CreateEntity()
	e.AddComponent(item)
	return e.ID
}

// Every item the client is shown, worn, carried or in a container, carries
// the level it requires so the client can mark it. FS-BDA7X §Requirements 30.
func TestSerializeBackendState_ItemsCarryTheirRequiredLevel(t *testing.T) {
	tests := []struct {
		name string
		item *components.ItemComponent
	}{
		{"weapon", &components.ItemComponent{ItemType: types.ItemTypeWeapon, Name: "Seax", RequiredLevel: 7}},
		{"armor", &components.ItemComponent{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead, Name: "Helm", RequiredLevel: 7}},
		{"consumable", &components.ItemComponent{ItemType: types.ItemTypeConsumable, Name: "Tonic", RequiredLevel: 7}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			memberID := uuid.New()
			worn := addItem(em, tt.item)
			carriedItem := *tt.item
			carried := addItem(em, &carriedItem)
			inChestItem := *tt.item
			inChest := addItem(em, &inChestItem)

			delver := em.CreateEntity()
			delver.AddComponent(components.NewPlayerComponent(memberID, "warrior", "Wren", false))
			delver.AddComponent(components.NewTransformComponent(10, 10))
			delver.AddComponent(components.NewVelocityComponent(0, 0, 1))
			delver.AddComponent(components.NewItemIDListComponent([]uuid.UUID{carried}))
			delver.AddComponent(components.NewEquipmentComponent(&components.EquipmentConfig{WeaponSlot: &worn}))

			chest := em.CreateEntity()
			chest.AddComponent(components.NewContainerComponent(uuid.New()))
			chest.AddComponent(components.NewTransformComponent(20, 20))
			chest.AddComponent(components.NewItemIDListComponent([]uuid.UUID{inChest}))

			s := NewStateSerializer(em)
			state, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
			require.NoError(t, err)

			me := state.Players[memberID]
			require.NotNil(t, me)
			require.Len(t, me.Inventory, 1)
			assert.Equal(t, 7, me.Inventory[0].RequiredLevel, "carried")
			require.NotNil(t, me.Equipment.Weapon)
			assert.Equal(t, 7, me.Equipment.Weapon.RequiredLevel, "worn")
			require.Len(t, state.Containers, 1)
			require.Len(t, state.Containers[0].Items, 1)
			assert.Equal(t, 7, state.Containers[0].Items[0].RequiredLevel, "in a container")

			raw, err := json.Marshal(me.Inventory[0])
			require.NoError(t, err)
			assert.Contains(t, string(raw), `"required_level":7`)
		})
	}
}

// An item with no requirement leaves the field off the wire; the client reads
// its absence as level 1.
func TestItemState_NoRequiredLevel_IsOmitted(t *testing.T) {
	raw, err := json.Marshal(&types.ItemState{Name: "Tonic"})
	require.NoError(t, err)
	assert.NotContains(t, string(raw), "required_level")
}
