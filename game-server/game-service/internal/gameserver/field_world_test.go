package gameserver

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	grpcitems "github.com/darkphotonKN/barrowspire-server/game-service/grpc/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §A R1–R8, §B R9–R21, §F R49; Acceptance Criteria 1–9, 21; Edge
// States "Empty field", "Queue unreadable", "Items-service down / slow",
// "Leave races", "Disconnect, reconnect within grace", "Hub full", "A stale
// enter_field". I-X2F2H-1.
//
// The tests drive the message hub as a client would: a message on the server
// channel, routed on the sender's record, answered on the sender's writer
// channel. A member is set down at the Meadows gate directly
// (Session.AddPlayerAt) rather than walked across the hub: the gate is
// measured by the hub's own tick either way.

// The world a field visit opens, as the wire names it.
const meadowsField = "gentle_meadows"

// settleSpy is the visit settlement seam, counting every visit handed to it.
type settleSpy struct {
	mu     sync.Mutex
	visits []game.FieldVisit
}

func (s *settleSpy) PublishFieldVisit(_ context.Context, visit game.FieldVisit) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.visits = append(s.visits, visit)
	return nil
}

func (s *settleSpy) settled() []game.FieldVisit {
	s.mu.Lock()
	defer s.mu.Unlock()

	return append([]game.FieldVisit(nil), s.visits...)
}

// fieldRig is a server with its hub and its Meadows channel, the settlement
// seam spied on.
type fieldRig struct {
	server     *Server
	hub        *game.Session
	meadows    *game.Session
	queue      *startSoloQueue
	characters *fakeCharacters
	settle     *settleSpy
}

func newFieldRig(t *testing.T, items grpcitems.ItemsClient) *fieldRig {
	t.Helper()

	queue := newStartSoloQueue()
	characters := newFakeCharacters()
	server := newTestServer(t, context.Background(), &MockAuthClient{}, queue, &MockEventEmitter{}, items, characters, testPodID, testPodAddr, noopAnnouncer{})
	spy := &settleSpy{}
	server.visitSettler = spy

	hub, ok := server.HubSession()
	require.True(t, ok)
	meadows, ok := server.FieldSession(game.FieldGentleMeadows)
	require.True(t, ok, "the server builds the Meadows at startup")

	return &fieldRig{server: server, hub: hub, meadows: meadows, queue: queue, characters: characters, settle: spy}
}

// atMeadowsGate seats a fresh member in the hub standing at the Meadows gate,
// as a character character-service knows, and listens on their connection.
func (r *fieldRig) atMeadowsGate(t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	return r.inHubAt(t, name, &websocket.Conn{}, 1960, 360)
}

// inHubAt seats a fresh member in the hub at (x, y) on conn, once the hub's
// tick has measured them there.
func (r *fieldRig) inHubAt(t *testing.T, name string, conn *websocket.Conn, x, y float64) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	player := &types.Player{ID: uuid.New(), Username: name}
	character := r.characters.give(player.ID, "warrior", name, 3, 900)
	player.Character = character
	registerTestConn(r.server, conn, player)

	r.hub.AddPlayerAt(player.ID, character, "", x, y)
	r.server.setCurrentWorld(player, r.hub.ID)

	return player, conn, startSoloListen(t, r.server, conn)
}

// awaitAtMeadowsGate waits for the hub's tick to measure the member at the gate.
func (r *fieldRig) awaitAtMeadowsGate(t *testing.T, player *types.Player) {
	t.Helper()

	require.Eventually(t, func() bool {
		return r.hub.AtGate(player.ID, components.GateDestinationMeadows)
	}, startSoloSettle, 10*time.Millisecond, "the hub never measured them at the Meadows gate")
}

func sendEnterField(server *Server, conn *websocket.Conn, field string) {
	server.serverChan <- types.ClientPackage{
		Conn: conn,
		Message: types.Message{
			Action:  string(constants.ActionEnterField),
			Payload: map[string]interface{}{"field": field},
		},
	}
}

func sendAction(server *Server, conn *websocket.Conn, action constants.Action) {
	server.serverChan <- types.ClientPackage{Conn: conn, Message: types.Message{Action: string(action)}}
}

// enterMeadows walks a member at the gate into the Meadows and checks the
// switch was announced.
func (r *fieldRig) enterMeadows(t *testing.T, player *types.Player, conn *websocket.Conn, inbox *startSoloInbox) {
	t.Helper()

	r.awaitAtMeadowsGate(t, player)
	sendEnterField(r.server, conn, meadowsField)

	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterField))
	require.True(t, answered, "enter_field was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action,
		"enter_field at the gate is answered with world_entered; got %q with error %q", reply.Action, startSoloErrorOf(reply))
}

// walkToEntrance walks a member west from the field's arrival point until the
// field's tick has them at its entrance.
func (r *fieldRig) walkToEntrance(t *testing.T, player *types.Player, conn *websocket.Conn) {
	t.Helper()

	r.server.serverChan <- types.ClientPackage{
		Conn: conn,
		Message: types.Message{
			Action:  string(constants.ActionMove),
			Payload: map[string]interface{}{"player_id": player.ID.String(), "vx": -1.0, "vy": 0.0},
		},
	}
	require.Eventually(t, func() bool {
		return r.meadows.AtGate(player.ID, components.GateDestinationHub)
	}, spireGateWalk, 10*time.Millisecond, "never reached the road home on foot")
}

// assertRefused checks the one reply a refused field action gets: an error on
// its own action carrying the stable reason the client switches on.
func assertRefused(t *testing.T, inbox *startSoloInbox, action constants.Action, reason string) {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(action))
	require.True(t, answered, "%s was never answered", action)
	require.Equal(t, string(action), reply.Action, "a refusal is answered on its own action, not with %q", reply.Action)
	require.NotNil(t, reply.Error, "the refusal carries an error")
	assert.Equal(t, reason, reply.Payload["reason"], "the stable reason")
	assert.NotEmpty(t, reply.Payload["message"], "and words")
}

// bodyIn is the member's body in world, or nil.
func bodyIn(world *game.Session, memberID uuid.UUID) *ecs.Entity {
	for _, entity := range world.EntityManager.GetAllEntities() {
		pc, ok := entity.GetComponent(ecs.ComponentTypePlayer)
		if ok && pc.(*components.PlayerComponent).MemberID == memberID {
			return entity
		}
	}
	return nil
}

// A pod boots one Meadows channel beside the hub, a field of its own kind.
// R1, R2, R4; AC 1.
func TestServer_BootsTheMeadowsBesideTheHub(t *testing.T) {
	rig := newFieldRig(t, &MockItemsClient{})

	assert.Equal(t, types.WorldTypeField, rig.meadows.WorldType())
	assert.Equal(t, game.FieldGentleMeadows, rig.meadows.FieldID())
	assert.NotEqual(t, rig.hub.ID, rig.meadows.ID)

	registered, ok := rig.server.GetGameSession(rig.meadows.ID)
	require.True(t, ok, "the channel is a registered world")
	assert.Same(t, rig.meadows, registered)
	assert.False(t, rig.meadows.Ended(), "it ticks with nobody in it")
}

// enter_field at the Meadows gate switches the player into the channel on the
// same connection. R9, R11; AC 2.
func TestEnterField_AtTheMeadowsGate_SwitchesWorlds(t *testing.T) {
	rig := newFieldRig(t, &MockItemsClient{})
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
	rig.awaitAtMeadowsGate(t, wren)

	sendEnterField(rig.server, conn, meadowsField)

	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterField))
	require.True(t, answered)
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got error %q", startSoloErrorOf(reply))
	assert.Equal(t, string(types.WorldTypeField), reply.Payload["world_type"])
	assert.Equal(t, meadowsField, reply.Payload["field"])
	assert.Equal(t, rig.meadows.ID.String(), reply.Payload["session_id"])

	assert.False(t, rig.hub.HasPlayer(wren.ID), "the hub body is gone")
	assert.True(t, rig.meadows.HasPlayer(wren.ID), "a body in the Meadows")
	assert.Equal(t, rig.meadows.ID, startSoloWorldOnRecord(t, rig.server, wren.ID), "the record names the field")
	assert.Empty(t, rig.settle.settled(), "entering settles nothing")
	assert.Zero(t, rig.queue.joinCalls(), "the queue is never asked")
}

// Hub and run world_entered messages are unchanged: no field id. R2.
func TestWorldEnteredMessage_FieldIDOnlyForAField(t *testing.T) {
	rig := newFieldRig(t, &MockItemsClient{})

	_, inHub := worldEnteredMessage(rig.hub).Payload["field"]
	assert.False(t, inHub)
	assert.Equal(t, meadowsField, worldEnteredMessage(rig.meadows).Payload["field"])
}

// Entry is refused, in order, with a stable reason, and no body is created.
// R10; AC 3; Edge States "A stale enter_field", "Items-service down".
func TestEnterField_Refusals(t *testing.T) {
	tests := []struct {
		name   string
		items  grpcitems.ItemsClient
		setup  func(t *testing.T, rig *fieldRig, player *types.Player, conn *websocket.Conn, inbox *startSoloInbox)
		field  string
		reason string
	}{
		{
			name: "already in the field",
			setup: func(t *testing.T, rig *fieldRig, player *types.Player, conn *websocket.Conn, inbox *startSoloInbox) {
				rig.enterMeadows(t, player, conn, inbox)
			},
			field: meadowsField, reason: "not_in_hub",
		},
		{
			name: "in no world",
			setup: func(t *testing.T, rig *fieldRig, player *types.Player, _ *websocket.Conn, _ *startSoloInbox) {
				rig.hub.RemovePlayer(player.ID.String())
				rig.server.setCurrentWorld(player, uuid.Nil)
			},
			field: meadowsField, reason: "not_in_hub",
		},
		{
			name: "no character in play",
			setup: func(t *testing.T, rig *fieldRig, player *types.Player, _ *websocket.Conn, _ *startSoloInbox) {
				rig.server.mu.Lock()
				player.Character = types.CharacterInPlay{}
				rig.server.mu.Unlock()
			},
			field: meadowsField, reason: "no_character",
		},
		{name: "unknown field", field: "nowhere", reason: "unknown_field"},
		{name: "a field this pod does not build", field: "sunken_fen", reason: "unknown_field"},
		{
			name: "queued for the Spire",
			setup: func(t *testing.T, rig *fieldRig, player *types.Player, _ *websocket.Conn, _ *startSoloInbox) {
				rig.queue.hold(player)
			},
			field: meadowsField, reason: "queued",
		},
		{name: "loadout unreadable", items: &failingLoadoutItems{}, field: meadowsField, reason: "loadout_unavailable"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			items := tt.items
			if items == nil {
				items = &MockItemsClient{}
			}
			rig := newFieldRig(t, items)
			wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
			rig.awaitAtMeadowsGate(t, wren)
			if tt.setup != nil {
				tt.setup(t, rig, wren, conn, inbox)
			}
			bodiesBefore := len(rig.meadows.GetPlayerIDs())

			sendEnterField(rig.server, conn, tt.field)

			assertRefused(t, inbox, constants.ActionEnterField, tt.reason)
			assert.Equal(t, bodiesBefore, len(rig.meadows.GetPlayerIDs()), "no body is created on a refusal")
			assert.Empty(t, rig.settle.settled(), "a refusal settles nothing")
		})
	}

	t.Run("away from the gate", func(t *testing.T) {
		rig := newFieldRig(t, &MockItemsClient{})
		wren, conn, inbox := rig.inHubAt(t, "Wren", &websocket.Conn{}, constants.HubSpawnX, constants.HubSpawnY)

		sendEnterField(rig.server, conn, meadowsField)

		assertRefused(t, inbox, constants.ActionEnterField, "not_at_gate")
		assert.False(t, rig.meadows.HasPlayer(wren.ID))
		assert.True(t, rig.hub.HasPlayer(wren.ID), "still standing in the hub")
	})

	t.Run("an unreadable queue is not a queue they are in", func(t *testing.T) {
		rig := newFieldRig(t, &MockItemsClient{})
		wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
		rig.queue.unreadable(errors.New("redis down"))

		rig.enterMeadows(t, wren, conn, inbox)

		assert.True(t, rig.meadows.HasPlayer(wren.ID))
	})
}

// stallingItems holds every loadout read until released (or its context ends),
// saying when one has started.
type stallingItems struct {
	MockItemsClient
	started chan struct{}
	release chan struct{}
}

func (s *stallingItems) GetLoadoutWithItems(ctx context.Context, _ *itemspb.GetLoadoutWithItemsRequest) (*itemspb.GetLoadoutWithItemsResponse, error) {
	select {
	case s.started <- struct{}{}:
	default:
	}
	select {
	case <-s.release:
		return &itemspb.GetLoadoutWithItemsResponse{}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// A slow items-service delays only the one entry: the loadout is read before
// the field's lock, so the field keeps seating and ticking for everyone else.
// R12; AC 4; Edge State "Items-service slow".
func TestEnterField_AStalledLoadoutReadDoesNotHoldTheField(t *testing.T) {
	items := &stallingItems{started: make(chan struct{}, 1), release: make(chan struct{})}
	rig := newFieldRig(t, items)
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
	rig.awaitAtMeadowsGate(t, wren)

	sendEnterField(rig.server, conn, meadowsField)
	select {
	case <-items.started:
	case <-time.After(startSoloSettle):
		t.Fatal("the loadout read never started")
	}

	within(t, 200*time.Millisecond, "the field's lock while a loadout read stalls", func() {
		_, err := rig.meadows.SeatVisitor(uuid.New(), types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Kaelen"}, &itemspb.GetLoadoutWithItemsResponse{})
		require.NoError(t, err)
		_ = rig.meadows.GetPlayerIDs()
	})
	within(t, 200*time.Millisecond, "the message hub while a loadout read stalls", func() {
		sendEnterField(rig.server, &websocket.Conn{}, meadowsField)
	})

	close(items.release)
	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterField))
	require.True(t, answered)
	assert.Equal(t, string(constants.ActionWorldEntered), reply.Action)
}

// loadoutItems answers every loadout read with one loadout.
type loadoutItems struct {
	MockItemsClient
	loadout *itemspb.GetLoadoutWithItemsResponse
}

func (l *loadoutItems) GetLoadoutWithItems(context.Context, *itemspb.GetLoadoutWithItemsRequest) (*itemspb.GetLoadoutWithItemsResponse, error) {
	return l.loadout, nil
}

// The field body wears the equipped loadout, an item above the character's
// level carried, as a run's does. R11 (D5); AC 5.
func TestEnterField_TheBodyWearsTheLoadout(t *testing.T) {
	rig := newFieldRig(t, &loadoutItems{loadout: &itemspb.GetLoadoutWithItemsResponse{
		Weapon: &itemspb.ItemInstance{Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "weapon", Name: "Seax", RequiredLevel: 3},
		Head:   &itemspb.ItemInstance{Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "armor", ArmorSlot: "head", Name: "Barrow Helm", RequiredLevel: 5},
	}})
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")

	rig.enterMeadows(t, wren, conn, inbox)

	body := bodyIn(rig.meadows, wren.ID)
	require.NotNil(t, body)
	ec, _ := body.GetComponent(ecs.ComponentTypeEquipment)
	equipment := ec.(*components.EquipmentComponent)
	assert.NotNil(t, equipment.WeaponSlot, "the level-3 sword is worn")
	assert.Nil(t, equipment.HeadSlot, "the level-5 helm is not worn")
	lc, _ := body.GetComponent(ecs.ComponentTypeItemIDList)
	assert.Len(t, lc.(*components.ItemIDListComponent).ItemIDs, 1, "the helm is carried")
}

// leave_field at the entrance settles the visit and seats the player at the
// Meadows gate's arrival point; the field survives its last player. R14, R15;
// AC 1, 6, 10.
func TestLeaveField_AtTheEntrance_ComesHome(t *testing.T) {
	rig := newFieldRig(t, &loadoutItems{loadout: &itemspb.GetLoadoutWithItemsResponse{
		Weapon: &itemspb.ItemInstance{Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "weapon", Name: "Seax"},
	}})
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
	rig.enterMeadows(t, wren, conn, inbox)
	body := bodyIn(rig.meadows, wren.ID)
	require.NotNil(t, body)
	ec, _ := body.GetComponent(ecs.ComponentTypeEquipment)
	sword := *ec.(*components.EquipmentComponent).WeaponSlot
	rig.walkToEntrance(t, wren, conn)

	sendAction(rig.server, conn, constants.ActionLeaveField)

	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionLeaveField))
	require.True(t, answered)
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got error %q", startSoloErrorOf(reply))
	assert.Equal(t, string(types.WorldTypeHub), reply.Payload["world_type"])

	assert.False(t, rig.meadows.HasPlayer(wren.ID), "the field body is gone")
	_, swordLeft := rig.meadows.EntityManager.GetEntity(sword)
	assert.False(t, swordLeft, "and the items it held")
	require.True(t, rig.hub.HasPlayer(wren.ID))
	x, y := positionOf(t, rig.hub.EntityManager.GetAllEntities(), wren.ID)
	assert.Equal(t, 1820.0, x, "set down at the Meadows gate's arrival point")
	assert.Equal(t, 360.0, y)
	assert.Equal(t, rig.hub.ID, startSoloWorldOnRecord(t, rig.server, wren.ID))

	settled := rig.settle.settled()
	require.Len(t, settled, 1, "the visit settles once")
	assert.Equal(t, wren.ID, settled[0].MemberID)
	assert.Equal(t, game.FieldGentleMeadows, settled[0].Field)

	_, registered := rig.server.GetGameSession(rig.meadows.ID)
	assert.True(t, registered, "the field outlives its last player")
	assert.False(t, rig.meadows.Ended())
}

// Away from the entrance, or fallen, leave_field is refused and the body stays;
// from the hub it is not_in_field. R14; AC 6.
func TestLeaveField_Refusals(t *testing.T) {
	t.Run("away from the entrance", func(t *testing.T) {
		rig := newFieldRig(t, &MockItemsClient{})
		wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
		rig.enterMeadows(t, wren, conn, inbox)

		sendAction(rig.server, conn, constants.ActionLeaveField)

		assertRefused(t, inbox, constants.ActionLeaveField, "not_at_gate")
		assert.True(t, rig.meadows.HasPlayer(wren.ID))
		assert.Empty(t, rig.settle.settled())
	})

	t.Run("fallen at the entrance", func(t *testing.T) {
		rig := newFieldRig(t, &MockItemsClient{})
		wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
		rig.enterMeadows(t, wren, conn, inbox)
		rig.walkToEntrance(t, wren, conn)
		forfeitKill(t, rig.meadows, wren.ID)

		sendAction(rig.server, conn, constants.ActionLeaveField)

		assertRefused(t, inbox, constants.ActionLeaveField, "fallen")
		assert.True(t, rig.meadows.HasPlayer(wren.ID))
	})

	t.Run("not in a field", func(t *testing.T) {
		rig := newFieldRig(t, &MockItemsClient{})
		_, conn, inbox := rig.atMeadowsGate(t, "Wren")

		sendAction(rig.server, conn, constants.ActionLeaveField)

		assertRefused(t, inbox, constants.ActionLeaveField, "not_in_field")
	})
}

// A dropped connection in a field settles at once and moves the record to the
// hub, with a body at the Meadows gate held through the grace; a reconnect is
// announced the hub. R17 (D7); AC 7.
func TestDisconnectInAField_ComesHomeHeldThroughTheGrace(t *testing.T) {
	rig := newFieldRig(t, &MockItemsClient{})
	serverSide, _ := wsPair(t)
	wren, _, inbox := rig.inHubAt(t, "Wren", serverSide, 1960, 360)
	rig.enterMeadows(t, wren, serverSide, inbox)

	rig.server.handleReadError(serverSide, &websocket.CloseError{Code: websocket.CloseAbnormalClosure})

	require.Len(t, rig.settle.settled(), 1, "the visit settles at once")
	assert.False(t, rig.meadows.HasPlayer(wren.ID))
	assert.True(t, rig.hub.HasPlayer(wren.ID), "a hub body, held through the grace")
	record := recordOf(t, rig.server, wren.ID)
	assert.Equal(t, rig.hub.ID, record.CurrentGameSessionId)
	assert.Equal(t, constants.Reconnecting, *record.ConnectState)

	announced := make(chan interface{}, 1)
	rig.server.announceCurrentWorld(announced, &record)
	msg := (<-announced).(types.Message)
	assert.Equal(t, string(constants.ActionWorldEntered), msg.Action)
	assert.Equal(t, string(types.WorldTypeHub), msg.Payload["world_type"], "a reconnect is announced the hub")

	assert.False(t, rig.meadows.Ended(), "the field survives a disconnect")
}

// Leaving on purpose from a field: the visit settles, the record goes, the
// field stays. R5, R49.
func TestNormalCloseInAField_SettlesAndTheFieldStays(t *testing.T) {
	rig := newFieldRig(t, &MockItemsClient{})
	serverSide, _ := wsPair(t)
	wren, conn, inbox := rig.inHubAt(t, "Wren", serverSide, 1960, 360)
	rig.enterMeadows(t, wren, conn, inbox)

	rig.server.cleanUpClient(conn)

	assert.Len(t, rig.settle.settled(), 1)
	assert.False(t, rig.meadows.HasPlayer(wren.ID))
	assert.False(t, rig.hub.HasPlayer(wren.ID), "nobody is home for a member who left")
	_, registered := rig.server.GetGameSession(rig.meadows.ID)
	assert.True(t, registered, "the field is never shut down")
	assert.False(t, rig.meadows.Ended())
}

// leave_hub from a field settles and leaves for the roster. R18; AC 8.
func TestLeaveHub_FromAField_SettlesAndLeavesForTheRoster(t *testing.T) {
	rig := newFieldRig(t, &MockItemsClient{})
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
	rig.enterMeadows(t, wren, conn, inbox)

	sendAction(rig.server, conn, constants.ActionLeaveHub)

	reply, answered := inbox.await(string(constants.ActionWorldLeft), string(constants.ActionLeaveHub))
	require.True(t, answered)
	require.Equal(t, string(constants.ActionWorldLeft), reply.Action, "got error %q", startSoloErrorOf(reply))
	assert.Len(t, rig.settle.settled(), 1)
	assert.False(t, rig.meadows.HasPlayer(wren.ID))
	assert.False(t, rig.hub.HasPlayer(wren.ID))
	assert.Equal(t, uuid.Nil, startSoloWorldOnRecord(t, rig.server, wren.ID))
}

// enter_hub from a field settles and seats the player in the hub as the
// requested character; a field is never resumed. R19; AC 8.
func TestEnterHub_FromAField_SettlesAndSeatsTheHub(t *testing.T) {
	rig := newFieldRig(t, &MockItemsClient{})
	wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
	rig.enterMeadows(t, wren, conn, inbox)
	other := rig.characters.give(wren.ID, "mage", "Wren the Second", 1, 0)

	sendEnterHub(rig.server, conn, map[string]interface{}{"characterId": other.ID.String()})

	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterHub))
	require.True(t, answered)
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got error %q", startSoloErrorOf(reply))
	assert.Equal(t, string(types.WorldTypeHub), reply.Payload["world_type"])
	assert.Len(t, rig.settle.settled(), 1)
	assert.False(t, rig.meadows.HasPlayer(wren.ID))
	assert.True(t, rig.hub.HasPlayer(wren.ID))
	record := recordOf(t, rig.server, wren.ID)
	assert.Equal(t, rig.hub.ID, record.CurrentGameSessionId)
	assert.Equal(t, other.ID, record.Character.ID, "as the requested character")
}

// find_game and start_solo from a field start nothing: the player is answered
// with the field they are in. R20; AC 8.
func TestFindGameAndStartSolo_FromAField_StartNothing(t *testing.T) {
	for _, action := range []constants.Action{constants.ActionFindGame, constants.ActionStartSolo} {
		t.Run(string(action), func(t *testing.T) {
			rig := newFieldRig(t, &MockItemsClient{})
			wren, conn, inbox := rig.atMeadowsGate(t, "Wren")
			rig.enterMeadows(t, wren, conn, inbox)
			worlds := startSoloSessionCount(rig.server)

			sendAction(rig.server, conn, action)

			reply, answered := inbox.await(string(constants.ActionWorldEntered), string(action))
			require.True(t, answered)
			require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got error %q", startSoloErrorOf(reply))
			assert.Equal(t, string(types.WorldTypeField), reply.Payload["world_type"], "answered with the field")
			assert.Equal(t, meadowsField, reply.Payload["field"])
			assert.Equal(t, worlds, startSoloSessionCount(rig.server), "no run is built")
			assert.Zero(t, rig.queue.joinCalls(), "nobody is queued")
			assert.True(t, rig.meadows.HasPlayer(wren.ID))
		})
	}
}

// A leave racing a disconnect settles exactly once, and the member ends with
// one hub body. R49; AC 9 (run under -race).
func TestLeaveField_RacingADisconnect_SettlesOnce(t *testing.T) {
	for range 5 {
		rig := newFieldRig(t, &MockItemsClient{})
		serverSide, _ := wsPair(t)
		wren, _, inbox := rig.inHubAt(t, "Wren", serverSide, 1960, 360)
		rig.enterMeadows(t, wren, serverSide, inbox)
		rig.walkToEntrance(t, wren, serverSide)

		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			sendAction(rig.server, serverSide, constants.ActionLeaveField)
		}()
		go func() {
			defer wg.Done()
			rig.server.handleReadError(serverSide, &websocket.CloseError{Code: websocket.CloseAbnormalClosure})
		}()
		wg.Wait()

		require.Eventually(t, func() bool {
			return rig.hub.HasPlayer(wren.ID) && !rig.meadows.HasPlayer(wren.ID)
		}, startSoloSettle, 10*time.Millisecond, "the member is never home")
		// the message hub may still be finishing the leave
		time.Sleep(50 * time.Millisecond)

		assert.Len(t, rig.settle.settled(), 1, "settled exactly once")
		assert.Equal(t, 1, entityCountFor(rig.hub.EntityManager.GetAllEntities(), wren.ID), "one hub body")
		assert.Equal(t, rig.hub.ID, recordOf(t, rig.server, wren.ID).CurrentGameSessionId)
	}
}
