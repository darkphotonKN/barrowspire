package game

import (
	"sync"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// sentFrame is one message the world pushed to one player.
type sentFrame struct {
	playerID uuid.UUID
	message  types.Message
}

// recordingDispatcher keeps every message pushed to a player, so a test can
// read what the player was told.
type recordingDispatcher struct {
	mu   sync.Mutex
	sent []sentFrame
}

func (d *recordingDispatcher) PushMessageToChannelQueue(playerID uuid.UUID, msg interface{}) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.sent = append(d.sent, sentFrame{playerID: playerID, message: msg.(types.Message)})
	return nil
}

func (d *recordingDispatcher) PushMessageToConn(_ *websocket.Conn, _ interface{}) error {
	return nil
}

func (d *recordingDispatcher) framesTo(playerID uuid.UUID) []types.Message {
	d.mu.Lock()
	defer d.mu.Unlock()
	var out []types.Message
	for _, f := range d.sent {
		if f.playerID == playerID {
			out = append(out, f.message)
		}
	}
	return out
}

// equipRun is a run whose outgoing messages are recorded.
func equipRun(t *testing.T, client *mockItemsClient) (*Session, *recordingDispatcher) {
	t.Helper()
	dispatcher := &recordingDispatcher{}
	s := newSession(&mockSessionCloser{}, messaging.NewMessageSender(dispatcher), &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, RunBounds())
	if client != nil {
		s.itemsClient = client
	}
	return s, dispatcher
}

// carried puts an item straight into a delver's inventory and returns its entity id.
func carried(t *testing.T, s *Session, playerEntityID uuid.UUID, config types.ItemConfig) uuid.UUID {
	t.Helper()
	itemID := s.AddItem(config)
	list := inventory(t, s, playerEntityID)
	list.ItemIDs = append(list.ItemIDs, itemID)
	return itemID
}

func inventory(t *testing.T, s *Session, playerEntityID uuid.UUID) *components.ItemIDListComponent {
	t.Helper()
	entity, ok := s.EntityManager.GetEntity(playerEntityID)
	require.True(t, ok)
	c, ok := entity.GetComponent(ecs.ComponentTypeItemIDList)
	require.True(t, ok)
	return c.(*components.ItemIDListComponent)
}

func equipmentOf(t *testing.T, s *Session, playerEntityID uuid.UUID) *components.EquipmentComponent {
	t.Helper()
	entity, ok := s.EntityManager.GetEntity(playerEntityID)
	require.True(t, ok)
	c, ok := entity.GetComponent(ecs.ComponentTypeEquipment)
	require.True(t, ok)
	return c.(*components.EquipmentComponent)
}

var level5Helm = types.ItemConfig{
	TemplateID: uuid.New(), ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead,
	Name: "Barrow Helm", DefenseRating: 4, RequiredLevel: 5,
}

// An item above the wearer's level is refused: it stays in the inventory and
// the player is told the level it needs. FS-BDA7X §Requirements 32.
func TestHandleEquip_AboveTheWearersLevel_IsRefusedWithTheRequiredLevel(t *testing.T) {
	s, dispatcher := equipRun(t, nil)
	playerID := uuid.New()
	playerEntityID := s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
	helmID := carried(t, s, playerEntityID, level5Helm)

	err := s.handleEquip(constants.ActionEquip, playerEntityID, helmID)

	assert.ErrorIs(t, err, ErrBelowRequiredLevel)
	assert.Nil(t, equipmentOf(t, s, playerEntityID).HeadSlot, "head slot stays empty")
	assert.Contains(t, inventory(t, s, playerEntityID).ItemIDs, helmID, "the helm stays in the inventory")

	frames := dispatcher.framesTo(playerID)
	require.Len(t, frames, 1)
	assert.Equal(t, string(constants.ActionEquip), frames[0].Action)
	payload := frames[0].Payload
	assert.Equal(t, false, payload["success"])
	assert.Contains(t, payload["message"], "requires level 5")
}

// Unequip is never gated, even for an item above the wearer's level.
// FS-BDA7X §Requirements 32.
func TestHandleEquip_Unequip_IsNeverGatedByLevel(t *testing.T) {
	s, dispatcher := equipRun(t, nil)
	playerID := uuid.New()
	playerEntityID := s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
	helmID := s.AddItem(level5Helm)
	equipmentOf(t, s, playerEntityID).HeadSlot = &helmID

	err := s.handleEquip(constants.ActionUnequip, playerEntityID, helmID)

	require.NoError(t, err)
	assert.Nil(t, equipmentOf(t, s, playerEntityID).HeadSlot)
	assert.Contains(t, inventory(t, s, playerEntityID).ItemIDs, helmID)
	assert.Empty(t, dispatcher.framesTo(playerID))
}

// The gate applies to every equip slot, consumables included; an item at or
// below the level, or with no requirement, equips. FS-BDA7X §Requirements 30, 32.
func TestHandleEquip_LevelGate_AppliesToEverySlot(t *testing.T) {
	slots := []struct {
		name   string
		config types.ItemConfig
		slot   func(*components.EquipmentComponent) *uuid.UUID
	}{
		{"weapon", types.ItemConfig{ItemType: types.ItemTypeWeapon, Name: "Seax"},
			func(e *components.EquipmentComponent) *uuid.UUID { return e.WeaponSlot }},
		{"head", types.ItemConfig{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead, Name: "Helm"},
			func(e *components.EquipmentComponent) *uuid.UUID { return e.HeadSlot }},
		{"chest", types.ItemConfig{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotChest, Name: "Hauberk"},
			func(e *components.EquipmentComponent) *uuid.UUID { return e.ChestSlot }},
		{"gloves", types.ItemConfig{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotGloves, Name: "Gauntlets"},
			func(e *components.EquipmentComponent) *uuid.UUID { return e.GlovesSlot }},
		{"legs", types.ItemConfig{ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotLegs, Name: "Greaves"},
			func(e *components.EquipmentComponent) *uuid.UUID { return e.LegsSlot }},
		{"consumable", types.ItemConfig{ItemType: types.ItemTypeConsumable, Name: "Tonic"},
			func(e *components.EquipmentComponent) *uuid.UUID { return e.Consumable1 }},
	}
	requirements := []struct {
		name          string
		requiredLevel int
		wantWorn      bool
	}{
		{"above the level is refused", 4, false},
		{"at the level equips", 3, true},
		{"below the level equips", 1, true},
		{"unset requirement equips", 0, true},
	}

	for _, slot := range slots {
		for _, req := range requirements {
			t.Run(slot.name+"/"+req.name, func(t *testing.T) {
				s, dispatcher := equipRun(t, nil)
				playerID := uuid.New()
				playerEntityID := s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "mage", Level: 3})
				config := slot.config
				config.RequiredLevel = req.requiredLevel
				itemID := carried(t, s, playerEntityID, config)

				err := s.handleEquip(constants.ActionEquip, playerEntityID, itemID)

				worn := slot.slot(equipmentOf(t, s, playerEntityID))
				if req.wantWorn {
					require.NoError(t, err)
					require.NotNil(t, worn)
					assert.Equal(t, itemID, *worn)
					assert.NotContains(t, inventory(t, s, playerEntityID).ItemIDs, itemID)
					assert.Empty(t, dispatcher.framesTo(playerID))
					return
				}
				assert.ErrorIs(t, err, ErrBelowRequiredLevel)
				assert.Nil(t, worn)
				assert.Contains(t, inventory(t, s, playerEntityID).ItemIDs, itemID)
				assert.Len(t, dispatcher.framesTo(playerID), 1)
			})
		}
	}
}

// A level-up mid-run makes a refused item equippable at once, and nothing is
// auto-equipped by the level-up itself. FS-BDA7X §Requirements 33.
func TestHandleEquip_AfterReachingTheLevel_TheSameEquipSucceeds(t *testing.T) {
	s, _ := equipRun(t, nil)
	playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
	helmID := carried(t, s, playerEntityID, level5Helm)
	require.ErrorIs(t, s.handleEquip(constants.ActionEquip, playerEntityID, helmID), ErrBelowRequiredLevel)

	entity, _ := s.EntityManager.GetEntity(playerEntityID)
	sc, _ := entity.GetComponent(ecs.ComponentTypeStats)
	stats := sc.(*components.StatsComponent)
	gainExperience(entity, Classes["warrior"].Growth, int(progression.LevelFloor(5))-stats.Experience)
	require.Equal(t, 5, stats.Level)
	assert.Nil(t, equipmentOf(t, s, playerEntityID).HeadSlot, "a level-up equips nothing by itself")

	require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, helmID))
	require.NotNil(t, equipmentOf(t, s, playerEntityID).HeadSlot)
	assert.Equal(t, helmID, *equipmentOf(t, s, playerEntityID).HeadSlot)
	assert.NotContains(t, inventory(t, s, playerEntityID).ItemIDs, helmID)
}

// A loadout above the character's level is brought in, not worn: the over-level
// item is seated in the inventory, its slot left empty, and it is still
// reported at extraction. FS-BDA7X §Requirements 30–31.
func TestAddPlayer_OverLevelLoadoutItem_IsSeatedInTheInventory(t *testing.T) {
	helmInstance := uuid.New()
	swordInstance := uuid.New()
	client := &mockItemsClient{loadout: &pb.GetLoadoutWithItemsResponse{
		Head: &pb.ItemInstance{
			Id: helmInstance.String(), TemplateId: uuid.NewString(), ItemType: "armor",
			ArmorSlot: "head", Name: "Barrow Helm", RequiredLevel: 5,
		},
		Weapon: &pb.ItemInstance{
			Id: swordInstance.String(), TemplateId: uuid.NewString(), ItemType: "weapon",
			Name: "Seax", RequiredLevel: 3,
		},
	}}
	s, _ := equipRun(t, client)
	playerID := uuid.New()

	playerEntityID := s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})

	equipment := equipmentOf(t, s, playerEntityID)
	assert.Nil(t, equipment.HeadSlot, "the level-5 helm is not worn")
	require.NotNil(t, equipment.WeaponSlot, "the level-3 sword is worn")
	carriedIDs := inventory(t, s, playerEntityID).ItemIDs
	require.Len(t, carriedIDs, 1, "the helm is carried")
	helm := itemsByID(s, carriedIDs)[0]
	assert.Equal(t, "Barrow Helm", helm.Name)
	assert.Equal(t, 5, helm.RequiredLevel)
	require.NotNil(t, helm.InstanceID)
	assert.Equal(t, helmInstance, *helm.InstanceID)

	// extraction still reports the carried helm, so it is not lost
	raw := s.getRawMatchState()
	require.Len(t, raw.Players, 1)
	require.Len(t, raw.Players[0].Inventory, 1)
	require.NotNil(t, raw.Players[0].Inventory[0].InstanceID)
	assert.Equal(t, helmInstance, *raw.Players[0].Inventory[0].InstanceID)
	require.NotNil(t, raw.Players[0].Equipment.WeaponSlot)
	assert.Equal(t, swordInstance, *raw.Players[0].Equipment.WeaponSlot.InstanceID)
}
