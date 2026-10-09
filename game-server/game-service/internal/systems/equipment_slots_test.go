package systems

import (
	"reflect"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The slot list names every slot field of the equipment, each once: a slot
// added to the component and not to the list would be dropped by the gear sum,
// equipping, the floor keep rule and the extraction alike. I-77AB6-11.
func TestEquipmentSlots_NameEveryEquipmentFieldOnce(t *testing.T) {
	eq := &components.EquipmentComponent{}
	fields := reflect.ValueOf(eq).Elem()

	var filled []uuid.UUID
	for i := 0; i < fields.NumField(); i++ {
		id := uuid.New()
		fields.Field(i).Set(reflect.ValueOf(&id))
		filled = append(filled, id)
	}

	require.Len(t, EquipmentSlots, fields.NumField())
	assert.ElementsMatch(t, filled, WornIDs(eq))
}

// The gear sum reads the weapon, armor and ring slots, never the consumables.
func TestWornSlots_AreTheGearSlots(t *testing.T) {
	var names []string
	for _, slot := range wornSlots {
		names = append(names, slot.Name)
	}
	assert.Equal(t, []string{"weapon", "head", "chest", "gloves", "legs", "ring_1", "ring_2"}, names)
}
