package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Seating opts an item in to safe; every other item a world makes is an unsafe
// find. FS-18Z5F §D R19.
func TestItemEntity_SeatedIsSafe_EverythingElseIsUnsafe(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s

	eq, _ := delverEntity(t, s, p.carrier).GetComponent(ecs.ComponentTypeEquipment)
	seated := itemComponent(t, s, *eq.(*components.EquipmentComponent).WeaponSlot)
	assert.False(t, seated.Unsafe, "a seated item is safe")

	require.NotEmpty(t, p.chestItemIDs)
	for _, id := range append([]uuid.UUID{p.pickedUpItemID}, p.chestItemIDs...) {
		assert.True(t, itemComponent(t, s, id).Unsafe, "a chest item is an unsafe find")
	}
	assert.True(t, itemComponent(t, s, p.groundItemID).Unsafe, "an item added to the world is an unsafe find")
}

// A monster's drop and a field's pile hold unsafe finds. FS-18Z5F §D R19, R22.
func TestItemEntity_DropsAndFieldPilesAreUnsafe(t *testing.T) {
	s := dropSession()
	newMonsterDrops(s, seeded()).ConsumeKill(demonRecord(9))
	piles := dropPiles(s)
	require.Len(t, piles, 1)
	for _, id := range pileItemIDs(t, piles[0]) {
		assert.True(t, itemComponent(t, s, id).Unsafe, "a monster drop is an unsafe find")
	}

	field := lootedField(t)
	_, fieldItemID := landPile(t, field, uuid.New())
	assert.True(t, itemComponent(t, field, fieldItemID).Unsafe, "a field pile item is an unsafe find")
}

// Unsafe follows the item, not the slot: equipping and unequipping it keep it.
// FS-18Z5F §D R20.
func TestHandleEquip_UnsafeFind_StaysUnsafeWornAndCarried(t *testing.T) {
	s, _ := equipRun(t, nil)
	playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")
	helmID := carried(t, s, playerEntityID, types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead, Name: "Barrow Helm",
	})

	require.NoError(t, s.handleEquip(constants.ActionEquip, playerEntityID, helmID))
	require.NotNil(t, equipmentOf(t, s, playerEntityID).HeadSlot)
	assert.True(t, itemComponent(t, s, helmID).Unsafe, "worn, it is still an unsafe find")

	require.NoError(t, s.handleEquip(constants.ActionUnequip, playerEntityID, helmID))
	assert.Contains(t, inventory(t, s, playerEntityID).ItemIDs, helmID)
	assert.True(t, itemComponent(t, s, helmID).Unsafe, "carried again, it is still an unsafe find")
}

// A floor change keeps every carried item's flag. FS-18Z5F §D R20.
func TestRegenerateFloor_KeepsTheUnsafeFlag(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	eq, _ := delverEntity(t, s, p.carrier).GetComponent(ecs.ComponentTypeEquipment)
	seatedID := *eq.(*components.EquipmentComponent).WeaponSlot

	require.NoError(t, s.regenerateFloor())

	assert.True(t, itemComponent(t, s, p.pickedUpItemID).Unsafe, "the carried find is still unsafe")
	assert.False(t, itemComponent(t, s, seatedID).Unsafe, "the seated weapon is still safe")
}

// geared is a delver wearing a safe sword and an unsafe ring and carrying an
// unsafe potion and a safe helm.
type geared struct {
	s        *Session
	playerID uuid.UUID
	entityID uuid.UUID
}

func gearedDelver(t *testing.T, s *Session) geared {
	t.Helper()
	g := geared{s: s, playerID: uuid.New()}
	g.entityID = s.AddPlayer(g.playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")

	sword := s.AddItem(types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeWeapon, Name: "Barrow Seax", Safe: true})
	ring := s.AddItem(types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeRing, Name: "Iron Band"})
	equipment := equipmentOf(t, s, g.entityID)
	equipment.WeaponSlot, equipment.Ring1Slot = &sword, &ring

	carried(t, s, g.entityID, types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: "Lesser Heal Potion"})
	carried(t, s, g.entityID, types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead, Name: "Barrow Helm", Safe: true})
	return g
}

func (g geared) die(t *testing.T) {
	t.Helper()
	body, ok := g.s.EntityManager.GetEntity(g.entityID)
	require.True(t, ok)
	hc, _ := body.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	hc.(*components.HealthComponent).IsEliminated = true
}

func (g geared) escape(t *testing.T) {
	t.Helper()
	body, ok := g.s.EntityManager.GetEntity(g.entityID)
	require.True(t, ok)
	markEscaped(t, body)
}

func extractedNames(items []*types.ExtractedItem) []string {
	names := []string{}
	for _, item := range items {
		names = append(names, item.Name)
	}
	return names
}

// At a run's end a dead delver who did not escape loses their unsafe finds,
// worn and carried, and keeps what they brought in; an escaped delver and a
// living one extract everything. FS-18Z5F §E R23.
func TestGetRawMatchState_DeadDelverLosesUnsafeFinds(t *testing.T) {
	tests := []struct {
		name      string
		resolve   func(t *testing.T, g geared)
		wantRing  bool
		wantSatch []string
	}{
		{"dead, not escaped", func(t *testing.T, g geared) { g.die(t) }, false, []string{"Barrow Helm"}},
		{"dead, left early", func(t *testing.T, g geared) {
			g.die(t)
			require.NoError(t, g.s.Depart(g.playerID))
		}, false, []string{"Barrow Helm"}},
		{"escaped", func(t *testing.T, g geared) { g.escape(t) }, true, []string{"Lesser Heal Potion", "Barrow Helm"}},
		{"alive, not escaped", func(t *testing.T, g geared) {}, true, []string{"Lesser Heal Potion", "Barrow Helm"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := equipRun(t, nil)
			g := gearedDelver(t, s)
			tt.resolve(t, g)

			state := s.getRawMatchState()

			require.Len(t, state.Players, 1, "the body is in the event")
			extracted := state.Players[0]
			require.NotNil(t, extracted.Equipment.WeaponSlot, "the brought-in sword comes home")
			assert.Equal(t, "Barrow Seax", extracted.Equipment.WeaponSlot.Name)
			if tt.wantRing {
				require.NotNil(t, extracted.Equipment.Ring1Slot)
				assert.Equal(t, "Iron Band", extracted.Equipment.Ring1Slot.Name)
			} else {
				assert.Nil(t, extracted.Equipment.Ring1Slot, "the unsafe ring's slot extracts empty")
			}
			assert.Equal(t, tt.wantSatch, extractedNames(extracted.Inventory))
		})
	}
}

// A delver whose body is gone is absent from the run's end. FS-18Z5F §E R24.
func TestGetRawMatchState_RemovedDelverIsAbsent(t *testing.T) {
	s, _ := equipRun(t, nil)
	g := gearedDelver(t, s)
	g.die(t)
	s.RemovePlayer(g.playerID.String())

	assert.Empty(t, s.getRawMatchState().Players)
}

// A field visit drops nothing, however its visitor died. FS-18Z5F §E R25.
func TestEndVisit_DeadVisitor_KeepsUnsafeFinds(t *testing.T) {
	field := builtField(t)
	memberID := uuid.New()
	_, err := field.SeatVisitor(memberID, fieldWren, uuid.New(), fieldGear())
	require.NoError(t, err)
	pickUpInField(t, field, memberID, "Boar Tusk")
	g := geared{s: field, playerID: memberID, entityID: delverEntity(t, field, memberID).ID}
	g.die(t)

	visit, ended := field.EndVisit(memberID)

	require.True(t, ended)
	assert.Contains(t, extractedNames(visit.Satchel), "Boar Tusk", "a field death loses nothing")
}

// A field world's own end state drops nothing either: only a run's end does.
// FS-18Z5F §E R25.
func TestGetRawMatchState_FieldWorld_DeadVisitorKeepsUnsafeFinds(t *testing.T) {
	field := builtField(t)
	memberID := uuid.New()
	_, err := field.SeatVisitor(memberID, fieldWren, uuid.New(), fieldGear())
	require.NoError(t, err)
	pickUpInField(t, field, memberID, "Boar Tusk")
	geared{s: field, playerID: memberID, entityID: delverEntity(t, field, memberID).ID}.die(t)

	state := field.getRawMatchState()

	require.Len(t, state.Players, 1)
	assert.Contains(t, extractedNames(state.Players[0].Inventory), "Boar Tusk")
}
