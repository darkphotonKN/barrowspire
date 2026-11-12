package gameserver

import (
	"math"
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

// FS-29KSH §Change: The acting player is the connection's.
//
// Who acts in a world is the connection's player, never a player_id the client
// put in the payload: the server already routes the message on the
// connection's record (§Requirements 16), and every client is told the ids of
// the others in its world. The tests drive the hub as a client does, two
// members in one run, and read who acted from each member's own state frames.

// actor is one member in the run as the tests drive them.
type actor struct {
	player *types.Player
	conn   *websocket.Conn
	inbox  *forfeitInbox
}

// actingRun seats Wren and Kaelen in one run, both past their first frames.
func actingRun(t *testing.T) (*Server, *game.Session, actor, actor) {
	t.Helper()

	server, _ := forfeitServer(t, newForfeitEmitterSpy())
	wrenPlayer, wrenConn, wrenInbox := forfeitEnter(t, server, "Wren")
	kaelenPlayer, kaelenConn, kaelenInbox := forfeitEnter(t, server, "Kaelen")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wrenPlayer, kaelenPlayer}})
	t.Cleanup(run.Shutdown)

	wren := actor{player: wrenPlayer, conn: wrenConn, inbox: wrenInbox}
	kaelen := actor{player: kaelenPlayer, conn: kaelenConn, inbox: kaelenInbox}
	wren.inbox.awaitTicks(t, run.ID, 2)
	kaelen.inbox.awaitTicks(t, run.ID, 2)

	return server, run, wren, kaelen
}

// actSend sends an in-world action on a connection with exactly the payload given.
func actSend(server *Server, conn *websocket.Conn, action constants.Action, payload map[string]interface{}) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: string(action), Payload: payload},
	}
}

// actOwn is the member's own state as their latest frame from the world shows it.
func actOwn(t *testing.T, a actor, world *game.Session) *types.CurrentPlayerState {
	t.Helper()

	a.inbox.mu.Lock()
	defer a.inbox.mu.Unlock()

	frame := a.inbox.latest[world.ID]
	require.NotNil(t, frame, "no frame from world %s yet", world.ID)
	require.NotNil(t, frame.CurrentPlayer, "the frame carries the recipient's own state")

	return frame.CurrentPlayer
}

// actPosition is where the member stands in their latest frame.
func actPosition(t *testing.T, a actor, world *game.Session) types.Position {
	t.Helper()

	own := actOwn(t, a, world)
	require.NotNil(t, own.PlayerState)
	require.NotNil(t, own.Position)

	return *own.Position
}

// actGive puts a fresh ring in the member's bag; the body's bag is replaced
// whole, never written in place, as the tick reads it with no lock the test
// could take.
func actGive(t *testing.T, world *game.Session, a actor) uuid.UUID {
	t.Helper()

	ringID := world.AddItem(types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeRing, Name: "Bone Ring"})
	body := forfeitBodyOf(t, world, a.player.ID)
	lc, ok := body.GetComponent(ecs.ComponentTypeItemIDList)
	require.True(t, ok)
	bag := append([]uuid.UUID{}, lc.(*components.ItemIDListComponent).ItemIDs...)
	body.AddComponent(components.NewItemIDListComponent(append(bag, ringID)))

	return ringID
}

// actWear puts a fresh ring on the member's first ring slot.
func actWear(t *testing.T, world *game.Session, a actor) uuid.UUID {
	t.Helper()

	ringID := world.AddItem(types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeRing, Name: "Iron Ring"})
	body := forfeitBodyOf(t, world, a.player.ID)
	ec, ok := body.GetComponent(ecs.ComponentTypeEquipment)
	require.True(t, ok)
	equipment := *ec.(*components.EquipmentComponent)
	equipment.Ring1Slot = &ringID
	body.AddComponent(&equipment)

	a.inbox.awaitFrame(t, world.ID, "the ring is worn", func(frame *types.ClientGameState) bool {
		return wornRing1(frame.CurrentPlayer) == ringID
	})

	return ringID
}

func wornRing1(own *types.CurrentPlayerState) uuid.UUID {
	if own == nil || own.PlayerState == nil || own.Equipment == nil || own.Equipment.Ring1 == nil {
		return uuid.Nil
	}
	return own.Equipment.Ring1.EntityID
}

func carries(own *types.CurrentPlayerState, itemID uuid.UUID) bool {
	if own == nil || own.PlayerState == nil {
		return false
	}
	for _, item := range own.Inventory {
		if item != nil && item.EntityID == itemID {
			return true
		}
	}
	return false
}

func monsterHealth(frame *types.ClientGameState, monsterID uuid.UUID) (int, int, bool) {
	for _, monster := range frame.Monsters {
		if monster != nil && monster.EntityID == monsterID {
			return monster.CurrentHealth, monster.MaxHealth, true
		}
	}
	return 0, 0, false
}

// actingCase is one in-world action: prepare readies the member's own target
// for it, on the side of them away from the other, and returns the payload a
// client sends for it, with no player_id; acted reads from a frame of the
// member's own whether the action landed for them.
type actingCase struct {
	action  constants.Action
	prepare func(t *testing.T, world *game.Session, member, other actor) (payload map[string]interface{}, acted func(*types.ClientGameState) bool)
}

var actingCases = []actingCase{
	{constants.ActionMove, func(t *testing.T, world *game.Session, member, _ actor) (map[string]interface{}, func(*types.ClientGameState) bool) {
		return map[string]interface{}{"vx": -1.0, "vy": 0.0}, func(frame *types.ClientGameState) bool {
			own := frame.CurrentPlayer
			return own != nil && own.PlayerState != nil && own.Direction != nil && own.Direction.VX == -1.0
		}
	}},
	{constants.ActionInteract, func(t *testing.T, world *game.Session, member, _ actor) (map[string]interface{}, func(*types.ClientGameState) bool) {
		at := actPosition(t, member, world)
		lootID := world.AddItem(types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeRing, Name: "Tin Ring"})
		game.CreateDropPileEntity(world.EntityManager, at.X, at.Y, []uuid.UUID{lootID})
		return map[string]interface{}{"entity_id": lootID.String()}, func(frame *types.ClientGameState) bool {
			return carries(frame.CurrentPlayer, lootID)
		}
	}},
	{constants.ActionAttack, func(t *testing.T, world *game.Session, member, other actor) (map[string]interface{}, func(*types.ClientGameState) bool) {
		at, away := actPosition(t, member, world), actPosition(t, other, world)
		dx, dy := at.X-away.X, at.Y-away.Y
		d := math.Hypot(dx, dy)
		require.Positive(t, d, "the two stand apart")
		// beside the member, on the far side from the other: within the
		// member's reach, out of the other's
		monster := game.CreateMonsterEntity(world.EntityManager, game.MonsterConfig{
			Archetype: components.MonsterArchetypeGhoul, Level: 1,
			X: at.X + dx/d*35, Y: at.Y + dy/d*35,
		})
		member.inbox.awaitFrame(t, world.ID, "the ghoul is in sight", func(frame *types.ClientGameState) bool {
			_, _, seen := monsterHealth(frame, monster.ID)
			return seen
		})
		return map[string]interface{}{"enemy_entity_id": monster.ID.String()}, func(frame *types.ClientGameState) bool {
			current, max, seen := monsterHealth(frame, monster.ID)
			return seen && current < max
		}
	}},
	{constants.ActionCastSkill, func(t *testing.T, world *game.Session, member, _ actor) (map[string]interface{}, func(*types.ClientGameState) bool) {
		at := actPosition(t, member, world)
		return map[string]interface{}{"skill_id": "dash", "target_x": at.X - 100, "target_y": at.Y}, func(frame *types.ClientGameState) bool {
			own := frame.CurrentPlayer
			return own != nil && own.Resource != nil && own.Resource.Current < own.Resource.Max
		}
	}},
	{constants.ActionEquip, func(t *testing.T, world *game.Session, member, _ actor) (map[string]interface{}, func(*types.ClientGameState) bool) {
		ringID := actGive(t, world, member)
		return map[string]interface{}{"item_entity_id": ringID.String()}, func(frame *types.ClientGameState) bool {
			return wornRing1(frame.CurrentPlayer) == ringID
		}
	}},
	{constants.ActionUnequip, func(t *testing.T, world *game.Session, member, _ actor) (map[string]interface{}, func(*types.ClientGameState) bool) {
		ringID := actWear(t, world, member)
		return map[string]interface{}{"item_entity_id": ringID.String()}, func(frame *types.ClientGameState) bool {
			return wornRing1(frame.CurrentPlayer) == uuid.Nil && carries(frame.CurrentPlayer, ringID)
		}
	}},
}

// A message on Wren's connection naming Kaelen in its player_id never acts for
// Kaelen: Kaelen's own target, beside Kaelen, is left as it was. Every client
// is told the other players' ids, so the payload's id is anyone's to write.
func TestInWorldAction_PayloadPlayerIDOfAnother_NeverActsForThem(t *testing.T) {
	for _, tc := range actingCases {
		t.Run(string(tc.action), func(t *testing.T) {
			server, run, wren, kaelen := actingRun(t)
			payload, acted := tc.prepare(t, run, kaelen, wren)
			payload["player_id"] = kaelen.player.ID.String()

			actSend(server, wren.conn, tc.action, payload)

			kaelen.inbox.awaitTicks(t, run.ID, 12)
			kaelen.inbox.mu.Lock()
			frame := kaelen.inbox.latest[run.ID]
			kaelen.inbox.mu.Unlock()
			assert.False(t, acted(frame), "%s sent on Wren's connection acted for Kaelen, the player its payload named", tc.action)
		})
	}
}

// A message with no player_id at all acts for the connection's player: the
// server takes who acts from the connection, so the client need not say.
func TestInWorldAction_NoPayloadPlayerID_ActsForTheConnectionsPlayer(t *testing.T) {
	for _, tc := range actingCases {
		t.Run(string(tc.action), func(t *testing.T) {
			server, run, wren, kaelen := actingRun(t)
			payload, acted := tc.prepare(t, run, wren, kaelen)

			actSend(server, wren.conn, tc.action, payload)

			wren.inbox.awaitFrame(t, run.ID, string(tc.action)+" with no player_id lands for the sender", acted)
		})
	}
}

// A refusal answers the connection that sent the message, never the player a
// payload names.
func TestInWorldAction_RefusalAnswersTheConnectionsPlayer(t *testing.T) {
	tests := []struct {
		action  constants.Action
		payload map[string]interface{}
	}{
		{constants.ActionMove, map[string]interface{}{"vx": "fast"}},
		{constants.ActionInteract, map[string]interface{}{"entity_id": "not-an-entity"}},
		{constants.ActionAttack, map[string]interface{}{"enemy_entity_id": "not-an-entity"}},
	}

	for _, tc := range tests {
		t.Run(string(tc.action), func(t *testing.T) {
			server, _, wren, kaelen := actingRun(t)
			tc.payload["player_id"] = kaelen.player.ID.String()

			actSend(server, wren.conn, tc.action, tc.payload)

			reply, answered := wren.inbox.await(string(tc.action))
			require.True(t, answered, "the sender is told their %s was refused", tc.action)
			assert.Equal(t, false, reply.Payload["success"])
			assert.Empty(t, kaelen.inbox.quiet(string(tc.action)), "the player the payload named is told nothing")
		})
	}
}
