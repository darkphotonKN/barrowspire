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

// FS-9JV5K §Change: The Restoring Draught D3-D4; its Acceptance Criteria
// "use_item on a draught raises ...". I-9JV5K-6.

// restoringDraught is a stored Restoring Draught: it has an item_instances row.
func restoringDraught() types.ItemConfig {
	instanceID := uuid.New()
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: types.RestoringDraughtName,
		InstanceID: &instanceID,
	}
}

// drinkDraughtNow queues the delver's use_item and applies it alone: the rest
// of the tick would regenerate the pool.
func drinkDraughtNow(s *Session, playerID, itemID uuid.UUID) {
	s.queueIntent(func() { s.useItem(playerID, itemID) })
	s.applyIntents()
}

// A draught in the bag refills half the pool's max, rounded down and at least
// 1, onto current, capped at max, and is spent: its entity gone, out of the
// bag, the drinker told it worked. Stamina, mana and parry charges alike; the
// max is the pool's at the moment of drinking, gear and passives in it.
// FS-9JV5K §Change: The Restoring Draught D3; Edge States.
func TestRun_UseItem_RestoringDraught_RefillsHalfTheMaxCappedAndSpendsIt(t *testing.T) {
	tests := []struct {
		name         string
		class        string
		kind         components.ResourceKind
		current, max int
		want         int
	}{
		{"a warrior at 10/100 stamina", "warrior", components.ResourceStamina, 10, 100, 60},
		{"a mage at 100/150 mana, capped", "mage", components.ResourceMana, 100, 150, 150},
		{"a merc at 0/3 parry charges, half rounded down", "mercenary", components.ResourceParryCharges, 0, 3, 1},
		{"a merc at 2/3, refilled to 3", "mercenary", components.ResourceParryCharges, 2, 3, 3},
		{"a Sellsword's 0/5 parry charges", "mercenary", components.ResourceParryCharges, 0, 5, 2},
		{"a pool of 1 at 0: at least 1", "mercenary", components.ResourceParryCharges, 0, 1, 1},
		{"a max raised by gear to 180, at 0", "warrior", components.ResourceStamina, 0, 180, 90},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := coopRun(t)
			sender := &recordingSender{}
			s.sender = sender
			playerID, delver := seatedDelver(t, s, tt.class, 500, 500)
			pool := bodyPool(t, delver)
			require.Equal(t, tt.kind, pool.Kind)
			pool.Current, pool.Max = tt.current, tt.max
			item := carried(t, s, delver.ID, restoringDraught())

			drinkDraughtNow(s, playerID, item)

			assert.Equal(t, tt.want, pool.Current)
			assert.Equal(t, tt.max, pool.Max, "the max is untouched")
			assert.False(t, itemExists(s, item), "the draught's entity is gone")
			assert.NotContains(t, inventory(t, s, delver.ID).ItemIDs, item, "and out of the bag")
			reply := sender.to(playerID)
			require.NotEmpty(t, reply)
			last := reply[len(reply)-1]
			assert.Equal(t, string(constants.ActionUseItem), last.Action)
			assert.Equal(t, map[string]interface{}{"success": true}, last.Payload)
		})
	}
}

// A draught is refused and kept: resource_full at max, not_in_bag when it is
// not in the bag. FS-9JV5K §Change: The Restoring Draught D4.
func TestRun_UseItem_RestoringDraught_Refusals_ReplyTheReasonAndSpendNothing(t *testing.T) {
	tests := []struct {
		name   string
		reason string
		setup  func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID
	}{
		{"at max", RefusalResourceFull, func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID {
			pool := bodyPool(t, delver)
			pool.Current = pool.Max
			return carried(t, s, delver.ID, restoringDraught())
		}},
		{"on the ground", RefusalNotInBag, func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID {
			bodyPool(t, delver).Current = 0
			return s.AddItem(restoringDraught())
		}},
		{"in a consumable slot", RefusalNotInBag, func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID {
			bodyPool(t, delver).Current = 0
			return inConsumableSlot(t, s, delver, 2, restoringDraught())
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, playerID, delver, sender := useItemRun(t)
			item := tt.setup(t, s, delver)
			before := *bodyPool(t, delver)
			bagBefore := slices.Clone(inventory(t, s, delver.ID).ItemIDs)

			drinkDraughtNow(s, playerID, item)

			reply := lastReply(t, sender, playerID)
			assert.Equal(t, false, reply["success"])
			assert.Equal(t, tt.reason, reply["reason"])
			assert.Equal(t, before, *bodyPool(t, delver), "the pool is as it was")
			assert.Equal(t, bagBefore, inventory(t, s, delver.ID).ItemIDs, "the bag is as it was")
			assert.True(t, itemExists(s, item), "the draught is not spent")
			assert.False(t, delver.HasComponent(ecs.ComponentTypePotion), "nothing is recorded as consumed")
		})
	}
}

// Two draughts drunk on one tick: the second sees the first's result, a full
// pool, and is refused and kept. A stored draught drunk is recorded as
// consumed and starts no cooldown. FS-9JV5K §Change: The Restoring Draught
// Edge States; D3.
func TestRun_UseItem_TwoDraughtsOnOneTick_TheSecondRefusedFull(t *testing.T) {
	s, playerID, delver, sender := useItemRun(t)
	pool := bodyPool(t, delver)
	pool.Current, pool.Max = 50, 100
	first, second := restoringDraught(), restoringDraught()
	firstID := carried(t, s, delver.ID, first)
	secondID := carried(t, s, delver.ID, second)

	s.queueIntent(func() { s.useItem(playerID, firstID) })
	s.queueIntent(func() { s.useItem(playerID, secondID) })
	s.applyIntents()

	assert.Equal(t, 100, pool.Current)
	assert.False(t, itemExists(s, firstID), "the first is spent")
	assert.True(t, itemExists(s, secondID), "the second is kept")
	assert.Contains(t, inventory(t, s, delver.ID).ItemIDs, secondID)
	assert.Equal(t, RefusalResourceFull, lastReply(t, sender, playerID)["reason"])
	assert.Equal(t, []uuid.UUID{*first.InstanceID}, consumedIDsOf(potionOf(t, delver)))
	assert.Zero(t, potionOf(t, delver).CooldownRemaining, "no cooldown")
}

// Dead, a draught is refused quietly as the antidote is: nothing changes and
// nothing is sent. FS-9JV5K §Change: The Restoring Draught Edge States.
func TestRun_UseItem_RestoringDraughtWhileDead_RefusedQuietly(t *testing.T) {
	s, playerID, delver, sender := useItemRun(t)
	pool := bodyPool(t, delver)
	pool.Current = 0
	item := carried(t, s, delver.ID, restoringDraught())
	kill(t, delver)
	sent := len(sender.to(playerID))

	drinkDraughtNow(s, playerID, item)

	assert.True(t, itemExists(s, item))
	assert.Zero(t, pool.Current)
	assert.Len(t, sender.to(playerID), sent, "nothing is sent")
}
