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

// Every item in world state, worn, carried or in a container, says whether it
// is an unsafe find; the wire carries "unsafe": true and leaves the key off a
// safe item. FS-18Z5F §D R21.
func TestSerializeBackendState_ItemsCarryTheirUnsafeFlag(t *testing.T) {
	for _, unsafe := range []bool{true, false} {
		em := ecs.NewEntityManager()
		memberID := uuid.New()
		worn := addItem(em, &components.ItemComponent{ItemType: types.ItemTypeRing, Name: "Iron Band", Unsafe: unsafe})
		carried := addItem(em, &components.ItemComponent{ItemType: types.ItemTypeConsumable, Name: "Ash Tonic", Unsafe: unsafe})
		inChest := addItem(em, &components.ItemComponent{ItemType: types.ItemTypeWeapon, Name: "Seax", Unsafe: unsafe})

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
			assert.Equal(t, unsafe, shown.Unsafe, where)

			raw, err := json.Marshal(shown)
			require.NoError(t, err)
			if unsafe {
				assert.Contains(t, string(raw), `"unsafe":true`, where)
			} else {
				assert.NotContains(t, string(raw), `"unsafe"`, where)
			}
		}
	}
}
