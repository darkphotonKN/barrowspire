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
// nothing. The plate is down to the hound's archer, never the hound: the
// ambush it wakes hunts them in play, else the delver nearest the plate.
// I-X2CMM-17, I-X2CMM-26.

// plateHound sets a hound down at (x, y), 40 health and its 40 s, its archer
// no body of this world, so it stands where it is set.
func plateHound(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	return houndOf(em, x, y, em.CreateEntity())
}

// houndOf sets archer's hound down at (x, y), 40 health and its 40 s, held
// where it is set (no speed).
func houndOf(em *ecs.EntityManager, x, y float64, archer *ecs.Entity) *ecs.Entity {
	hound := systems.SetDownBookEffect(em, components.BookEffectHound, x, y, 40, archer)
	hound.AddComponent(components.NewHealthComponent(40, 40))
	hound.AddComponent(components.NewVelocityComponent(0, 0, 0))
	hound.AddComponent(&components.HoundComponent{OwnerMemberID: uuid.New(), Action: components.HoundActionIdle})
	return hound
}

func TestPlateHeld_AHoundOnItHoldsIt(t *testing.T) {
	const size = 80.0
	cell := components.Cell{X: 3, Y: 4}
	x, y := 3*size+size/2, 4*size+size/2

	t.Run("a hound standing, its archer no body here", func(t *testing.T) {
		em := ecs.NewEntityManager()
		plateHound(em, x, y)
		holds, by := plateHeld(cell, size, em.GetAllEntities())
		assert.True(t, holds)
		assert.Nil(t, by, "down to no delver: never the hound")
	})
	t.Run("a hound standing, its archer in play", func(t *testing.T) {
		em := ecs.NewEntityManager()
		archer := em.CreateEntity()
		archer.AddComponent(&components.PlayerComponent{})
		archer.AddComponent(components.NewHealthComponent(100, 100))
		houndOf(em, x, y, archer)
		holds, by := plateHeld(cell, size, em.GetAllEntities())
		assert.True(t, holds)
		require.NotNil(t, by)
		assert.Equal(t, archer.ID, by.ID, "down to its archer")
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

// houndPlatesRun is floor 1 of a seeded run of two delvers with Weighted
// Plates forced and no monster on it, the delvers' bodies and the plate that
// carries the seal's one ambush.
func houndPlatesRun(t *testing.T, seed uint64) (*Session, []*ecs.Entity, *ecs.Entity) {
	t.Helper()
	s, ids := dungeonRun(t, seed, 2, 0, forcedSeal(components.SealWeightedPlates))
	require.NotNil(t, s.dungeon, "seed %d: a dungeon floor", seed)
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	var bodies []*ecs.Entity
	for _, id := range ids {
		bodies = append(bodies, delverEntity(t, s, id))
	}
	for _, plate := range piecesOfKind(s, components.SealPiecePlate) {
		if plate.HasComponent(ecs.ComponentTypeAmbush) {
			return s, bodies, plate
		}
	}
	t.Fatalf("seed %d: no plate carries the ambush", seed)
	return nil, nil, nil
}

// assertAmbushHunts is that the woken ambush hunts want, none the hound.
func assertAmbushHunts(t *testing.T, s *Session, want, hound *ecs.Entity) {
	t.Helper()
	pack := monstersInWorld(s.EntityManager)
	require.NotEmpty(t, pack, "the ambush woke")
	for _, m := range pack {
		assert.Equal(t, want.ID, monsterOf(m).LastAttacker, "it hunts the delver it is down to")
		assert.NotEqual(t, hound.ID, monsterOf(m).LastAttacker, "never the hound")
	}
}

// A hound first onto a plate wakes its ambush on its archer in play, wherever
// they stand, though another delver stands nearer.
func TestWeightedPlates_AHoundFirstOnAPlate_TheAmbushHuntsItsArcher(t *testing.T) {
	s, bodies, plate := houndPlatesRun(t, 7)
	archer, other := bodies[0], bodies[1]
	cell := pieceOf(plate).Cell
	standOn(t, s, other, offset(cell, 0, 1))
	centre := s.dungeon.cellCentre(cell)
	hound := houndOf(s.EntityManager, centre.x, centre.y, archer)

	tick(s)

	assertAmbushHunts(t, s, archer, hound)
}

// A hound whose archer is out of play (here no body of the floor) wakes its
// plate's ambush on the delver nearest the plate.
func TestWeightedPlates_AHoundFirstOnAPlate_ItsArcherGone_TheAmbushHuntsTheNearestDelver(t *testing.T) {
	s, bodies, plate := houndPlatesRun(t, 7)
	near := bodies[1]
	cell := pieceOf(plate).Cell
	standOn(t, s, near, offset(cell, 0, 1))
	centre := s.dungeon.cellCentre(cell)
	hound := plateHound(s.EntityManager, centre.x, centre.y)

	tick(s)

	assertAmbushHunts(t, s, near, hound)
}
