package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-P9G8R §Requirements 2–4, 6; §WebSocket message surface; §Edge States
// "Unauthorized", "Hub / field", "Teammates". I-P9G8R-1.
//
// drink_potion is an inbound action on the message hub's loop, beside
// forfeit_run. Who drinks comes from the connection, never from the payload;
// the run applies it on its tick; nothing is ever sent back. The tests drive
// the hub as a client does and read the world through its state frames.

// drinkHurtWithPotion gives a live body a health potion in Consumable1 and
// leaves it at 10 of 1000 health. The tick reads the body's components with no
// lock the test could take, so each one is replaced whole through
// AddComponent, never written in place.
func drinkHurtWithPotion(t *testing.T, world *game.Session, memberID uuid.UUID, heal int) uuid.UUID {
	t.Helper()

	body := forfeitBodyOf(t, world, memberID)
	potionID := world.AddItem(types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: "Lesser Heal Potion", HealingAmount: heal,
	})

	ec, ok := body.GetComponent(ecs.ComponentTypeEquipment)
	require.True(t, ok)
	equipment := *ec.(*components.EquipmentComponent)
	equipment.Consumable1 = &potionID
	body.AddComponent(&equipment)
	body.AddComponent(&components.HealthComponent{CurrentHealth: 10, MaxHealth: 1000})

	return potionID
}

// drinkSend sends drink_potion as the client does: SocketManager stamps a
// player_id on every send, here naming whoever the test says.
func drinkSend(server *Server, conn *websocket.Conn, stampedPlayerID uuid.UUID) {
	server.serverChan <- types.ClientPackage{
		Conn: conn,
		Message: types.Message{
			Action:  string(constants.ActionDrinkPotion),
			Payload: map[string]interface{}{"player_id": stampedPlayerID.String()},
		},
	}
}

// drinkAssertSilent checks drink_potion got no reply: not an error, and not
// the hub's "Unknown action" either.
func drinkAssertSilent(t *testing.T, inbox *forfeitInbox) {
	t.Helper()

	for _, reply := range inbox.quiet(string(constants.ActionDrinkPotion)) {
		assert.Fail(t, "drink_potion sends no message", "got a reply with error %q", forfeitErrorOf(reply))
	}
}

func drinkPotionExists(world *game.Session, potionID uuid.UUID) bool {
	_, ok := world.EntityManager.GetEntity(potionID)
	return ok
}

// The drinker is the connection's player: a player_id in the payload naming a
// teammate changes nothing about who drinks. FS-P9G8R §Requirements 2;
// §User Stories 25.
func TestDrinkPotion_DrinkerIsTheConnectionsPlayer(t *testing.T) {
	server, _ := forfeitServer(t, newForfeitEmitterSpy())
	wren, wrenConn, wrenInbox := forfeitEnter(t, server, "Wren")
	kaelen, _, kaelenInbox := forfeitEnter(t, server, "Kaelen")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren, kaelen}})
	t.Cleanup(run.Shutdown)
	wrenInbox.awaitTicks(t, run.ID, 2) // both seated: their first gear pass is behind them

	wrenPotion := drinkHurtWithPotion(t, run, wren.ID, 25)
	kaelenPotion := drinkHurtWithPotion(t, run, kaelen.ID, 25)
	kaelenInbox.awaitFrame(t, run.ID, "Kaelen hurt", func(frame *types.ClientGameState) bool {
		return frame.CurrentPlayer != nil && frame.CurrentPlayer.CurrentHealth == 10
	})

	drinkSend(server, wrenConn, kaelen.ID)

	wrenInbox.awaitFrame(t, run.ID, "Wren healed", func(frame *types.ClientGameState) bool {
		return frame.CurrentPlayer != nil && frame.CurrentPlayer.CurrentHealth == 35 &&
			frame.CurrentPlayer.Equipment != nil && frame.CurrentPlayer.Equipment.Consumable1 == nil
	})
	drinkAssertSilent(t, wrenInbox)
	kaelenInbox.awaitTicks(t, run.ID, 2)
	assert.Equal(t, 10, kaelenInbox.ownHealth(t, run.ID), "the teammate named in the payload did not drink")
	assert.False(t, drinkPotionExists(run, wrenPotion), "the sender's potion is used up")
	assert.True(t, drinkPotionExists(run, kaelenPotion), "the teammate's potion is kept")
}

// Outside a run drink_potion is a silent no-op: from the hub, from a field
// and from a member in no world. FS-P9G8R §Requirements 3; §Edge States
// "Hub / field", "Unauthorized".
func TestDrinkPotion_IgnoredOutsideARun(t *testing.T) {
	t.Run("hub", func(t *testing.T) {
		server, hub := forfeitServer(t, newForfeitEmitterSpy())
		wren, conn, inbox := forfeitEnter(t, server, "Wren")
		inbox.awaitTicks(t, hub.ID, 2)
		potion := drinkHurtWithPotion(t, hub, wren.ID, 25)

		drinkSend(server, conn, wren.ID)

		drinkAssertSilent(t, inbox)
		inbox.awaitTicks(t, hub.ID, 2)
		assert.Equal(t, 10, inbox.ownHealth(t, hub.ID))
		assert.True(t, drinkPotionExists(hub, potion))
	})

	t.Run("field", func(t *testing.T) {
		server, _ := forfeitServer(t, newForfeitEmitterSpy())
		meadows, ok := server.FieldSession(game.FieldGentleMeadows)
		require.True(t, ok)
		wren, conn, inbox := forfeitEnter(t, server, "Wren")
		meadows.AddPlayerAt(wren.ID, wren.Character, "", 400, 400)
		server.setCurrentWorld(wren, meadows.ID)
		inbox.awaitTicks(t, meadows.ID, 2)
		potion := drinkHurtWithPotion(t, meadows, wren.ID, 25)

		drinkSend(server, conn, wren.ID)

		drinkAssertSilent(t, inbox)
		inbox.awaitTicks(t, meadows.ID, 2)
		assert.Equal(t, 10, inbox.ownHealth(t, meadows.ID))
		assert.True(t, drinkPotionExists(meadows, potion))
	})

	t.Run("no world", func(t *testing.T) {
		server, hub := forfeitServer(t, newForfeitEmitterSpy())
		wren, conn, inbox := forfeitEnter(t, server, "Wren")
		hub.RemovePlayer(wren.ID.String())
		server.setCurrentWorld(wren, uuid.Nil)

		drinkSend(server, conn, wren.ID)

		drinkAssertSilent(t, inbox)
	})

	t.Run("connection with no player", func(t *testing.T) {
		server, _ := forfeitServer(t, newForfeitEmitterSpy())

		drinkSend(server, &websocket.Conn{}, uuid.New())
		// nothing to listen on: the hub's loop must simply go on
		_, conn, inbox := forfeitEnter(t, server, "Wren")
		forfeitSend(server, conn, forfeitRunAction)
		_, answered := inbox.await(forfeitRunAction)
		assert.True(t, answered, "the hub still answers after an unowned drink_potion")
	})
}
