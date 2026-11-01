package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-P9G8R §A (Requirements 1–12); §Acceptance Criteria "Drinking
// (game-service)". I-P9G8R-1.

// healthPotion is a stored-loadout health potion: it has an item_instances row.
func healthPotion(heal int) types.ItemConfig {
	instanceID := uuid.New()
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: "Lesser Heal Potion",
		HealingAmount: heal, InstanceID: &instanceID,
	}
}

// lootedHealthPotion is a health potion found in this run: no row, no instance id.
func lootedHealthPotion(heal int) types.ItemConfig {
	return types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: "Lesser Heal Potion", HealingAmount: heal}
}

func manaPotion() types.ItemConfig {
	return types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: "Lesser Mana Potion", ManaAmount: 30}
}

// slotHolders are the three consumable slots, in the order a drink reads them.
var slotHolders = []func(*components.EquipmentComponent) **uuid.UUID{
	func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.Consumable1 },
	func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.Consumable2 },
	func(eq *components.EquipmentComponent) **uuid.UUID { return &eq.Consumable3 },
}

// inConsumableSlot puts a new item in the delver's consumable slot (1–3) and
// returns its entity id.
func inConsumableSlot(t *testing.T, s *Session, delver *ecs.Entity, slot int, config types.ItemConfig) uuid.UUID {
	t.Helper()
	itemID := s.AddItem(config)
	*slotHolders[slot-1](equipmentOf(t, s, delver.ID)) = &itemID
	return itemID
}

func consumableSlot(t *testing.T, s *Session, delver *ecs.Entity, slot int) *uuid.UUID {
	t.Helper()
	return *slotHolders[slot-1](equipmentOf(t, s, delver.ID))
}

// seatedDelver places a delver and ticks once, so their first gear pass (which
// raises current health with any gear maximum) is behind them.
func seatedDelver(t *testing.T, s *Session, class string, x, y float64) (uuid.UUID, *ecs.Entity) {
	t.Helper()
	playerID, delver := placeDelver(t, s, class, x, y)
	tick(s)
	return playerID, delver
}

// hurt sets the delver's health to current of max.
func hurt(t *testing.T, delver *ecs.Entity, current, max int) {
	t.Helper()
	hc, ok := delver.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	health := hc.(*components.HealthComponent)
	health.CurrentHealth, health.MaxHealth = current, max
}

func itemExists(s *Session, itemID uuid.UUID) bool {
	_, ok := s.EntityManager.GetEntity(itemID)
	return ok
}

// A delver in play, hurt, off cooldown, with a health potion in Consumable1
// drinks it on the next tick: healed by its amount, the item gone, the slot
// empty. FS-P9G8R §Requirements 4, 5, 7, 8.
func TestRun_Drink_HealsFromConsumable1AndUsesThePotionUp(t *testing.T) {
	s := coopRun(t)
	playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
	hurt(t, delver, 50, 100)
	potion := inConsumableSlot(t, s, delver, 1, healthPotion(25))

	s.Drink(playerID)
	assert.Equal(t, 50, currentHealth(delver), "queued, not applied beside the tick")
	tick(s)

	assert.Equal(t, 75, currentHealth(delver))
	assert.Nil(t, consumableSlot(t, s, delver, 1), "the slot is empty")
	assert.False(t, itemExists(s, potion), "the potion's entity is gone")
}

// A heal that would pass the maximum stops there; the rest is lost.
// FS-P9G8R §Requirements 7.
func TestRun_Drink_HealCapsAtMaxHealth(t *testing.T) {
	s := coopRun(t)
	playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
	hurt(t, delver, 90, 100)
	inConsumableSlot(t, s, delver, 1, healthPotion(25))

	s.Drink(playerID)
	tick(s)

	assert.Equal(t, 100, currentHealth(delver))
	assert.Nil(t, consumableSlot(t, s, delver, 1), "no partial potion is kept")
}

// The lowest slot holding a health potion is drunk: an empty slot and a mana
// potion are skipped. FS-P9G8R §Requirements 1, 5.
func TestRun_Drink_SkipsEmptyAndManaSlots(t *testing.T) {
	tests := []struct {
		name  string
		slot1 *types.ItemConfig
	}{
		{"consumable 1 empty", nil},
		{"consumable 1 a mana potion", ptr(manaPotion())},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := coopRun(t)
			playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
			hurt(t, delver, 50, 100)
			var mana uuid.UUID
			if tt.slot1 != nil {
				mana = inConsumableSlot(t, s, delver, 1, *tt.slot1)
			}
			second := inConsumableSlot(t, s, delver, 2, healthPotion(10))
			third := inConsumableSlot(t, s, delver, 3, healthPotion(30))

			s.Drink(playerID)
			tick(s)

			assert.Equal(t, 60, currentHealth(delver), "slot 2's potion healed")
			assert.Nil(t, consumableSlot(t, s, delver, 2))
			assert.False(t, itemExists(s, second))
			require.NotNil(t, consumableSlot(t, s, delver, 3))
			assert.Equal(t, third, *consumableSlot(t, s, delver, 3), "slot 3 is kept")
			if tt.slot1 != nil {
				require.NotNil(t, consumableSlot(t, s, delver, 1))
				assert.Equal(t, mana, *consumableSlot(t, s, delver, 1), "the mana potion is never drunk")
				assert.True(t, itemExists(s, mana))
			}
		})
	}
}

func ptr[T any](v T) *T { return &v }

// drinkSnapshot is everything a refused drink must leave as it was.
type drinkSnapshot struct {
	health    int
	slots     [3]*uuid.UUID
	potions   map[uuid.UUID]bool // item entity id → still in the world
	hasPotion bool               // the delver carries a cooldown / consumed record
	cooldown  float64
	consumed  []uuid.UUID
}

func snapshotDrink(t *testing.T, s *Session, delver *ecs.Entity, potions ...uuid.UUID) drinkSnapshot {
	t.Helper()
	snap := drinkSnapshot{health: currentHealth(delver), potions: map[uuid.UUID]bool{}}
	if pc, ok := delver.GetComponent(ecs.ComponentTypePotion); ok {
		potions := pc.(*components.PotionComponent)
		snap.hasPotion, snap.cooldown = true, potions.CooldownRemaining
		snap.consumed = append([]uuid.UUID(nil), potions.ConsumedItemIDs...)
	}
	for i := range 3 {
		if held := consumableSlot(t, s, delver, i+1); held != nil {
			id := *held
			snap.slots[i] = &id
		}
	}
	for _, id := range potions {
		snap.potions[id] = itemExists(s, id)
	}
	return snap
}

// Each refusal is a silent no-op: health, slots, item entities, cooldown and
// consumed record untouched, and nothing sent. FS-P9G8R §Requirements 3, 6.
func TestRun_Drink_RefusalsChangeNothingAndSendNothing(t *testing.T) {
	tests := []struct {
		name  string
		world func(t *testing.T) *Session
		setup func(t *testing.T, s *Session, delver *ecs.Entity)
	}{
		{"full health", func(t *testing.T) *Session { return coopRun(t) }, func(t *testing.T, s *Session, delver *ecs.Entity) {
			hurt(t, delver, 100, 100)
		}},
		{"dead", func(t *testing.T) *Session { return coopRun(t) }, func(t *testing.T, s *Session, delver *ecs.Entity) {
			kill(t, delver)
		}},
		{"escaped", func(t *testing.T) *Session { return coopRun(t) }, func(t *testing.T, s *Session, delver *ecs.Entity) {
			markEscaped(t, delver)
		}},
		{"left behind", func(t *testing.T) *Session { return coopRun(t) }, func(t *testing.T, s *Session, delver *ecs.Entity) {
			pc, _ := delver.GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).LeftBehind = true
		}},
		{"on cooldown", func(t *testing.T) *Session { return coopRun(t) }, func(t *testing.T, s *Session, delver *ecs.Entity) {
			delver.AddComponent(&components.PotionComponent{CooldownRemaining: 0.5, ConsumedItemIDs: []uuid.UUID{uuid.New()}})
		}},
		{"no health potion equipped", func(t *testing.T) *Session { return coopRun(t) }, func(t *testing.T, s *Session, delver *ecs.Entity) {
			*slotHolders[0](equipmentOf(t, s, delver.ID)) = nil
			inConsumableSlot(t, s, delver, 2, manaPotion())
		}},
		{"world is the hub", func(t *testing.T) *Session {
			return newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
		}, func(*testing.T, *Session, *ecs.Entity) {}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := tt.world(t)
			dispatcher := &recordingDispatcher{}
			s.sender = messaging.NewMessageSender(dispatcher)
			playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
			hurt(t, delver, 50, 100)
			potion := inConsumableSlot(t, s, delver, 1, healthPotion(25))
			tt.setup(t, s, delver)
			before := snapshotDrink(t, s, delver, potion)

			s.Drink(playerID)
			s.applyIntents() // the drink alone: the rest of the tick would move health on its own (a death, say)

			assert.Equal(t, before, snapshotDrink(t, s, delver, potion))
			assert.Empty(t, dispatcher.framesTo(playerID), "a refusal sends nothing")
		})
	}
}

func ticks(s *Session, n int) {
	for range n {
		tick(s)
	}
}

func potionOf(t *testing.T, delver *ecs.Entity) *components.PotionComponent {
	t.Helper()
	pc, ok := delver.GetComponent(ecs.ComponentTypePotion)
	require.True(t, ok, "the delver has drunk")
	return pc.(*components.PotionComponent)
}

// Two drinks applied on one tick drink one potion: the first is judged, the
// second meets the cooldown it started. FS-P9G8R §Requirements 9; §Edge States
// "Concurrent presses".
func TestRun_Drink_TwoInOneTickDrinkOnePotion(t *testing.T) {
	s := coopRun(t)
	playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
	hurt(t, delver, 20, 100)
	inConsumableSlot(t, s, delver, 1, healthPotion(25))
	second := inConsumableSlot(t, s, delver, 2, healthPotion(25))

	s.Drink(playerID)
	s.Drink(playerID)
	tick(s)

	assert.Equal(t, 45, currentHealth(delver), "one potion's worth")
	require.NotNil(t, consumableSlot(t, s, delver, 2), "the second potion is kept")
	assert.Equal(t, second, *consumableSlot(t, s, delver, 2))
	assert.True(t, itemExists(s, second))
}

// The cooldown is 1.0 s of simulation time from the drink, shared by the
// slots, and a refused drink does not restart it. FS-P9G8R §Requirements 9.
func TestRun_Drink_CooldownBoundary(t *testing.T) {
	tests := []struct {
		name    string
		elapsed func(s *Session) // simulation time between the two drinks' ticks
		allowed bool
	}{
		{"0.99 s", func(s *Session) { s.step(0.99, s.EntityManager.GetAllEntities()) }, false},
		{"1.0 s", func(s *Session) { s.step(1.0, s.EntityManager.GetAllEntities()) }, true},
		{"a tick short of a second", func(s *Session) { ticks(s, constants.GameFrameRate-1) }, false},
		{"a second of ticks", func(s *Session) { ticks(s, constants.GameFrameRate) }, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := coopRun(t)
			playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
			hurt(t, delver, 20, 100)
			inConsumableSlot(t, s, delver, 1, healthPotion(25))
			second := inConsumableSlot(t, s, delver, 2, healthPotion(25))

			// the drink lands at the start of a tick; all simulation time stepped
			// from there on counts toward the cooldown, that tick's included
			s.Drink(playerID)
			s.applyIntents()
			require.Equal(t, 45, currentHealth(delver))
			tt.elapsed(s)

			s.Drink(playerID)
			s.applyIntents()

			if tt.allowed {
				assert.Equal(t, 70, currentHealth(delver), "the second potion healed")
				assert.False(t, itemExists(s, second))
				assert.Nil(t, consumableSlot(t, s, delver, 2))
				return
			}
			assert.Equal(t, 45, currentHealth(delver), "refused on cooldown")
			assert.True(t, itemExists(s, second), "the potion is kept")
			assert.Positive(t, potionOf(t, delver).CooldownRemaining)
			assert.Less(t, potionOf(t, delver).CooldownRemaining, 0.1, "a refusal does not restart the cooldown")
		})
	}
}

// A stored-loadout potion's instance id is recorded as consumed on the
// delver; a potion looted this run is drunk the same way and records nothing.
// FS-P9G8R §Requirements 10, 11.
func TestRun_Drink_RecordsStoredPotionsAsConsumed(t *testing.T) {
	s := coopRun(t)
	playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
	hurt(t, delver, 10, 100)
	stored := healthPotion(25)
	inConsumableSlot(t, s, delver, 1, stored)
	inConsumableSlot(t, s, delver, 2, lootedHealthPotion(25))

	s.Drink(playerID)
	tick(s)
	assert.Equal(t, []uuid.UUID{*stored.InstanceID}, potionOf(t, delver).ConsumedItemIDs)

	ticks(s, constants.GameFrameRate)
	s.Drink(playerID)
	tick(s)

	assert.Equal(t, 60, currentHealth(delver), "the looted potion was drunk")
	assert.Equal(t, []uuid.UUID{*stored.InstanceID}, potionOf(t, delver).ConsumedItemIDs, "and recorded nothing")
}

// The consumed record and a running cooldown ride the body onto the next
// floor. FS-P9G8R §Requirements 11; §Edge States "Floor change".
func TestRun_Drink_RecordAndCooldownSurviveAFloorChange(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	playerID, delver := seatedDelver(t, s, "warrior", 500, 500)
	hurt(t, delver, 10, 100)
	stored := healthPotion(25)
	inConsumableSlot(t, s, delver, 1, stored)
	kept := inConsumableSlot(t, s, delver, 2, healthPotion(25))
	s.Drink(playerID)
	tick(s)

	require.NoError(t, s.regenerateFloor())

	body := delverEntity(t, s, playerID)
	assert.Equal(t, []uuid.UUID{*stored.InstanceID}, potionOf(t, body).ConsumedItemIDs)
	assert.Positive(t, potionOf(t, body).CooldownRemaining, "the cooldown still runs")

	s.Drink(playerID)
	s.applyIntents()
	assert.True(t, itemExists(s, kept), "refused on the carried-over cooldown")

	ticks(s, constants.GameFrameRate)
	s.Drink(playerID)
	tick(s)
	assert.False(t, itemExists(s, kept), "drunk once the cooldown ends")
	assert.Len(t, potionOf(t, body).ConsumedItemIDs, 2)
}
