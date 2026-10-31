package game

import (
	"context"
	"slices"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

/**
* testing all session related business logic like creation and
* session manipulation.
**/

type mockMessageSender struct{}

func (m *mockMessageSender) PushMessageToChannelQueue(
	playerID uuid.UUID,
	msg interface{},
) error {
	return nil
}

func (m *mockMessageSender) PushMessageToConn(
	conn *websocket.Conn,
	msg interface{},
) error {
	return nil
}

// mock sender for testing
func createMockSender() *messaging.MessageSender {
	mockMessageSender := &mockMessageSender{}
	return messaging.NewMessageSender(mockMessageSender)
}

// mock session closer for testing
type mockSessionCloser struct {
	returnedToHub []uuid.UUID
}

func (m *mockSessionCloser) CloseSession(_ uuid.UUID) error {
	return nil
}

func (m *mockSessionCloser) ApplyRunProgress(_ []types.RunProgress) {}

func (m *mockSessionCloser) ReturnPlayersToHub(sessionID uuid.UUID) {
	m.returnedToHub = append(m.returnedToHub, sessionID)
}

// TestSessionCreation tests that a session initializes correctly with players
// white box test, we need to verify internal state like playerEntities
func TestSessionCreation(t *testing.T) {
	sender := createMockSender()
	em := ecs.NewEntityManager()
	stateSerializer := serializer.NewStateSerializer(em)
	mockEmitter := &mockEventEmitter{}
	session := NewSession(&mockSessionCloser{}, sender, stateSerializer, em, mockEmitter, nil, RunBounds())

	// verify session initialized
	require.NotNil(t, session, "Session should not be nil")
	require.NotEqual(t, uuid.Nil, session.ID, "Session should have valid ID")
	require.NotNil(t, session.EntityManager, "EntityManager should be initialized")
	require.NotNil(t, session.MessageCh, "MessageCh should be initialized")
	require.NotNil(t, session.sender, "Sender should be initialized")

	// initial state checks
	assert.Equal(t, 0, len(session.playerIDToEntitiesID), "Should have no players initially")

	// clean up goroutines
	defer session.Shutdown()
}

// test adding a single player to an existing session
func TestSessionAddPlayer(t *testing.T) {
	sender := createMockSender()
	em := ecs.NewEntityManager()
	stateSerializer := serializer.NewStateSerializer(em)
	mockEmitter := &mockEventEmitter{}
	session := NewSession(&mockSessionCloser{}, sender, stateSerializer, em, mockEmitter, nil, RunBounds())
	defer session.Shutdown()

	playerID := uuid.New()
	username := "TestPlayer"

	entityID := session.AddPlayer(playerID, types.CharacterInPlay{Name: username, Class: "warrior"}, "")

	assert.NotEqual(t, uuid.Nil, entityID, "Should return valid entity ID")

	assert.Equal(t, 1, len(session.playerIDToEntitiesID), "Should have 1 player")
	storedEntityID, exists := session.playerIDToEntitiesID[playerID]
	assert.True(t, exists, "Player should be in playerEntities map")
	assert.Equal(t, entityID, storedEntityID, "Entity IDs should match")

	entity, exists := session.EntityManager.GetEntity(entityID)
	require.True(t, exists, "Entity should exist in EntityManager")

	assert.True(t, entity.HasComponent(ecs.ComponentTypePlayer), "Should have Player component")
	assert.True(t, entity.HasComponent(ecs.ComponentTypeTransform), "Should have Transform component")
	assert.True(t, entity.HasComponent(ecs.ComponentTypeVelocity), "Should have Velocity component")

	// TODO: temporarily removed for simpler version of the game
	// assert.True(t, entity.HasComponent(ecs.ComponentTypeHealth), "Should have Health component")
	// assert.True(t, entity.HasComponent(ecs.ComponentTypeInventory), "Should have Inventory component")
}

// test focused on validating multiplayer players can be added to an
// existing session
func TestSessionAddMultiplePlayers(t *testing.T) {
	sender := createMockSender()
	em := ecs.NewEntityManager()
	stateSerializer := serializer.NewStateSerializer(em)
	mockEmitter := &mockEventEmitter{}
	session := NewSession(&mockSessionCloser{}, sender, stateSerializer, em, mockEmitter, nil, RunBounds())
	defer session.Shutdown()

	player1ID := uuid.New()
	player2ID := uuid.New()

	entity1ID := session.AddPlayer(player1ID, types.CharacterInPlay{Name: "Player1", Class: "warrior"}, "")
	entity2ID := session.AddPlayer(player2ID, types.CharacterInPlay{Name: "Player2", Class: "mage"}, "")

	assert.NotEqual(t, entity1ID, entity2ID, "Entity IDs should be unique")
	assert.Equal(t, 2, len(session.playerIDToEntitiesID), "Should have 2 players")

	_, exists1 := session.EntityManager.GetEntity(entity1ID)
	_, exists2 := session.EntityManager.GetEntity(entity2ID)
	assert.True(t, exists1, "Player 1 entity should exist")
	assert.True(t, exists2, "Player 2 entity should exist")
}

// A delver arriving in a run is placed at a random point inside the run's map,
// a full body's width clear of every edge. The hub has a front door instead:
// everyone arrives at the same spawn point.
func TestAddPlayerSetsInitialPosition(t *testing.T) {
	spawnOf := func(t *testing.T, s *Session) (float64, float64) {
		t.Helper()
		playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
		playerEntity, ok := s.EntityManager.GetEntity(playerEntityID)
		require.True(t, ok)
		transformComp, ok := playerEntity.GetComponent(ecs.ComponentTypeTransform)
		require.True(t, ok)
		transform := transformComp.(*components.TransformComponent)
		return transform.X, transform.Y
	}

	t.Run("a run places each delver inside its map", func(t *testing.T) {
		em := ecs.NewEntityManager()
		s := newSession(&mockSessionCloser{}, createMockSender(), serializer.NewStateSerializer(em), em, &mockEventEmitter{}, nil, RunBounds())

		for range 50 {
			x, y := spawnOf(t, s)
			assert.GreaterOrEqual(t, x, constants.PlayerRadius)
			assert.LessOrEqual(t, x, constants.MapWidth-constants.PlayerRadius)
			assert.GreaterOrEqual(t, y, constants.PlayerRadius)
			assert.LessOrEqual(t, y, constants.MapHeight-constants.PlayerRadius)
		}
	})

	t.Run("the hub places everyone at its front door", func(t *testing.T) {
		em := ecs.NewEntityManager()
		s := newSession(&mockSessionCloser{}, createMockSender(), serializer.NewStateSerializer(em), em, &mockEventEmitter{}, nil, HubBounds())

		for range 3 {
			x, y := spawnOf(t, s)
			assert.Equal(t, constants.HubSpawnX, x)
			assert.Equal(t, constants.HubSpawnY, y)
		}
	})
}

// ----- Testing Session Handles -----

// interactAt is a run nobody ticks, with one delver standing at (x, y). Spawn is
// random, so the delver is moved to a known point before any range is measured.
func interactAt(t *testing.T, x, y float64) (*Session, uuid.UUID) {
	t.Helper()
	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, createMockSender(), serializer.NewStateSerializer(em), em, &mockEventEmitter{}, nil, RunBounds())
	playerID, _ := placeDelver(t, s, "warrior", x, y)
	return s, playerID
}

// waitForInteractCooldown waits until both the delver and the target are off
// their interact cooldown. Retrying the interaction itself while waiting is not
// safe: a refusal for the delver's cooldown leaves the target on its cooldown
// for good.
func waitForInteractCooldown(t *testing.T, s *Session, playerID, targetID uuid.UUID) {
	t.Helper()
	s.mu.RLock()
	playerEntityID := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()

	require.Eventually(t, func() bool {
		s.mu.RLock()
		defer s.mu.RUnlock()
		_, targetCooling := s.containerInteractedCache[targetID]
		_, playerCooling := s.playerInteractedCache[playerEntityID]
		return !targetCooling && !playerCooling
	}, time.Second, 10*time.Millisecond)
}

// A door within interact range of its doorway centre toggles open, and a second
// interaction once the cooldown has passed closes it again. Out of range, it is
// refused and stays shut.
func TestHandleInteract(t *testing.T) {
	const playerX, playerY = 500.0, 500.0
	const doorW, doorH = 50.0, 10.0
	reach := constants.DefaultInteractableRange

	tests := []struct {
		name               string
		centreDX, centreDY float64 // doorway centre, relative to the delver
		expectedOutOfRange bool
	}{
		{name: "doorway centre right beside the delver", centreDX: 5, centreDY: 0, expectedOutOfRange: false},
		{name: "doorway centre just inside reach", centreDX: 0, centreDY: reach - 1, expectedOutOfRange: false},
		{name: "doorway centre just past reach", centreDX: 0, centreDY: reach + 1, expectedOutOfRange: true},
		{name: "doorway centre far away", centreDX: 300, centreDY: 300, expectedOutOfRange: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, playerID := interactAt(t, playerX, playerY)

			// a door is stored by its top-left corner
			doorX := playerX + tt.centreDX - doorW/2
			doorY := playerY + tt.centreDY - doorH/2
			doorID := s.AddDoor(doorX, doorY, doorW, doorH)
			door, ok := s.EntityManager.GetEntity(doorID)
			require.True(t, ok)
			openableComp, ok := door.GetComponent(ecs.ComponentTypeOpenable)
			require.True(t, ok)
			openable := openableComp.(*components.OpenableComponent)
			require.False(t, openable.IsOpen)

			err := s.handleInteract(playerID, doorID)

			if tt.expectedOutOfRange {
				assert.ErrorIs(t, err, ErrOutOfRange)
				assert.False(t, openable.IsOpen, "a door out of reach must stay shut")
				return
			}

			require.NoError(t, err)
			assert.True(t, openable.IsOpen, "the door should open")

			// the door and the delver are on a short cooldown; once it passes the
			// same interaction closes the door
			waitForInteractCooldown(t, s, playerID, doorID)
			require.NoError(t, s.handleInteract(playerID, doorID))
			assert.False(t, openable.IsOpen, "the door should close again")
		})
	}
}

// containerSession is interactAt with the item pool loaded, so an opened chest
// has something to roll.
func containerSession(t *testing.T, x, y float64) (*Session, uuid.UUID) {
	t.Helper()
	client := &mockItemsClient{rarities: pbRarities()}
	client.On("ListItemTemplates", mock.Anything).Return(lootTemplates(true), nil)

	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, createMockSender(), serializer.NewStateSerializer(em), em, &mockEventEmitter{}, client, RunBounds())
	require.NoError(t, s.InitializeItems(context.Background()))

	playerID, _ := placeDelver(t, s, "warrior", x, y)
	return s, playerID
}

// A chest within reach opens on the first interaction and rolls 2 to 4 items
// into itself. Opening it again keeps the same items: they are rolled once.
// Out of reach, it is refused and stays closed and empty.
func TestHandleInteractContainer(t *testing.T) {
	const playerX, playerY = 500.0, 500.0
	reach := constants.DefaultInteractableRange

	tests := []struct {
		name               string
		dx, dy             float64 // chest, relative to the delver
		expectedOutOfRange bool
	}{
		{name: "chest right beside the delver", dx: 5, dy: 0, expectedOutOfRange: false},
		{name: "chest just inside reach", dx: reach - 1, dy: 0, expectedOutOfRange: false},
		{name: "chest just past reach", dx: reach + 1, dy: 0, expectedOutOfRange: true},
		{name: "chest far away", dx: 300, dy: 300, expectedOutOfRange: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, playerID := containerSession(t, playerX, playerY)

			chestID := s.AddContainer(playerX+tt.dx, playerY+tt.dy, components.ContainerKindChest)
			chest, ok := s.EntityManager.GetEntity(chestID)
			require.True(t, ok)
			openableComp, ok := chest.GetComponent(ecs.ComponentTypeOpenable)
			require.True(t, ok)
			openable := openableComp.(*components.OpenableComponent)
			contents := itemList(t, s, chestID)

			require.False(t, openable.HasBeenOpened)
			require.Empty(t, contents.ItemIDs)

			err := s.handleInteract(playerID, chestID)

			if tt.expectedOutOfRange {
				assert.ErrorIs(t, err, ErrOutOfRange)
				assert.False(t, openable.HasBeenOpened, "a chest out of reach must stay closed")
				assert.Empty(t, contents.ItemIDs, "a chest out of reach must roll nothing")
				return
			}

			require.NoError(t, err)
			assert.True(t, openable.IsOpen)
			assert.True(t, openable.HasBeenOpened)
			assert.GreaterOrEqual(t, len(contents.ItemIDs), 2, "at least 2 items")
			assert.LessOrEqual(t, len(contents.ItemIDs), 4, "at most 4 items")

			firstOpen := slices.Clone(contents.ItemIDs)

			// once the cooldown passes, opening it again rolls nothing new
			waitForInteractCooldown(t, s, playerID, chestID)
			require.NoError(t, s.handleInteract(playerID, chestID))
			assert.True(t, openable.IsOpen, "a chest never closes")
			assert.Equal(t, firstOpen, itemList(t, s, chestID).ItemIDs)
		})
	}
}

func TestSession_InitializeItems_CreateItemEntities(t *testing.T) {
	expectedWeaponCount := 2

	// table tests
	tests := []struct {
		name            string
		mockReturn      *pb.ListItemTemplatesResponse
		mockErr         error
		wantErr         bool
		wantItemCount   int
		wantWeaponCount *int
	}{
		{
			name: "creates item entities properly",
			mockReturn: &pb.ListItemTemplatesResponse{
				Items: []*pb.ItemTemplate{
					// Weapons
					{
						Id:            "aa000000-0000-0000-0000-000000000001",
						ItemName:      "Vibro-blade",
						Rarity:        "Common",
						ItemType:      "weapon",
						IconUrl:       "/icons/weapon/vibro_blade.png",
						RequiredLevel: 1,
						BaseSellPrice: 2,
						BaseBuyPrice:  5,
						AttackPower:   6,
						CriticalRate:  0.08,
						WeaponType:    "sword",
						Description:   "Mono-molecular vibrating combat blade",
					},
					{
						Id:            "aa000000-0000-0000-0000-000000000002",
						ItemName:      "Pulse Dagger",
						Rarity:        "Common",
						ItemType:      "weapon",
						IconUrl:       "/icons/weapon/pulse_dagger.png",
						RequiredLevel: 1,
						BaseSellPrice: 1,
						BaseBuyPrice:  3,
						AttackPower:   3,
						CriticalRate:  0.12,
						WeaponType:    "knife",
						Description:   "Compact energy-pulse combat knife",
					},
					// Armors
					{
						Id:              "aa000000-0000-0000-0000-000000000007",
						ItemName:        "Titanium Helmet",
						Rarity:          "Common",
						ItemType:        "armor",
						IconUrl:         "/icons/armor/titanium_helmet.png",
						RequiredLevel:   1,
						BaseSellPrice:   1,
						BaseBuyPrice:    4,
						DefenseRating:   3,
						MagicResistance: 1,
						ArmorSlot:       "head",
						Description:     "Standard-issue titanium alloy combat helmet",
					},
					{
						Id:              "aa000000-0000-0000-0000-000000000008",
						ItemName:        "Titanium Chest Plate",
						Rarity:          "Common",
						ItemType:        "armor",
						IconUrl:         "/icons/armor/titanium_chest_plate.png",
						RequiredLevel:   1,
						BaseSellPrice:   3,
						BaseBuyPrice:    6,
						DefenseRating:   6,
						MagicResistance: 2,
						ArmorSlot:       "chest",
						Description:     "Titanium alloy chest plate with ballistic lining",
					},
					// Consumables
					{
						Id:            "aa000000-0000-0000-0000-000000000023",
						ItemName:      "Minor Stim Pack",
						Rarity:        "Common",
						ItemType:      "consumable",
						IconUrl:       "/icons/consumable/minor_stim_pack.png",
						RequiredLevel: 1,
						BaseSellPrice: 1,
						BaseBuyPrice:  2,
						HealingAmount: 10,
						ManaAmount:    0,
						BuffDuration:  0,
						MaxStackSize:  20,
						Description:   "Basic nano-med stim injection",
					},
					{
						Id:            "aa000000-0000-0000-0000-000000000024",
						ItemName:      "Greater Stim Pack",
						Rarity:        "Common",
						ItemType:      "consumable",
						IconUrl:       "/icons/consumable/greater_stim_pack.png",
						RequiredLevel: 1,
						BaseSellPrice: 2,
						BaseBuyPrice:  5,
						HealingAmount: 25,
						ManaAmount:    0,
						BuffDuration:  0,
						MaxStackSize:  10,
						Description:   "Advanced regenerative stim pack",
					},
				},
			},
			wantErr:       false,
			wantItemCount: 6,
		},
		{
			name: "weapon counts match not affect by consumables and armor",
			mockReturn: &pb.ListItemTemplatesResponse{
				Items: []*pb.ItemTemplate{
					// Weapons
					{
						Id:            "aa000000-0000-0000-0000-000000000001",
						ItemName:      "Vibro-blade",
						Rarity:        "Common",
						ItemType:      "weapon",
						IconUrl:       "/icons/weapon/vibro_blade.png",
						RequiredLevel: 1,
						BaseSellPrice: 2,
						BaseBuyPrice:  5,
						AttackPower:   6,
						CriticalRate:  0.08,
						WeaponType:    "sword",
						Description:   "Mono-molecular vibrating combat blade",
					},
					{
						Id:            "aa000000-0000-0000-0000-000000000002",
						ItemName:      "Pulse Dagger",
						Rarity:        "Common",
						ItemType:      "weapon",
						IconUrl:       "/icons/weapon/pulse_dagger.png",
						RequiredLevel: 1,
						BaseSellPrice: 1,
						BaseBuyPrice:  3,
						AttackPower:   3,
						CriticalRate:  0.12,
						WeaponType:    "knife",
						Description:   "Compact energy-pulse combat knife",
					},
					// armor
					{
						Id:              "aa000000-0000-0000-0000-000000000008",
						ItemName:        "Titanium Chest Plate",
						Rarity:          "Common",
						ItemType:        "armor",
						IconUrl:         "/icons/armor/titanium_chest_plate.png",
						RequiredLevel:   1,
						BaseSellPrice:   3,
						BaseBuyPrice:    6,
						DefenseRating:   6,
						MagicResistance: 2,
						ArmorSlot:       "chest",
						Description:     "Titanium alloy chest plate with ballistic lining",
					},
					// consumables
					{
						Id:            "aa000000-0000-0000-0000-000000000023",
						ItemName:      "Minor Stim Pack",
						Rarity:        "Common",
						ItemType:      "consumable",
						IconUrl:       "/icons/consumable/minor_stim_pack.png",
						RequiredLevel: 1,
						BaseSellPrice: 1,
						BaseBuyPrice:  2,
						HealingAmount: 10,
						ManaAmount:    0,
						BuffDuration:  0,
						MaxStackSize:  20,
						Description:   "Basic nano-med stim injection",
					},
				},
			},
			mockErr:         nil,
			wantErr:         false,
			wantItemCount:   4,
			wantWeaponCount: &expectedWeaponCount,
		},
		{
			name: "handles empty template list",
			mockReturn: &pb.ListItemTemplatesResponse{
				Items: []*pb.ItemTemplate{},
			},
			mockErr:       nil,
			wantErr:       false,
			wantItemCount: 0,
		},
	}

	// --- testing ---
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// -- setup --
			sender := createMockSender()
			em := ecs.NewEntityManager()
			mockEmitter := &mockEventEmitter{}
			mockClient := mockItemsClient{}

			session := NewSession(&mockSessionCloser{}, sender, &mockStateSerializer{}, em, mockEmitter, &mockClient, RunBounds())

			defer session.Shutdown()

			mockClient.On("ListItemTemplates", mock.Anything).Return(
				tt.mockReturn,
				tt.mockErr,
			)

			// -- test --

			err := session.InitializeItems(context.Background())

			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}

			// get all entites and check creations
			allWeaponCounts := 0

			// slog.Info("session.itemPool during test",
			// 	"test name", tt.name,
			// 	"session.itemPool", session.itemPool,
			// )

			assert.Equal(t, tt.wantItemCount, session.itemPool.count())

			// testing weapon item type specific counts check out
			if tt.wantWeaponCount != nil {

				for _, item := range session.itemPool.Weapons {
					if item.Config.ItemType == types.ItemTypeWeapon {
						allWeaponCounts++
					}
				}

				assert.Equal(t, *tt.wantWeaponCount, allWeaponCounts)
			}

			mockClient.AssertExpectations(t)
		},
		)
	}
}

func TestSession_GenerateItems_CreateItemEntities(t *testing.T) {
	// table test data
	tests := []struct {
		name       string
		mockReturn *pb.ListItemTemplatesResponse
		mockErr    error
		wantErr    bool
	}{
		{
			name: "Creates correct number of item entities",
			mockReturn: &pb.ListItemTemplatesResponse{
				Items: []*pb.ItemTemplate{
					// Weapons
					{
						Id:            "aa000000-0000-0000-0000-000000000001",
						ItemName:      "Vibro-blade",
						Rarity:        "Common",
						ItemType:      "weapon",
						IconUrl:       "/icons/weapon/vibro_blade.png",
						RequiredLevel: 1,
						BaseSellPrice: 2,
						BaseBuyPrice:  5,
						AttackPower:   6,
						CriticalRate:  0.08,
						WeaponType:    "sword",
						Description:   "Mono-molecular vibrating combat blade",
					},
					{
						Id:            "aa000000-0000-0000-0000-000000000002",
						ItemName:      "Pulse Dagger",
						Rarity:        "Common",
						ItemType:      "weapon",
						IconUrl:       "/icons/weapon/pulse_dagger.png",
						RequiredLevel: 1,
						BaseSellPrice: 1,
						BaseBuyPrice:  3,
						AttackPower:   3,
						CriticalRate:  0.12,
						WeaponType:    "knife",
						Description:   "Compact energy-pulse combat knife",
					},
					// Armors
					{
						Id:              "aa000000-0000-0000-0000-000000000007",
						ItemName:        "Titanium Helmet",
						Rarity:          "Common",
						ItemType:        "armor",
						IconUrl:         "/icons/armor/titanium_helmet.png",
						RequiredLevel:   1,
						BaseSellPrice:   1,
						BaseBuyPrice:    4,
						DefenseRating:   3,
						MagicResistance: 1,
						ArmorSlot:       "head",
						Description:     "Standard-issue titanium alloy combat helmet",
					},
					{
						Id:              "aa000000-0000-0000-0000-000000000008",
						ItemName:        "Titanium Chest Plate",
						Rarity:          "Common",
						ItemType:        "armor",
						IconUrl:         "/icons/armor/titanium_chest_plate.png",
						RequiredLevel:   1,
						BaseSellPrice:   3,
						BaseBuyPrice:    6,
						DefenseRating:   6,
						MagicResistance: 2,
						ArmorSlot:       "chest",
						Description:     "Titanium alloy chest plate with ballistic lining",
					},
					// Consumables
					{
						Id:            "aa000000-0000-0000-0000-000000000023",
						ItemName:      "Minor Stim Pack",
						Rarity:        "Common",
						ItemType:      "consumable",
						IconUrl:       "/icons/consumable/minor_stim_pack.png",
						RequiredLevel: 1,
						BaseSellPrice: 1,
						BaseBuyPrice:  2,
						HealingAmount: 10,
						ManaAmount:    0,
						BuffDuration:  0,
						MaxStackSize:  20,
						Description:   "Basic nano-med stim injection",
					},
					{
						Id:            "aa000000-0000-0000-0000-000000000024",
						ItemName:      "Greater Stim Pack",
						Rarity:        "Common",
						ItemType:      "consumable",
						IconUrl:       "/icons/consumable/greater_stim_pack.png",
						RequiredLevel: 1,
						BaseSellPrice: 2,
						BaseBuyPrice:  5,
						HealingAmount: 25,
						ManaAmount:    0,
						BuffDuration:  0,
						MaxStackSize:  10,
						Description:   "Advanced regenerative stim pack",
					},
				},
			},
			wantErr: false,
		},
		{
			name: "returns error when itemPool empty",
			mockReturn: &pb.ListItemTemplatesResponse{
				Items: []*pb.ItemTemplate{},
			},
			mockErr: nil,
			wantErr: true,
		},
		{
			name: "handles mixed rarity consumable-heavy loadout",
			mockReturn: &pb.ListItemTemplatesResponse{
				Items: []*pb.ItemTemplate{
					// Weapon
					{
						Id:            "bb000000-0000-0000-0000-000000000001",
						ItemName:      "Plasma Rifle",
						Rarity:        "Rare",
						ItemType:      "weapon",
						IconUrl:       "/icons/weapon/plasma_rifle.png",
						RequiredLevel: 5,
						BaseSellPrice: 15,
						BaseBuyPrice:  30,
						AttackPower:   18,
						CriticalRate:  0.05,
						WeaponType:    "rifle",
						Description:   "High-energy plasma discharge rifle",
					},
					// Armor
					{
						Id:              "bb000000-0000-0000-0000-000000000002",
						ItemName:        "Nano-Weave Boots",
						Rarity:          "Uncommon",
						ItemType:        "armor",
						IconUrl:         "/icons/armor/nano_weave_boots.png",
						RequiredLevel:   3,
						BaseSellPrice:   4,
						BaseBuyPrice:    10,
						DefenseRating:   4,
						MagicResistance: 3,
						ArmorSlot:       "feet",
						Description:     "Lightweight boots with nano-fiber reinforcement",
					},
					// Consumables
					{
						Id:            "bb000000-0000-0000-0000-000000000003",
						ItemName:      "Mana Siphon",
						Rarity:        "Uncommon",
						ItemType:      "consumable",
						IconUrl:       "/icons/consumable/mana_siphon.png",
						RequiredLevel: 2,
						BaseSellPrice: 3,
						BaseBuyPrice:  7,
						HealingAmount: 0,
						ManaAmount:    20,
						BuffDuration:  0,
						MaxStackSize:  15,
						Description:   "Extracts ambient energy to restore mana",
					},
					{
						Id:            "bb000000-0000-0000-0000-000000000004",
						ItemName:      "Shield Booster",
						Rarity:        "Rare",
						ItemType:      "consumable",
						IconUrl:       "/icons/consumable/shield_booster.png",
						RequiredLevel: 4,
						BaseSellPrice: 5,
						BaseBuyPrice:  12,
						HealingAmount: 0,
						ManaAmount:    0,
						BuffDuration:  30,
						MaxStackSize:  5,
						Description:   "Temporarily reinforces personal energy shield",
					},
					{
						Id:            "bb000000-0000-0000-0000-000000000005",
						ItemName:      "Adrenaline Shot",
						Rarity:        "Common",
						ItemType:      "consumable",
						IconUrl:       "/icons/consumable/adrenaline_shot.png",
						RequiredLevel: 1,
						BaseSellPrice: 1,
						BaseBuyPrice:  3,
						HealingAmount: 5,
						ManaAmount:    5,
						BuffDuration:  10,
						MaxStackSize:  20,
						Description:   "Quick-inject combat stimulant",
					},
				},
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		// setup
		t.Run(tt.name, func(t *testing.T) {
			// -- setup --
			sender := createMockSender()
			em := ecs.NewEntityManager()
			mockEmitter := &mockEventEmitter{}
			mockClient := mockItemsClient{}

			session := NewSession(&mockSessionCloser{}, sender, &mockStateSerializer{}, em, mockEmitter, &mockClient, RunBounds())

			defer session.Shutdown()

			mockClient.On("ListItemTemplates", mock.Anything).Return(
				tt.mockReturn,
				tt.mockErr,
			)

			// initialize seed items
			err := session.InitializeItems(context.Background())

			if err != nil {
				t.Fatal("Unexpected error when testing.")
			}

			// -- test --
			ids, err := session.generateItems(components.ContainerKindChest)

			if tt.wantErr {
				assert.Error(t, err)
				return
			}

			assert.NoError(t, err)

			// check ids exist in entity pool
			itemsHashMap := make(map[uuid.UUID]*components.ItemComponent)
			entities := session.EntityManager.GetAllEntities()

			for _, entity := range entities {
				itemComp, isItem := entity.GetComponent(ecs.ComponentTypeItem)
				if !isItem {
					continue
				}
				item, ok := itemComp.(*components.ItemComponent)

				if !ok {
					t.Fatal("unexpected error when asserting for item component")
				}

				itemsHashMap[entity.ID] = item
			}

			// loop through generated items
			generatedItems := 0
			for _, id := range ids {
				_, exists := itemsHashMap[id]
				assert.True(t, exists)
				if exists {
					generatedItems++
				}
			}

			t.Log("itemHashMap", itemsHashMap, "generatedItems", generatedItems, "ids", ids)

			assert.Equal(t, len(ids), generatedItems)
		})
	}
}

type mockItemsClient struct {
	mock.Mock
	rarities    *pb.ListItemRaritiesResponse
	raritiesErr error
	loadout     *pb.GetLoadoutWithItemsResponse
}

func (c *mockItemsClient) ListItemRarities(ctx context.Context) (*pb.ListItemRaritiesResponse, error) {
	return c.rarities, c.raritiesErr
}

func (c *mockItemsClient) CreateWeapon(ctx context.Context, req *pb.CreateWeaponRequest) (*pb.Weapon, error) {
	return nil, nil
}

func (c *mockItemsClient) GetWeaponWithTemplateByID(ctx context.Context, req *pb.GetWeaponRequest) (*pb.WeaponDetail, error) {
	return nil, nil
}

func (c *mockItemsClient) ListWeaponsWithTemplate(ctx context.Context) (*pb.ListWeaponsResponse, error) {

	return nil, nil
}

func (c *mockItemsClient) ListItemTemplates(ctx context.Context) (*pb.ListItemTemplatesResponse, error) {
	args := c.Called(ctx)

	return args.Get(0).(*pb.ListItemTemplatesResponse), args.Error(1)
}

func (c *mockItemsClient) ListArmorsWithTemplate(ctx context.Context) (*pb.ListArmorsResponse, error) {
	return nil, nil
}

func (c *mockItemsClient) ListConsumablesWithTemplate(ctx context.Context) (*pb.ListConsumablesResponse, error) {
	return nil, nil
}

func (c *mockItemsClient) GetLoadout(ctx context.Context, req *pb.GetLoadoutRequest) (*pb.GetLoadoutResponse, error) {
	return nil, nil
}

func (c *mockItemsClient) GetLoadoutWithItems(ctx context.Context, req *pb.GetLoadoutWithItemsRequest) (*pb.GetLoadoutWithItemsResponse, error) {
	return c.loadout, nil
}

func (c *mockItemsClient) ListItemInstances(ctx context.Context, req *pb.ListItemInstancesRequest) (*pb.ListItemInstancesResponse, error) {
	return nil, nil
}

type mockStateSerializer struct {
}

func (s *mockStateSerializer) PutBackendState(state *types.BackendGameState) {
}

func (s *mockStateSerializer) SerializeBackendState(ctx context.Context, sessionID uuid.UUID, worldType types.WorldType, entities []*ecs.Entity) (*types.BackendGameState, error) {
	return nil, nil
}

func (s *mockStateSerializer) FormatStateToClientState(backendState *types.BackendGameState, playerID uuid.UUID) *types.ClientGameState {
	return nil
}

func TestSession_GenerateItems_CreateAndSerialize(t *testing.T) {
	mockReturn := &pb.ListItemTemplatesResponse{
		Items: []*pb.ItemTemplate{
			{
				Id:            "aa000000-0000-0000-0000-000000000001",
				ItemName:      "Vibro-blade",
				ItemType:      "weapon",
				AttackPower:   6,
				CriticalRate:  0.08,
				WeaponType:    "sword",
				Description:   "Mono-molecular vibrating combat blade",
				BaseSellPrice: 2,
				BaseBuyPrice:  5,
			},
			{
				Id:              "aa000000-0000-0000-0000-000000000007",
				ItemName:        "Titanium Helmet",
				ItemType:        "armor",
				DefenseRating:   3,
				MagicResistance: 1,
				ArmorSlot:       "head",
				Description:     "Standard-issue titanium alloy combat helmet",
				BaseSellPrice:   1,
				BaseBuyPrice:    4,
			},
			{
				Id:            "aa000000-0000-0000-0000-000000000023",
				ItemName:      "Minor Stim Pack",
				ItemType:      "consumable",
				HealingAmount: 10,
				Description:   "Basic nano-med stim injection",
				BaseSellPrice: 1,
				BaseBuyPrice:  2,
			},
		},
	}

	// -- setup: real serializer, mock everything else --
	sender := createMockSender()
	em := ecs.NewEntityManager()
	stateSerializer := serializer.NewStateSerializer(em) // real serializer to test serialization
	mockEmitter := &mockEventEmitter{}
	mockClient := mockItemsClient{}

	session := NewSession(&mockSessionCloser{}, sender, stateSerializer, em, mockEmitter, &mockClient, RunBounds())
	defer session.Shutdown()

	mockClient.On("ListItemTemplates", mock.Anything).Return(mockReturn, nil)

	err := session.InitializeItems(context.Background())
	require.NoError(t, err)

	ids, err := session.generateItems(components.ContainerKindChest)
	require.NoError(t, err)
	require.NotEmpty(t, ids)

	// -- grab generated entities and serialize each through getItemState --
	for _, id := range ids {
		entity, exists := em.GetEntity(id)
		require.True(t, exists, "generated entity should exist")

		itemComp, hasItem := entity.GetComponent(ecs.ComponentTypeItem)
		require.True(t, hasItem, "entity should have ItemComponent")

		item := itemComp.(*components.ItemComponent)

		// TODO: call the serializer to get the ItemState for this entity
		// hint: you'll need to expose or call getItemState, or use
		//       SerializeBackendState → FormatStateToClientState if you
		//       prefer testing the full pipeline.

		t.Logf("item pulled out in test after generation\nitem_id:%v\nitem_type:%s\nitem_attack_power:%d\nitem_defense_rating:%d\n", id, item.ItemType, item.AttackPower, item.DefenseRating)

		switch item.ItemType {

		case types.ItemTypeWeapon:
			// check weapon type item has weapon only stats
			assert.NotZero(t, item.AttackPower)
			assert.NotZero(t, item.CriticalRate)
			assert.NotEqual(t, "", item.WeaponType)

			// and no armor stats
			assert.Zero(t, item.DefenseRating)
			assert.Zero(t, item.MagicResistance)
			assert.Equal(t, types.ArmorSlot(""), item.ArmorSlot)

		case types.ItemTypeArmor:
			// check armor type item has armor only stats
			assert.NotZero(t, item.DefenseRating)
			assert.NotZero(t, item.MagicResistance)
			assert.NotEqual(t, types.ArmorSlot(""), item.ArmorSlot)

			// and no weapon stats
			assert.Zero(t, item.AttackPower)
			assert.Zero(t, item.CriticalRate)
			assert.Equal(t, "", item.WeaponType)

		case types.ItemTypeConsumable:
			// check for only consumable related stats
			assert.True(t, item.HealingAmount != 0 || item.ManaAmount != 0 || item.BuffDuration != 0)
		}
	}
}

// handleEquip moves an item between a delver's satchel and the slot it fits:
// equip takes it out of the satchel and wears it, unequip takes it off and puts
// it back. Asking for something that is not there is refused and changes nothing.
func TestSession_HandleEquip(t *testing.T) {
	sword := types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeWeapon, Name: "Sword"}
	helm := types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead, Name: "Helm"}

	weaponSlot := func(eq *components.EquipmentComponent) *uuid.UUID { return eq.WeaponSlot }
	headSlot := func(eq *components.EquipmentComponent) *uuid.UUID { return eq.HeadSlot }

	tests := []struct {
		name      string
		item      types.ItemConfig
		slot      func(*components.EquipmentComponent) *uuid.UUID
		wornFirst bool // equipped before the action under test
		action    constants.Action
		// what the action is aimed at: the item itself unless overridden
		unknownPlayer bool
		unknownItem   bool
		wantErr       error
		wantWorn      bool
		wantCarried   bool
	}{
		{name: "equip a carried weapon", item: sword, slot: weaponSlot, action: constants.ActionEquip, wantWorn: true},
		{name: "equip a carried helm", item: helm, slot: headSlot, action: constants.ActionEquip, wantWorn: true},
		{name: "unequip a worn weapon", item: sword, slot: weaponSlot, wornFirst: true, action: constants.ActionUnequip, wantCarried: true},
		{name: "equip an item already worn is a no-op", item: helm, slot: headSlot, wornFirst: true, action: constants.ActionEquip, wantWorn: true},
		{name: "unequip an item that is only carried", item: sword, slot: weaponSlot, action: constants.ActionUnequip, wantErr: ErrItemNotWorn, wantCarried: true},
		{name: "unknown player entity", item: sword, slot: weaponSlot, action: constants.ActionEquip, unknownPlayer: true, wantErr: ErrEntityNotFound, wantCarried: true},
		{name: "unknown item entity", item: sword, slot: weaponSlot, action: constants.ActionEquip, unknownItem: true, wantErr: ErrEntityNotFound, wantCarried: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := equipRun(t, nil)
			_, delver := placeDelver(t, s, "warrior", 500, 500)
			itemID := carried(t, s, delver.ID, tt.item)
			if tt.wornFirst {
				require.NoError(t, s.handleEquip(constants.ActionEquip, delver.ID, itemID))
			}

			playerTarget, itemTarget := delver.ID, itemID
			if tt.unknownPlayer {
				playerTarget = uuid.New()
			}
			if tt.unknownItem {
				itemTarget = uuid.New()
			}

			err := s.handleEquip(tt.action, playerTarget, itemTarget)

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
			} else {
				assert.NoError(t, err)
			}

			worn := tt.slot(equipmentOf(t, s, delver.ID))
			if tt.wantWorn {
				require.NotNil(t, worn, "the item should be worn")
				assert.Equal(t, itemID, *worn)
			} else {
				assert.Nil(t, worn, "the slot should be empty")
			}
			assert.Equal(t, tt.wantCarried, slices.Contains(inventory(t, s, delver.ID).ItemIDs, itemID),
				"whether the item is in the satchel")
		})
	}
}

// Door range is measured from the delver to the middle of the doorway. A door is
// stored by its top-left corner, and measuring to that corner made the far end of
// a doorway unreachable: a delver standing in front of it was refused as too far.
func TestHandleInteract_DoorRangeFromDoorwayCentre(t *testing.T) {
	// A 50-wide, 20-thick door in a house's bottom wall: corner (100, 200),
	// doorway centre (125, 210). The delver stands outside, below it.
	const doorX, doorY, doorW, doorH = 100.0, 200.0, 50.0, 20.0

	tests := []struct {
		name               string
		playerX, playerY   float64
		expectedOutOfRange bool
	}{
		{name: "in front of the middle of the doorway", playerX: 125, playerY: 250, expectedOutOfRange: false},
		{name: "in front of the near end of the doorway", playerX: 85, playerY: 250, expectedOutOfRange: false},
		{name: "in front of the far end of the doorway", playerX: 165, playerY: 250, expectedOutOfRange: false},
		{name: "well back from the doorway", playerX: 125, playerY: 300, expectedOutOfRange: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			session := NewSession(&mockSessionCloser{}, createMockSender(), serializer.NewStateSerializer(em), em, &mockEventEmitter{}, nil, RunBounds())
			defer session.Shutdown()

			playerID := uuid.New()
			playerEntityID := session.AddPlayer(playerID, types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
			playerEntity, ok := em.GetEntity(playerEntityID)
			require.True(t, ok)
			transformComp, ok := playerEntity.GetComponent(ecs.ComponentTypeTransform)
			require.True(t, ok)
			transform := transformComp.(*components.TransformComponent)
			transform.X, transform.Y = tt.playerX, tt.playerY

			doorID := session.AddDoor(doorX, doorY, doorW, doorH)

			err := session.handleInteract(playerID, doorID)

			if tt.expectedOutOfRange {
				assert.ErrorIs(t, err, ErrOutOfRange)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
