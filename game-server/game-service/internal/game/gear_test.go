package game

import (
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ring(name string, requiredLevel int, affixes ...types.Affix) types.ItemConfig {
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeRing, Name: name,
		RequiredLevel: requiredLevel, Affixes: affixes,
	}
}

// Rings go into ring 1, then ring 2; with both full the next replaces ring 1,
// whose ring goes back to the inventory. FS-4R9M9 §Requirements 42.
func TestHandleEquip_Ring_FillsRing1ThenRing2ThenReplacesRing1(t *testing.T) {
	s, _ := equipRun(t, nil)
	playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
	first := carried(t, s, playerEntityID, ring("Bone Ring", 1))
	second := carried(t, s, playerEntityID, ring("Iron Ring", 1))
	third := carried(t, s, playerEntityID, ring("Gold Ring", 1))
	equipment := equipmentOf(t, s, playerEntityID)

	require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, first))
	require.NotNil(t, equipment.Ring1Slot)
	assert.Equal(t, first, *equipment.Ring1Slot)
	assert.Nil(t, equipment.Ring2Slot)

	require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, second))
	require.NotNil(t, equipment.Ring2Slot)
	assert.Equal(t, first, *equipment.Ring1Slot)
	assert.Equal(t, second, *equipment.Ring2Slot)

	require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, third))
	assert.Equal(t, third, *equipment.Ring1Slot)
	assert.Equal(t, second, *equipment.Ring2Slot)

	items := inventory(t, s, playerEntityID).ItemIDs
	assert.Contains(t, items, first, "the replaced ring goes back to the inventory")
	assert.NotContains(t, items, second)
	assert.NotContains(t, items, third)
}

// Unequip takes the named ring out, whichever slot it is in.
func TestHandleEquip_RingUnequip_TakesOutTheNamedRing(t *testing.T) {
	s, _ := equipRun(t, nil)
	playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
	first := carried(t, s, playerEntityID, ring("Bone Ring", 1))
	second := carried(t, s, playerEntityID, ring("Iron Ring", 1))
	require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, first))
	require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, second))

	require.NoError(t, s.handleEquip(constants.ActionUnequip, playerEntityID, second))

	equipment := equipmentOf(t, s, playerEntityID)
	require.NotNil(t, equipment.Ring1Slot)
	assert.Equal(t, first, *equipment.Ring1Slot)
	assert.Nil(t, equipment.Ring2Slot)
	assert.Contains(t, inventory(t, s, playerEntityID).ItemIDs, second)
}

// The level gate applies to rings like any slot. FS-BDA7X §Requirements 32.
func TestHandleEquip_OverLevelRing_IsRefused(t *testing.T) {
	s, dispatcher := equipRun(t, nil)
	playerID := uuid.New()
	playerEntityID := s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
	lantern := carried(t, s, playerEntityID, ring("Lantern of the Drowned", 9))

	err := s.handleEquip(constants.ActionEquip, playerEntityID, lantern)

	assert.ErrorIs(t, err, ErrBelowRequiredLevel)
	assert.Nil(t, equipmentOf(t, s, playerEntityID).Ring1Slot)
	assert.Contains(t, inventory(t, s, playerEntityID).ItemIDs, lantern)
	require.NotEmpty(t, dispatcher.framesTo(playerID))
}

// What is worn counts from the next tick in a stepped world: a ring's max
// health and move speed show on the delver, and come off with it.
// FS-4R9M9 §Requirements 39–40, 43.
func TestStep_WornRing_CountsOnTheNextTickAndComesOff(t *testing.T) {
	for _, bounds := range []WorldBounds{RunBounds(), HubBounds()} {
		t.Run(string(bounds.Type), func(t *testing.T) {
			s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, bounds)
			playerID := uuid.New()
			playerEntityID := s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
			s.step(1.0/60, s.EntityManager.GetAllEntities())
			entity := delverEntity(t, s, playerID)
			hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
			health := hc.(*components.HealthComponent)
			vc, _ := entity.GetComponent(ecs.ComponentTypeVelocity)
			velocity := vc.(*components.VelocityComponent)
			ownMax := health.MaxHealth

			band := carried(t, s, playerEntityID, ring("Band", 1,
				types.Affix{Stat: types.AffixMaxHealth, Tier: 1, Value: 6},
				types.Affix{Stat: types.AffixMoveSpeed, Tier: 1, Value: 10}))
			require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, band))
			s.step(1.0/60, s.EntityManager.GetAllEntities())

			assert.Equal(t, ownMax+6, health.MaxHealth)
			assert.Equal(t, ownMax, health.CurrentHealth, "gaining maximum never heals")
			assert.InDelta(t, constants.DefaultSpeed*1.1, velocity.Speed, 1e-9)

			require.NoError(t, s.handleEquip(constants.ActionUnequip, playerEntityID, band))
			s.step(1.0/60, s.EntityManager.GetAllEntities())

			assert.Equal(t, ownMax, health.MaxHealth)
			assert.InDelta(t, constants.DefaultSpeed, velocity.Speed, 1e-9)
		})
	}
}

// A ring already worn is not worn twice: its affixes would count double.
func TestHandleEquip_RingAlreadyWorn_IsNotWornTwice(t *testing.T) {
	s, _ := equipRun(t, nil)
	playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
	band := carried(t, s, playerEntityID, ring("Band", 1))
	require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, band))

	require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, band))

	equipment := equipmentOf(t, s, playerEntityID)
	assert.Equal(t, band, *equipment.Ring1Slot)
	assert.Nil(t, equipment.Ring2Slot)
}

// A delver whose loadout carries max health and mana is seated at full,
// including the gear and their Vitality's max HP. FS-4R9M9 §Requirements 40.
func TestStep_SeatedWithMaxHealthGear_StartsAtFull(t *testing.T) {
	client := &mockItemsClient{loadout: &pb.GetLoadoutWithItemsResponse{
		Ring_2: &pb.ItemInstance{
			Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "ring", Name: "Band",
			RequiredLevel: 1, Affixes: []*pb.Affix{
				{Stat: types.AffixMaxHealth, Tier: 2, Value: 10},
				{Stat: types.AffixMaxMana, Tier: 0, Value: 12},
			},
		},
	}}
	s, _ := equipRun(t, client)
	playerID := uuid.New()
	s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
	entity := delverEntity(t, s, playerID)
	hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)
	mc, _ := entity.GetComponent(ecs.ComponentTypeMana)
	mana := mc.(*components.ManaComponent)
	ownHealth, ownMana := health.MaxHealth, mana.MaxMana

	s.step(1.0/60, s.EntityManager.GetAllEntities())

	vitality := classAtLevel(Classes["warrior"], 3).Stats.Vitality * HealthPerVitality
	assert.Equal(t, ownHealth+vitality+10, health.MaxHealth)
	assert.Equal(t, ownHealth+vitality+10, health.CurrentHealth)
	assert.Equal(t, ownMana+12, mana.MaxMana)
	assert.Equal(t, ownMana+12, mana.CurrentMana)
}

// Vitality is max HP: a seated delver starts full with HealthPerVitality per
// point of their class's Vitality; a level-up's Vitality growth raises max HP by
// growth × HealthPerVitality beside the class's max HP growth, without healing.
// (user decision 2026-10-09)
func TestStep_Vitality_AddsMaxHealth_LevelUpNeverHeals(t *testing.T) {
	s := coopRun(t)
	_, delver := placeDelver(t, s, "warrior", 500, 500)
	warrior := Classes["warrior"]
	health := healthComponent(t, delver)

	tick(s)
	seatedMax := warrior.Health.MaxHealth + warrior.Stats.Vitality*HealthPerVitality
	assert.Equal(t, seatedMax, health.MaxHealth)
	assert.Equal(t, seatedMax, health.CurrentHealth, "seated at full")

	health.CurrentHealth = 100
	gainExperience(delver, warrior.Growth, int(progression.LevelFloor(2)))
	tick(s)

	assert.Equal(t, seatedMax+warrior.Growth.MaxHealth+warrior.Growth.Vitality*HealthPerVitality, health.MaxHealth)
	assert.Equal(t, 100, health.CurrentHealth, "a level-up never heals")
}
