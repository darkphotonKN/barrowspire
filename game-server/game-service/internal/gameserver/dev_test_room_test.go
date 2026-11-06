package gameserver

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
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

// FS-BDRTJ §Requirements 1, 3-4, 8-10; §Acceptance Criteria. I-BDRTJ-1.

const (
	devRoomField = "dev_test_room"
	devGateX     = 120.0
	devGateY     = 900.0
)

// countingItems counts the gear checkouts an entry makes.
type countingItems struct {
	MockItemsClient
	checkouts atomic.Int32
}

func (c *countingItems) CheckOutRunGear(ctx context.Context, req *itemspb.CheckOutRunGearRequest) (*itemspb.CheckOutRunGearResponse, error) {
	c.checkouts.Add(1)
	return c.MockItemsClient.CheckOutRunGear(ctx, req)
}

// enterDevRoom seats a level 3 member at the room's hub gate on conn and walks
// them in, checking the switch was announced.
func enterDevRoom(t *testing.T, rig *fieldRig, conn *websocket.Conn) (*types.Player, *startSoloInbox, *game.Session) {
	t.Helper()

	room, ok := rig.server.FieldSession(game.FieldDevTestRoom)
	require.True(t, ok, "the room is built when on")

	wren, _, inbox := rig.inHubAt(t, "Wren", conn, devGateX, devGateY)
	require.Eventually(t, func() bool {
		return rig.hub.AtGate(wren.ID, components.GateDestinationDevTestRoom)
	}, startSoloSettle, 10*time.Millisecond, "the hub never measured them at the gate")

	sendEnterField(rig.server, conn, devRoomField)
	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterField))
	require.True(t, answered, "enter_field was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got error %q", startSoloErrorOf(reply))
	require.Equal(t, devRoomField, reply.Payload["field"])

	return wren, inbox, room
}

// Off, there is no room and no gate, and enter_field answers unknown_field. R3.
func TestDevTestRoom_Off_NoRoomNoGateUnknownField(t *testing.T) {
	rig := newFieldRig(t, &MockItemsClient{})

	_, built := rig.server.FieldSession(game.FieldDevTestRoom)
	assert.False(t, built)
	_, _, hasGate := rig.hub.GateArrival(components.GateDestinationDevTestRoom)
	assert.False(t, hasGate)

	_, conn, inbox := rig.inHubAt(t, "Wren", &websocket.Conn{}, devGateX, devGateY)
	sendEnterField(rig.server, conn, devRoomField)
	assertRefused(t, inbox, constants.ActionEnterField, "unknown_field")
}

// On, walking in seats a level 20 naked body with no items-service call, and
// the record stays as it was. R4, R8, R9.
func TestDevTestRoom_On_SeatsALevelTwentyNakedBodyWithNoCheckout(t *testing.T) {
	items := &countingItems{}
	rig := newFieldRig(t, items, WithDevTestRoom(true))

	x, y, hasGate := rig.hub.GateArrival(components.GateDestinationDevTestRoom)
	require.True(t, hasGate)
	assert.Equal(t, 260.0, x)
	assert.Equal(t, 900.0, y)

	wren, _, room := enterDevRoom(t, rig, &websocket.Conn{})

	assert.Zero(t, items.checkouts.Load(), "no gear checkout")

	body := bodyIn(room, wren.ID)
	require.NotNil(t, body)
	sc, _ := body.GetComponent(ecs.ComponentTypeStats)
	assert.Equal(t, 20, sc.(*components.StatsComponent).Level)
	ec, _ := body.GetComponent(ecs.ComponentTypeEquipment)
	equipment := ec.(*components.EquipmentComponent)
	assert.Nil(t, equipment.WeaponSlot)
	assert.Nil(t, equipment.ChestSlot)
	lc, _ := body.GetComponent(ecs.ComponentTypeItemIDList)
	assert.Empty(t, lc.(*components.ItemIDListComponent).ItemIDs)

	record := recordOf(t, rig.server, wren.ID)
	assert.Equal(t, 3, record.Character.Level, "only the body is level 20")
}

// No way out of the room settles: nothing reaches the settler and the record
// keeps its real level and experience. R10; AC "Every way out".
func TestDevTestRoom_EveryWayOut_SettlesNothing(t *testing.T) {
	type way func(t *testing.T, rig *fieldRig, wren *types.Player, conn *websocket.Conn, inbox *startSoloInbox, room *game.Session)

	tests := []struct {
		name string
		out  way
	}{
		{"leave_field", func(t *testing.T, rig *fieldRig, wren *types.Player, conn *websocket.Conn, inbox *startSoloInbox, room *game.Session) {
			rig.server.serverChan <- types.ClientPackage{Conn: conn, Message: types.Message{
				Action:  string(constants.ActionMove),
				Payload: map[string]interface{}{"player_id": wren.ID.String(), "vx": -1.0, "vy": 0.0},
			}}
			require.Eventually(t, func() bool {
				return room.AtGate(wren.ID, components.GateDestinationHub)
			}, spireGateWalk, 10*time.Millisecond, "never reached the road home")

			sendAction(rig.server, conn, constants.ActionLeaveField)
			reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionLeaveField))
			require.True(t, answered)
			require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got error %q", startSoloErrorOf(reply))
			assert.Equal(t, string(types.WorldTypeHub), reply.Payload["world_type"])
		}},
		{"disconnect", func(t *testing.T, rig *fieldRig, wren *types.Player, conn *websocket.Conn, _ *startSoloInbox, _ *game.Session) {
			rig.server.handleReadError(conn, &websocket.CloseError{Code: websocket.CloseAbnormalClosure})
			assert.True(t, rig.hub.HasPlayer(wren.ID), "home through the grace")
		}},
		{"leave_hub", func(t *testing.T, rig *fieldRig, _ *types.Player, conn *websocket.Conn, inbox *startSoloInbox, _ *game.Session) {
			sendAction(rig.server, conn, constants.ActionLeaveHub)
			reply, answered := inbox.await(string(constants.ActionWorldLeft), string(constants.ActionLeaveHub))
			require.True(t, answered)
			require.Equal(t, string(constants.ActionWorldLeft), reply.Action, "got error %q", startSoloErrorOf(reply))
		}},
		{"enter_hub", func(t *testing.T, rig *fieldRig, wren *types.Player, conn *websocket.Conn, inbox *startSoloInbox, _ *game.Session) {
			sendEnterHub(rig.server, conn, map[string]interface{}{"characterId": wren.Character.ID.String()})
			reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterHub))
			require.True(t, answered)
			require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got error %q", startSoloErrorOf(reply))
			assert.True(t, rig.hub.HasPlayer(wren.ID))
		}},
		{"normal close", func(t *testing.T, rig *fieldRig, _ *types.Player, conn *websocket.Conn, _ *startSoloInbox, _ *game.Session) {
			rig.server.cleanUpClient(conn)
		}},
		{"entry aborted after seating", func(t *testing.T, rig *fieldRig, wren *types.Player, _ *websocket.Conn, _ *startSoloInbox, room *game.Session) {
			// the one call EnterField makes once its move is refused
			assert.True(t, rig.server.endVisit(context.Background(), room, wren.ID))
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newFieldRig(t, &MockItemsClient{}, WithDevTestRoom(true))
			serverSide, _ := wsPair(t)
			wren, inbox, room := enterDevRoom(t, rig, serverSide)
			before := recordOf(t, rig.server, wren.ID).Character

			tt.out(t, rig, wren, serverSide, inbox, room)

			assert.False(t, room.HasPlayer(wren.ID), "the body is gone")
			assert.Empty(t, rig.settle.settled(), "no visit is published")
			if record, onRecord := recordIfAny(rig.server, wren.ID); onRecord {
				assert.Equal(t, before.Level, record.Character.Level, "the record keeps its level")
				assert.Equal(t, before.Experience, record.Character.Experience, "and its experience")
			}
		})
	}
}

// recordIfAny is the member's record, unless a normal close forgot them.
func recordIfAny(s *Server, id uuid.UUID) (types.Player, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	record, onRecord := s.players[id]
	if !onRecord {
		return types.Player{}, false
	}
	return *record, true
}
