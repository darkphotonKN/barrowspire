package game

import (
	"reflect"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// wearInEverySlot fills every equipment field of the delver with an item of its
// own, whatever the slot list says, and returns their ids.
func wearInEverySlot(t *testing.T, s *Session, playerEntityID uuid.UUID) []uuid.UUID {
	t.Helper()
	fields := reflect.ValueOf(equipmentOf(t, s, playerEntityID)).Elem()
	var ids []uuid.UUID
	for i := 0; i < fields.NumField(); i++ {
		id := s.AddItem(types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: fields.Type().Field(i).Name})
		fields.Field(i).Set(reflect.ValueOf(&id))
		ids = append(ids, id)
	}
	return ids
}

// What a delver wears in any slot climbs with them. I-77AB6-11.
func TestPersistentEntityIDs_KeepsWhatIsWornInEverySlot(t *testing.T) {
	s, _ := equipRun(t, nil)
	playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"})
	worn := wearInEverySlot(t, s, playerEntityID)

	keep := persistentEntityIDs(s.EntityManager.GetAllEntities())

	for _, id := range worn {
		assert.True(t, keep[id], "worn item %s is kept", id)
	}
}

// What a delver wears in any slot leaves the run with them. I-77AB6-11.
func TestGetRawMatchState_ExtractsWhatIsWornInEverySlot(t *testing.T) {
	s, _ := equipRun(t, nil)
	playerEntityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"})
	wearInEverySlot(t, s, playerEntityID)

	state := s.getRawMatchState()

	require.Len(t, state.Players, 1)
	extracted := reflect.ValueOf(state.Players[0].Equipment)
	for i := 0; i < extracted.NumField(); i++ {
		assert.False(t, extracted.Field(i).IsNil(), "%s is extracted", extracted.Type().Field(i).Name)
	}
}
