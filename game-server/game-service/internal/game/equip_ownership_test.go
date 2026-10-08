package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// oneOfEverySlot is an item config for each kind of slot a delver can wear.
func oneOfEverySlot() map[string]types.ItemConfig {
	armor := func(slot types.ArmorSlot) types.ItemConfig {
		return types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeArmor, ArmorSlot: slot, Name: string(slot)}
	}
	return map[string]types.ItemConfig{
		"weapon":     {TemplateID: uuid.New(), ItemType: types.ItemTypeWeapon, Name: "Sword"},
		"head":       armor(types.ArmorSlotHead),
		"chest":      armor(types.ArmorSlotChest),
		"gloves":     armor(types.ArmorSlotGloves),
		"legs":       armor(types.ArmorSlotLegs),
		"ring":       ring("Band", 1),
		"consumable": {TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: "Potion"},
	}
}

// itemList is the ItemIDList of any entity: a delver's satchel or a pile.
func itemList(t *testing.T, s *Session, entityID uuid.UUID) *components.ItemIDListComponent {
	t.Helper()
	entity, ok := s.EntityManager.GetEntity(entityID)
	require.True(t, ok)
	c, ok := entity.GetComponent(ecs.ComponentTypeItemIDList)
	require.True(t, ok)
	return c.(*components.ItemIDListComponent)
}

// wornIDs is every item id in the delver's equipment slots.
func wornIDs(t *testing.T, s *Session, playerEntityID uuid.UUID) []uuid.UUID {
	t.Helper()
	eq := equipmentOf(t, s, playerEntityID)
	var ids []uuid.UUID
	for _, slot := range []*uuid.UUID{
		eq.WeaponSlot, eq.HeadSlot, eq.ChestSlot, eq.GlovesSlot, eq.LegsSlot,
		eq.Ring1Slot, eq.Ring2Slot, eq.Consumable1, eq.Consumable2, eq.Consumable3,
	} {
		if slot != nil {
			ids = append(ids, *slot)
		}
	}
	return ids
}

// A crafted equip of an item the delver does not carry, lying in a drop pile or
// in another delver's satchel, is refused for every slot: nothing panics, the
// item is not worn, and it stays exactly where it was, so it can never leave the
// run twice. I-77AB6-11.
func TestHandleEquip_ItemNotCarried_IsRefusedForEverySlot(t *testing.T) {
	holders := map[string]func(t *testing.T, s *Session) uuid.UUID{
		"drop pile": func(t *testing.T, s *Session) uuid.UUID {
			return s.AddContainer(400, 400)
		},
		"another delver": func(t *testing.T, s *Session) uuid.UUID {
			return s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Kaelen", Class: "mage", Level: 3})
		},
	}

	for holderName, holder := range holders {
		for slotName, config := range oneOfEverySlot() {
			for _, satchel := range []string{"empty satchel", "carrying something"} {
				t.Run(holderName+"/"+slotName+"/"+satchel, func(t *testing.T) {
					s, _ := equipRun(t, nil)
					playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
					if satchel == "carrying something" {
						carried(t, s, playerEntityID, types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: "Bread"})
					}
					satchelBefore := slices.Clone(inventory(t, s, playerEntityID).ItemIDs)

					holderID := holder(t, s)
					itemID := s.AddItem(config)
					pile := itemList(t, s, holderID)
					pile.ItemIDs = append(pile.ItemIDs, itemID)

					var err error
					require.NotPanics(t, func() {
						err = s.handleEquip(constants.ActionEquip, playerEntityID, itemID)
					})

					assert.ErrorIs(t, err, ErrItemNotCarried)
					assert.Empty(t, wornIDs(t, s, playerEntityID), "nothing is worn")
					assert.Equal(t, satchelBefore, inventory(t, s, playerEntityID).ItemIDs, "the satchel is untouched")
					assert.Equal(t, []uuid.UUID{itemID}, itemList(t, s, holderID).ItemIDs, "the item stays where it was")
				})
			}
		}
	}
}

// Unequipping an item the delver does not wear is refused: it would otherwise
// copy a pile's item into their satchel. I-77AB6-11.
func TestHandleEquip_UnequipItemNotWorn_IsRefusedForEverySlot(t *testing.T) {
	for slotName, config := range oneOfEverySlot() {
		t.Run(slotName, func(t *testing.T) {
			s, _ := equipRun(t, nil)
			playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
			pileID := s.AddContainer(400, 400)
			itemID := s.AddItem(config)
			pile := itemList(t, s, pileID)
			pile.ItemIDs = append(pile.ItemIDs, itemID)

			err := s.handleEquip(constants.ActionUnequip, playerEntityID, itemID)

			assert.ErrorIs(t, err, ErrItemNotWorn)
			assert.Empty(t, inventory(t, s, playerEntityID).ItemIDs, "nothing reaches the satchel")
			assert.Equal(t, []uuid.UUID{itemID}, itemList(t, s, pileID).ItemIDs)
		})
	}
}

// Equipping into a single slot already in use puts what was there back in the
// satchel: nothing worn is ever dropped on the floor of the world. Rings and
// consumables have their own fill rules. I-77AB6-11.
func TestHandleEquip_OccupiedSingleSlot_ReturnsTheWornItemToTheSatchel(t *testing.T) {
	for _, slotName := range []string{"weapon", "head", "chest", "gloves", "legs"} {
		t.Run(slotName, func(t *testing.T) {
			s, _ := equipRun(t, nil)
			playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
			first := carried(t, s, playerEntityID, oneOfEverySlot()[slotName])
			second := carried(t, s, playerEntityID, oneOfEverySlot()[slotName])

			require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, first))
			require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, second))

			assert.Equal(t, []uuid.UUID{second}, wornIDs(t, s, playerEntityID))
			assert.Equal(t, []uuid.UUID{first}, inventory(t, s, playerEntityID).ItemIDs)
		})
	}
}

// Taking an id out of a list that never held it leaves the list as it was,
// whatever its length.
func TestRemoveItem_MissingID_LeavesTheListAlone(t *testing.T) {
	kept := uuid.New()
	for _, items := range [][]uuid.UUID{nil, {}, {kept}} {
		var got []uuid.UUID
		require.NotPanics(t, func() { got = removeItem(items, uuid.New()) })
		assert.Equal(t, len(items), len(got))
	}
}
