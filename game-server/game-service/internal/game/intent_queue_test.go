package game

import (
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// clientMessage is a message as a client sends it.
func clientMessage(action constants.Action, playerID uuid.UUID, payload map[string]interface{}) types.ClientPackage {
	payload["player_id"] = playerID.String()
	return types.ClientPackage{Message: types.Message{Action: string(action), Payload: payload}}
}

// runConcurrently runs the session as a started one does, its message goroutine
// beside a goroutine ticking the world, and sends the messages from goroutines
// of their own while it ticks. Once the ticking stops and the message goroutine
// has returned, one more tick on the test's goroutine applies whatever was left
// queued, so the test then reads a world nothing else touches.
func runConcurrently(t *testing.T, s *Session, senders ...[]types.ClientPackage) {
	t.Helper()

	messagesDone := make(chan struct{})
	go func() {
		s.manageClientMessages()
		close(messagesDone)
	}()

	ticksDone := make(chan struct{})
	go func() {
		defer close(ticksDone)
		for range 120 {
			s.applyRequestedFloorChange()
			tick(s)
			time.Sleep(time.Millisecond)
		}
	}()

	var sending sync.WaitGroup
	for _, messages := range senders {
		sending.Add(1)
		go func() {
			defer sending.Done()
			for _, message := range messages {
				s.MessageCh <- message
			}
		}()
	}
	sending.Wait()

	<-ticksDone
	close(s.stopChan)
	<-messagesDone

	s.applyRequestedFloorChange()
	tick(s)
}

// lootedRunWithSender is a run built the way the server builds one, whose
// replies go to a recording dispatcher.
func lootedRunWithSender(t *testing.T) (*Session, *recordingDispatcher) {
	t.Helper()
	s := newRun(t, &countingItemsClient{})
	dispatcher := &recordingDispatcher{}
	s.sender = messaging.NewMessageSender(dispatcher)
	s.endSessionCh = make(chan bool, 64)
	return s, dispatcher
}

// Client actions reach the world through the tick, never beside it: an attack,
// an equip and a pickup sent while the world ticks race nothing (run under
// -race), and none of them is lost. I-77AB6-11.
func TestSession_HandlersConcurrentWithTheTick_AttackEquipAndLootAllLand(t *testing.T) {
	s, _ := lootedRunWithSender(t)
	playerID, delver := placeDelver(t, s, "warrior", 500, 500)
	target := unarmoredTarget(s, 545, 500)
	band := carried(t, s, delver.ID, ring("Band", 1))
	lootID := s.AddItem(*lootTemplateConfig())
	pileID := CreateDropPileEntity(s.EntityManager, 520, 500, []uuid.UUID{lootID}).ID

	attack := clientMessage(constants.ActionAttack, playerID, map[string]interface{}{"enemy_entity_id": target.ID.String()})
	equip := clientMessage(constants.ActionEquip, playerID, map[string]interface{}{"item_entity_id": band.String()})
	loot := clientMessage(constants.ActionInteract, playerID, map[string]interface{}{"entity_id": lootID.String()})
	var moves []types.ClientPackage
	for range 40 {
		moves = append(moves, clientMessage(constants.ActionMove, playerID, map[string]interface{}{"vx": 0.0, "vy": 0.0}))
	}
	stop := clientMessage(constants.ActionMove, playerID, map[string]interface{}{"vx": 0.0, "vy": 0.0})

	runConcurrently(t, s,
		[]types.ClientPackage{attack},
		[]types.ClientPackage{equip, loot},
		append(moves, stop),
	)

	assert.Less(t, currentHealth(target), 1000, "the attack landed")
	equipment := equipmentOf(t, s, delver.ID)
	require.NotNil(t, equipment.Ring1Slot, "the ring is worn")
	assert.Equal(t, band, *equipment.Ring1Slot)
	assert.Equal(t, []uuid.UUID{lootID}, inventory(t, s, delver.ID).ItemIDs, "the loot is carried, the ring is not")
	assert.Empty(t, itemList(t, s, pileID).ItemIDs, "the pile gave the loot up")
}

// A pickup and an equip sent as the party climbs are applied wholly on one floor
// or the other: whatever the delver carries or wears still exists after the
// climb, and nothing left in the old floor's pile comes along. FS-F6F88 §16,
// I-77AB6-11.
func TestSession_LootAndEquipDuringAFloorChange_NothingCarriedIsLost(t *testing.T) {
	for run := range 10 {
		s, _ := lootedRunWithSender(t)
		stairsIDs := entityIDsWith(s, ecs.ComponentTypeStairs)
		require.Len(t, stairsIDs, 1, "run %d", run)
		stairs, _ := s.EntityManager.GetEntity(stairsIDs[0])
		at := transformOf(t, stairs)

		playerID, delver := placeDelver(t, s, "warrior", at.X, at.Y)
		band := carried(t, s, delver.ID, ring("Band", 1))
		lootID := s.AddItem(*lootTemplateConfig())
		pileID := CreateDropPileEntity(s.EntityManager, at.X, at.Y, []uuid.UUID{lootID}).ID

		climb := clientMessage(constants.ActionInteract, playerID, map[string]interface{}{"entity_id": stairs.ID.String()})
		loot := clientMessage(constants.ActionInteract, playerID, map[string]interface{}{"entity_id": lootID.String()})
		equip := clientMessage(constants.ActionEquip, playerID, map[string]interface{}{"item_entity_id": band.String()})

		runConcurrently(t, s, []types.ClientPackage{climb}, []types.ClientPackage{loot}, []types.ClientPackage{equip})

		assert.Equal(t, 2, currentFloor(t, s).Depth, "run %d: the party climbed", run)
		equipment := equipmentOf(t, s, delver.ID)
		require.NotNil(t, equipment.Ring1Slot, "run %d: the ring is worn", run)
		assert.Equal(t, band, *equipment.Ring1Slot)
		for _, itemID := range append(inventory(t, s, delver.ID).ItemIDs, *equipment.Ring1Slot) {
			entity, exists := s.EntityManager.GetEntity(itemID)
			require.True(t, exists, "run %d: carried item %s climbed with the delver", run, itemID)
			assert.True(t, entity.HasComponent(ecs.ComponentTypeItem))
		}
		_, pileStands := s.EntityManager.GetEntity(pileID)
		assert.False(t, pileStands, "run %d: the old floor's pile is gone", run)
	}
}

// A refusal is still told to the player, word for word and in the same order,
// now that the tick applies the action: the equip level refusal, and a climb's
// gather refusal with the empty frame every failed interact is answered with.
// I-77AB6-11.
func TestSession_RefusalsFromTheTick_AreUnchanged(t *testing.T) {
	s, dispatcher := lootedRunWithSender(t)
	stairsIDs := entityIDsWith(s, ecs.ComponentTypeStairs)
	require.Len(t, stairsIDs, 1)
	stairs, _ := s.EntityManager.GetEntity(stairsIDs[0])
	at := transformOf(t, stairs)

	playerID, delver := placeDelver(t, s, "warrior", at.X, at.Y)
	placeDelver(t, s, "mage", at.X+400, at.Y) // away from the stairs
	lantern := carried(t, s, delver.ID, ring("Lantern of the Drowned", 9))

	runConcurrently(t, s, []types.ClientPackage{
		clientMessage(constants.ActionEquip, playerID, map[string]interface{}{"item_entity_id": lantern.String()}),
		clientMessage(constants.ActionInteract, playerID, map[string]interface{}{"entity_id": stairs.ID.String()}),
	})

	frames := dispatcher.framesTo(playerID)
	require.Len(t, frames, 3)
	assert.Equal(t, types.Message{Action: string(constants.ActionEquip), Payload: map[string]interface{}{
		"success": false,
		"message": "This item requires level 9.",
	}}, frames[0])
	assert.Equal(t, types.Message{Action: string(constants.ActionInteract), Payload: map[string]interface{}{
		"success": false,
		"message": "the party has not gathered at the stairs",
		"reason":  "party_not_gathered",
		"missing": 1,
	}}, frames[1])
	assert.Equal(t, types.Message{}, frames[2], "a failed interact is followed by the empty frame, as before")
}
