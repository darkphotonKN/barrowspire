package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-9JV5K §D R17; §Acceptance Criteria "use_item with an antidote cures
// poison and spends it". I-9JV5K-2.

// antidote is a stored antidote: it has an item_instances row.
func antidote() types.ItemConfig {
	instanceID := uuid.New()
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: types.AntidoteName,
		InstanceID: &instanceID,
	}
}

// useItemRun is a run with one seated delver whose replies are recorded.
func useItemRun(t *testing.T) (*Session, uuid.UUID, *ecs.Entity, *recordingSender) {
	t.Helper()
	s := coopRun(t)
	sender := &recordingSender{}
	s.sender = sender
	playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
	return s, playerID, delver, sender
}

// useItemOnTick queues the delver's use_item as the message loop does and
// runs the tick that applies it.
func useItemOnTick(s *Session, playerID, itemID uuid.UUID) {
	s.queueIntent(func() { s.useItem(playerID, itemID) })
	tick(s)
}

// A poisoned delver's use_item on an antidote in their bag ends the poison at
// once and spends the antidote: its entity gone, out of the bag, and the
// delver told it worked. FS-9JV5K §D R17.
func TestRun_UseItem_AntidoteInBagWhilePoisoned_CuresAndSpendsIt(t *testing.T) {
	s, playerID, delver, sender := useItemRun(t)
	item := carried(t, s, delver.ID, antidote())
	systems.Poison(delver, PoisonDuration)

	useItemOnTick(s, playerID, item)

	assert.Zero(t, poisonedFor(delver), "the poison is over")
	assert.False(t, itemExists(s, item), "the antidote's entity is gone")
	assert.NotContains(t, inventory(t, s, delver.ID).ItemIDs, item, "and out of the bag")
	reply := sender.to(playerID)
	require.NotEmpty(t, reply)
	last := reply[len(reply)-1]
	assert.Equal(t, string(constants.ActionUseItem), last.Action)
	assert.Equal(t, map[string]interface{}{"success": true}, last.Payload)
}

// Each refusal replies use_item { success: false, reason } and spends
// nothing: the item is where it was, the poison (if any) runs on.
// FS-9JV5K §D R17.
func TestRun_UseItem_Refusals_ReplyTheReasonAndSpendNothing(t *testing.T) {
	tests := []struct {
		name   string
		reason string
		setup  func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID
	}{
		{"an antidote while not poisoned", RefusalNotPoisoned, func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID {
			return carried(t, s, delver.ID, antidote())
		}},
		{"an antidote on the ground", RefusalNotInBag, func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID {
			systems.Poison(delver, PoisonDuration)
			return s.AddItem(antidote())
		}},
		{"an antidote in a consumable slot", RefusalNotInBag, func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID {
			systems.Poison(delver, PoisonDuration)
			return inConsumableSlot(t, s, delver, 2, antidote())
		}},
		{"an id that is no entity", RefusalNotInBag, func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID {
			systems.Poison(delver, PoisonDuration)
			return uuid.New()
		}},
		{"a health potion in the bag", RefusalNotUsable, func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID {
			systems.Poison(delver, PoisonDuration)
			return carried(t, s, delver.ID, healthPotion(25))
		}},
		{"a weapon in the bag", RefusalNotUsable, func(t *testing.T, s *Session, delver *ecs.Entity) uuid.UUID {
			systems.Poison(delver, PoisonDuration)
			return carried(t, s, delver.ID, types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeWeapon, Name: "Seax", AttackPower: 3})
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, playerID, delver, sender := useItemRun(t)
			item := tt.setup(t, s, delver)
			wasPoisoned := poisonedFor(delver) > 0
			bagBefore := slices.Clone(inventory(t, s, delver.ID).ItemIDs)
			existed := itemExists(s, item)

			s.queueIntent(func() { s.useItem(playerID, item) })
			s.applyIntents() // the use alone: the rest of the tick would run the poison down

			reply := lastReply(t, sender, playerID)
			assert.Equal(t, false, reply["success"])
			assert.Equal(t, tt.reason, reply["reason"])
			assert.Equal(t, string(constants.ActionUseItem), sender.to(playerID)[len(sender.to(playerID))-1].Action)
			assert.Equal(t, bagBefore, inventory(t, s, delver.ID).ItemIDs, "the bag is as it was")
			assert.Equal(t, existed, itemExists(s, item), "the item is not spent")
			assert.Equal(t, wasPoisoned, poisonedFor(delver) > 0, "the poison is as it was")
			assert.False(t, delver.HasComponent(ecs.ComponentTypePotion), "nothing is recorded as consumed")
		})
	}
}

// A stored antidote used is recorded as consumed, as a drunk potion is, and
// starts no drink cooldown; one found in this run has no row and records
// nothing. FS-9JV5K §D R17; FS-P9G8R §Requirements 11.
func TestRun_UseItem_RecordsAStoredAntidoteAsConsumed(t *testing.T) {
	s, playerID, delver, _ := useItemRun(t)
	stored := antidote()
	found := antidote()
	found.InstanceID = nil
	storedID := carried(t, s, delver.ID, stored)
	foundID := carried(t, s, delver.ID, found)

	systems.Poison(delver, PoisonDuration)
	useItemOnTick(s, playerID, storedID)
	require.Zero(t, poisonedFor(delver))
	assert.Equal(t, []uuid.UUID{*stored.InstanceID}, consumedIDsOf(potionOf(t, delver)))
	assert.Zero(t, potionOf(t, delver).CooldownRemaining, "no cooldown")

	systems.Poison(delver, PoisonDuration)
	useItemOnTick(s, playerID, foundID)
	assert.Zero(t, poisonedFor(delver), "a second antidote at once: no cooldown")
	assert.False(t, itemExists(s, foundID))
	assert.Equal(t, []uuid.UUID{*stored.InstanceID}, consumedIDsOf(potionOf(t, delver)), "the found one records nothing")
}

// Out of play, and outside a run, a use_item is refused quietly, as a drink
// is: nothing changes and nothing is sent. FS-9JV5K §D R17 ("in a run, while
// in play"); FS-P9G8R §Requirements 3.
func TestRun_UseItem_OutOfPlayOrOutsideARun_RefusedQuietly(t *testing.T) {
	tests := []struct {
		name  string
		world func(t *testing.T) *Session
		setup func(t *testing.T, delver *ecs.Entity)
	}{
		{"dead", func(t *testing.T) *Session { return coopRun(t) }, func(t *testing.T, delver *ecs.Entity) { kill(t, delver) }},
		{"escaped", func(t *testing.T) *Session { return coopRun(t) }, func(t *testing.T, delver *ecs.Entity) { markEscaped(t, delver) }},
		{"world is the hub", func(t *testing.T) *Session {
			return newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
		}, func(*testing.T, *ecs.Entity) {}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := tt.world(t)
			sender := &recordingSender{}
			s.sender = sender
			playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
			item := carried(t, s, delver.ID, antidote())
			systems.Poison(delver, PoisonDuration)
			tt.setup(t, delver)
			sent := len(sender.to(playerID))

			s.queueIntent(func() { s.useItem(playerID, item) })
			s.applyIntents()

			assert.True(t, itemExists(s, item))
			assert.Contains(t, inventory(t, s, delver.ID).ItemIDs, item)
			assert.Positive(t, poisonedFor(delver))
			assert.Len(t, sender.to(playerID), sent, "nothing is sent")
		})
	}
}
