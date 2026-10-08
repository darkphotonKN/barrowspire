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

var pickupBread = types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: "Bread"}

// openChest is a chest at (x, y) already opened, holding the given items.
func openChest(t *testing.T, s *Session, x, y float64, items ...uuid.UUID) uuid.UUID {
	t.Helper()
	chestID := s.AddContainer(x, y)
	chest, ok := s.EntityManager.GetEntity(chestID)
	require.True(t, ok)
	oc, ok := chest.GetComponent(ecs.ComponentTypeOpenable)
	require.True(t, ok)
	oc.(*components.OpenableComponent).IsOpen = true
	itemList(t, s, chestID).ItemIDs = items
	return chestID
}

// A crafted pickup of an item that does not lie in an open container within
// reach is refused and nothing moves: another delver's carried or worn item, an
// item in a closed chest, one in a pile out of reach, or one lying nowhere.
// I-77AB6-12 (FS-77AB6 §Requirements; FS-4R9M9 R49).
func TestHandleInteract_ItemNotInAnOpenContainerInReach_IsRefusedAndNothingMoves(t *testing.T) {
	type holder struct {
		list func() []uuid.UUID // where the item is, read again after the attempt
		worn func() []uuid.UUID
	}
	cases := map[string]func(t *testing.T, s *Session, itemID uuid.UUID) holder{
		"another delver's satchel": func(t *testing.T, s *Session, itemID uuid.UUID) holder {
			_, other := placeDelver(t, s, "mage", 510, 500)
			inventory(t, s, other.ID).ItemIDs = []uuid.UUID{itemID}
			return holder{list: func() []uuid.UUID { return inventory(t, s, other.ID).ItemIDs }}
		},
		"another delver's worn item": func(t *testing.T, s *Session, itemID uuid.UUID) holder {
			_, other := placeDelver(t, s, "mage", 510, 500)
			inventory(t, s, other.ID).ItemIDs = []uuid.UUID{itemID}
			require.NoError(t, s.handleEquip(constants.ActionEquip, other.ID, itemID))
			return holder{
				list: func() []uuid.UUID { return inventory(t, s, other.ID).ItemIDs },
				worn: func() []uuid.UUID { return wornIDs(t, s, other.ID) },
			}
		},
		"closed chest in reach": func(t *testing.T, s *Session, itemID uuid.UUID) holder {
			chestID := s.AddContainer(520, 500)
			itemList(t, s, chestID).ItemIDs = []uuid.UUID{itemID}
			return holder{list: func() []uuid.UUID { return itemList(t, s, chestID).ItemIDs }}
		},
		"open chest out of reach": func(t *testing.T, s *Session, itemID uuid.UUID) holder {
			chestID := openChest(t, s, 500+constants.DefaultInteractableRange+1, 500, itemID)
			return holder{list: func() []uuid.UUID { return itemList(t, s, chestID).ItemIDs }}
		},
		"drop pile out of reach": func(t *testing.T, s *Session, itemID uuid.UUID) holder {
			pile := CreateDropPileEntity(s.EntityManager, 500, 500+constants.DefaultInteractableRange+1, []uuid.UUID{itemID})
			return holder{list: func() []uuid.UUID { return itemList(t, s, pile.ID).ItemIDs }}
		},
		"lying in no container": func(t *testing.T, s *Session, itemID uuid.UUID) holder {
			return holder{}
		},
	}

	for name, place := range cases {
		t.Run(name, func(t *testing.T) {
			s, _ := equipRun(t, nil)
			playerID, delver := placeDelver(t, s, "warrior", 500, 500)
			itemID := s.AddItem(oneOfEverySlot()["weapon"])
			h := place(t, s, itemID)
			var wornBefore []uuid.UUID
			if h.worn != nil {
				wornBefore = slices.Clone(h.worn())
			}
			var listBefore []uuid.UUID
			if h.list != nil {
				listBefore = slices.Clone(h.list())
			}

			var err error
			require.NotPanics(t, func() { err = s.handleInteract(playerID, itemID) })

			assert.Error(t, err)
			assert.Empty(t, inventory(t, s, delver.ID).ItemIDs, "nothing reaches the satchel")
			if h.list != nil {
				assert.Equal(t, listBefore, h.list(), "the item stays where it was")
			}
			if h.worn != nil {
				assert.Equal(t, wornBefore, h.worn(), "the item stays worn")
			}
		})
	}
}

// A valid pickup from an open chest in reach moves the item: it leaves the
// chest and lands in the satchel, once. I-77AB6-12.
func TestHandleInteract_ItemInAnOpenChestInReach_MovesToTheSatchel(t *testing.T) {
	s, _ := equipRun(t, nil)
	playerID, delver := placeDelver(t, s, "warrior", 500, 500)
	kept := s.AddItem(pickupBread)
	taken := s.AddItem(pickupBread)
	chestID := openChest(t, s, 530, 500, kept, taken)

	require.NoError(t, s.handleInteract(playerID, taken))

	assert.Equal(t, []uuid.UUID{taken}, inventory(t, s, delver.ID).ItemIDs)
	assert.Equal(t, []uuid.UUID{kept}, itemList(t, s, chestID).ItemIDs, "the item left the chest")
	assert.Error(t, s.handleInteract(playerID, taken), "a carried item cannot be picked up again")
	assert.Equal(t, []uuid.UUID{taken}, inventory(t, s, delver.ID).ItemIDs)
}

// A pickup refused for reach does not lock the item: walking up to the pile
// then picking it up works. I-77AB6-12.
func TestHandleInteract_RefusedPickup_DoesNotLockTheItem(t *testing.T) {
	s, _ := equipRun(t, nil)
	playerID, delver := placeDelver(t, s, "warrior", 100, 100)
	itemID := s.AddItem(pickupBread)
	pile := CreateDropPileEntity(s.EntityManager, 500, 500, []uuid.UUID{itemID})

	require.ErrorIs(t, s.handleInteract(playerID, itemID), ErrOutOfRange)

	tc, _ := delver.GetComponent(ecs.ComponentTypeTransform)
	tc.(*components.TransformComponent).X, tc.(*components.TransformComponent).Y = 490, 500

	require.NoError(t, s.handleInteract(playerID, itemID))
	assert.Equal(t, []uuid.UUID{itemID}, inventory(t, s, delver.ID).ItemIDs)
	assert.Empty(t, itemList(t, s, pile.ID).ItemIDs)
}
