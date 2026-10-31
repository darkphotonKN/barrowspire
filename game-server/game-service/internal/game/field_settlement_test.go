package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §F R38, R42, R48; §B R13; Edge State "Visit with no XP and no
// pickups". I-X2F2H-6.

// pickUpInField puts an item found in the field, with no stored instance, into
// the member's satchel, as a pickup does.
func pickUpInField(t *testing.T, field *Session, memberID uuid.UUID, name string) {
	t.Helper()

	entity := CreateItemEntity(field.EntityManager, types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeWeapon, Name: name})
	satchel := inventory(t, field, delverEntity(t, field, memberID).ID)
	satchel.ItemIDs = append(satchel.ItemIDs, entity.ID)
}

// Ending a visit snapshots what the body wears, with each loadout item's stored
// instance, and what it carries, picked-up items with none. R38, R41.
func TestEndVisit_SnapshotsTheBodysGear(t *testing.T) {
	field := builtField(t)
	gear := fieldGear()
	loadout := gear.GetLoadout()
	memberID := uuid.New()
	_, err := field.SeatVisitor(memberID, fieldWren, uuid.New(), gear)
	require.NoError(t, err)
	pickUpInField(t, field, memberID, "Boar Tusk")

	visit, ended := field.EndVisit(memberID)
	require.True(t, ended)

	require.NotNil(t, visit.Equipment.WeaponSlot, "the worn sword is in the snapshot")
	require.NotNil(t, visit.Equipment.WeaponSlot.InstanceID)
	assert.Equal(t, loadout.Weapon.Id, visit.Equipment.WeaponSlot.InstanceID.String())
	assert.Equal(t, "Seax", visit.Equipment.WeaponSlot.Name)
	require.Len(t, visit.Satchel, 2, "the helm too high to wear, and the pickup")
	assert.Equal(t, "Barrow Helm", visit.Satchel[0].Name)
	require.NotNil(t, visit.Satchel[0].InstanceID)
	assert.Equal(t, loadout.Head.Id, visit.Satchel[0].InstanceID.String())
	assert.Equal(t, "Boar Tusk", visit.Satchel[1].Name)
	assert.Nil(t, visit.Satchel[1].InstanceID, "a pickup has no stored instance yet")
}

// A second visit by the same character carries its own id and starts from
// zero: no XP carried over. R13, R42.
func TestSeatVisitor_ASecondVisitStartsFromZero(t *testing.T) {
	field := builtField(t)
	memberID := visitor(t, field, fieldWren)
	field.publishKills([]systems.KillRecord{boarKilledBy(memberID, 3, false)})
	first, ended := field.EndVisit(memberID)
	require.True(t, ended)
	require.Positive(t, first.ExperienceGained)

	_, err := field.SeatVisitor(memberID, fieldWren, uuid.New(), fieldGear())
	require.NoError(t, err)
	second, ended := field.EndVisit(memberID)
	require.True(t, ended)

	assert.NotEqual(t, first.ID, second.ID, "every visit has its own session id")
	assert.Zero(t, second.ExperienceGained)
}

// An item picked up and settled on one visit never reaches a later visit's
// snapshot without its instance: the next body is built from items-service,
// not from the last one. R48.
func TestEndVisit_ASettledPickupIsNeverSettledAgain(t *testing.T) {
	field := builtField(t)
	memberID := visitor(t, field, fieldWren)
	pickUpInField(t, field, memberID, "Boar Tusk")
	first, _ := field.EndVisit(memberID)
	require.Len(t, first.Satchel, 2)
	require.Nil(t, first.Satchel[1].InstanceID, "the first visit settles the pickup as new")

	_, err := field.SeatVisitor(memberID, fieldWren, uuid.New(), fieldGear())
	require.NoError(t, err)
	second, ended := field.EndVisit(memberID)
	require.True(t, ended)

	for _, item := range append(second.Satchel, wornItems(second.Equipment)...) {
		assert.NotNil(t, item.InstanceID, "%s reached a second snapshot with no instance", item.Name)
	}
}

// wornItems is every filled slot of an equipment snapshot.
func wornItems(equipment types.ExtractedEquipment) []*types.ExtractedItem {
	var worn []*types.ExtractedItem
	for _, item := range []*types.ExtractedItem{
		equipment.WeaponSlot, equipment.HeadSlot, equipment.ChestSlot, equipment.GlovesSlot,
		equipment.LegsSlot, equipment.Ring1Slot, equipment.Ring2Slot,
		equipment.Consumable1, equipment.Consumable2, equipment.Consumable3,
	} {
		if item != nil {
			worn = append(worn, item)
		}
	}
	return worn
}
