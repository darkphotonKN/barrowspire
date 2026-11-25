package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R58 as reconciled at wave 2, FS-5FZ4J §C R18: a hound standing
// on a pressure plate holds it as a body does; a hound at no health holds
// nothing. I-X2CMM-17.

// plateHound sets a hound down at (x, y), 40 health and its 40 s, its archer
// no body of this world, so it stands where it is set.
func plateHound(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	hound := systems.SetDownBookEffect(em, components.BookEffectHound, x, y, 40, em.CreateEntity())
	hound.AddComponent(components.NewHealthComponent(40, 40))
	hound.AddComponent(components.NewVelocityComponent(0, 0, 0))
	hound.AddComponent(&components.HoundComponent{OwnerMemberID: uuid.New(), Action: components.HoundActionIdle})
	return hound
}

func TestPlateHeld_AHoundOnItHoldsIt(t *testing.T) {
	const size = 80.0
	cell := components.Cell{X: 3, Y: 4}
	x, y := 3*size+size/2, 4*size+size/2

	t.Run("a hound standing", func(t *testing.T) {
		em := ecs.NewEntityManager()
		hound := plateHound(em, x, y)
		holds, by := plateHeld(cell, size, em.GetAllEntities())
		assert.True(t, holds)
		require.NotNil(t, by)
		assert.Equal(t, hound.ID, by.ID)
	})
	t.Run("a hound at no health", func(t *testing.T) {
		em := ecs.NewEntityManager()
		hc, _ := plateHound(em, x, y).GetComponent(ecs.ComponentTypeHealth)
		hc.(*components.HealthComponent).CurrentHealth = 0
		holds, _ := plateHeld(cell, size, em.GetAllEntities())
		assert.False(t, holds)
	})
}

// A delver on one plate and the hound on the other break the seal: the hound
// holds its plate through the run's tick.
func TestWeightedPlates_ADelverAndAHoundHoldEveryPlate_TheSealBreaks(t *testing.T) {
	s, player, seal := platesRun(t, 7)
	plates := piecesOfKind(s, components.SealPiecePlate)
	require.Len(t, plates, 2, "floor 1 has two plates")
	standOn(t, s, delverEntity(t, s, player), pieceOf(plates[0]).Cell)
	centre := s.dungeon.cellCentre(pieceOf(plates[1]).Cell)
	plateHound(s.EntityManager, centre.x, centre.y)

	tick(s)

	assert.True(t, pieceOf(plates[1]).Active, "the hound holds its plate")
	assert.True(t, sealComponentOf(seal).Broken)
}
