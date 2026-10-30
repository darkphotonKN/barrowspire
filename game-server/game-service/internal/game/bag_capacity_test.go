package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-HRH2J §D Requirements 31–39; Edge States "Bag exactly full", "Stale client
// state", "Over capacity at ship". I-HRH2J-1.

// fillBag puts n fresh items straight into the delver's bag.
func fillBag(t *testing.T, s *Session, playerEntityID uuid.UUID, n int) {
	t.Helper()
	for range n {
		carried(t, s, playerEntityID, pickupBread)
	}
}

// A pickup is taken while the bag has room and refused once it holds
// BagCapacity items or more: the container keeps the item at its place, the
// bag loses nothing, the item is free to take again, and no reply is sent.
// R33, R36, R37, R39.
func TestHandleInteract_BagCapacity(t *testing.T) {
	tests := []struct {
		name    string
		inBag   int
		wantErr error
	}{
		{"room for one more", BagCapacity - 1, nil},
		{"bag exactly full", BagCapacity, ErrBagFull},
		{"bag already over capacity", BagCapacity + 1, ErrBagFull},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, dispatcher := equipRun(t, nil)
			playerID, delver := placeDelver(t, s, "warrior", 500, 500)
			fillBag(t, s, delver.ID, tt.inBag)
			bagBefore := slices.Clone(inventory(t, s, delver.ID).ItemIDs)
			before, target, after := s.AddItem(pickupBread), s.AddItem(pickupBread), s.AddItem(pickupBread)
			chestID := openChest(t, s, 530, 500, before, target, after)

			err := s.handleInteract(playerID, target)

			if tt.wantErr == nil {
				require.NoError(t, err)
				assert.Len(t, inventory(t, s, delver.ID).ItemIDs, BagCapacity)
				assert.Equal(t, target, inventory(t, s, delver.ID).ItemIDs[BagCapacity-1], "the item goes on the end")
				assert.Equal(t, []uuid.UUID{before, after}, itemList(t, s, chestID).ItemIDs, "the item left the chest")
				return
			}
			require.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, bagBefore, inventory(t, s, delver.ID).ItemIDs, "the bag keeps every item, nothing added")
			assert.Equal(t, []uuid.UUID{before, target, after}, itemList(t, s, chestID).ItemIDs, "the item stays at its place")
			_, held := s.containerInteractedCache[target]
			assert.False(t, held, "a refused pickup releases the item")
			assert.Empty(t, dispatcher.sent, "the refusal sends nothing")
		})
	}
}

// An unequip into a full bag is refused and the item stays worn; with room it
// comes off to the end of the bag. Equipping is never refused for capacity: a
// swap is net-zero and an equip into an empty slot shrinks the bag. R34, R35, R39.
func TestHandleEquip_BagCapacity(t *testing.T) {
	sword := types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeWeapon, Name: "Sword"}

	t.Run("unequip into a full bag is refused", func(t *testing.T) {
		s, dispatcher := equipRun(t, nil)
		playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}, "")
		worn := carried(t, s, playerEntityID, sword)
		require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, worn))
		fillBag(t, s, playerEntityID, BagCapacity)
		bagBefore := slices.Clone(inventory(t, s, playerEntityID).ItemIDs)

		err := s.handleEquip(constants.ActionUnequip, playerEntityID, worn)

		require.ErrorIs(t, err, ErrBagFull)
		assert.Equal(t, []uuid.UUID{worn}, wornIDs(t, s, playerEntityID), "the item stays worn")
		assert.Equal(t, bagBefore, inventory(t, s, playerEntityID).ItemIDs, "the bag is unchanged")
		assert.Empty(t, dispatcher.sent, "the refusal sends nothing")
	})

	t.Run("unequip with room goes to the end of the bag", func(t *testing.T) {
		s, _ := equipRun(t, nil)
		playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}, "")
		worn := carried(t, s, playerEntityID, sword)
		require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, worn))
		fillBag(t, s, playerEntityID, BagCapacity-1)

		require.NoError(t, s.handleEquip(constants.ActionUnequip, playerEntityID, worn))

		bag := inventory(t, s, playerEntityID).ItemIDs
		assert.Len(t, bag, BagCapacity)
		assert.Equal(t, worn, bag[len(bag)-1])
		assert.Empty(t, wornIDs(t, s, playerEntityID))
	})

	t.Run("equip swap at full is allowed", func(t *testing.T) {
		s, _ := equipRun(t, nil)
		playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}, "")
		first := carried(t, s, playerEntityID, sword)
		require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, first))
		fillBag(t, s, playerEntityID, BagCapacity-1)
		second := carried(t, s, playerEntityID, sword)
		require.Len(t, inventory(t, s, playerEntityID).ItemIDs, BagCapacity)

		require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, second))

		bag := inventory(t, s, playerEntityID).ItemIDs
		assert.Len(t, bag, BagCapacity, "a swap is net-zero")
		assert.Equal(t, first, bag[len(bag)-1], "the swapped-out item goes on the end")
		assert.Equal(t, []uuid.UUID{second}, wornIDs(t, s, playerEntityID))
	})

	t.Run("equip into an empty slot at full shrinks the bag", func(t *testing.T) {
		s, _ := equipRun(t, nil)
		playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}, "")
		fillBag(t, s, playerEntityID, BagCapacity-1)
		item := carried(t, s, playerEntityID, sword)

		require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, item))

		assert.Len(t, inventory(t, s, playerEntityID).ItemIDs, BagCapacity-1)
		assert.Equal(t, []uuid.UUID{item}, wornIDs(t, s, playerEntityID))
	})
}

// A field pile's pickup is held to the same cap: at full the item stays in the
// pile. R33.
func TestFieldPile_BagFull_ItemStaysInThePile(t *testing.T) {
	field := lootedField(t)
	killer := visitor(t, field, fieldWren)
	pile, itemID := landPile(t, field, killer)
	body := delverEntity(t, field, killer)
	fillBag(t, field, body.ID, BagCapacity-len(inventory(t, field, body.ID).ItemIDs))
	bagBefore := slices.Clone(inventory(t, field, body.ID).ItemIDs)

	require.ErrorIs(t, pickUp(t, field, killer, itemID), ErrBagFull)

	assert.Equal(t, []uuid.UUID{itemID}, pileItemIDs(t, pile), "the item stays in the pile")
	assert.Equal(t, bagBefore, inventory(t, field, body.ID).ItemIDs, "the bag is unchanged")
}
