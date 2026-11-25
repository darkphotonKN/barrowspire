package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R51. I-X2CMM-16: an afloat delver fires no trap and breathes
// no gas vent.

// An afloat delver entering an armed trap's cell fires nothing: the trap
// stays armed and undetected.
func TestTrapSystem_AnAfloatDelverFiresNoTrap(t *testing.T) {
	for _, kind := range []components.TrapKind{components.TrapSpikePlate, components.TrapDartWall, components.TrapFireJet, components.TrapTripwire} {
		t.Run(string(kind), func(t *testing.T) {
			em := ecs.NewEntityManager()
			cell := components.Cell{X: 5, Y: 5}
			e, trap := trapOn(em, kind, cell)
			delver := lift(bodyAt(em, 0, 0), 60)
			sys := newTrapSystem()
			sys.Update(trapTick, em.GetAllEntities())

			standAt(delver, cell)

			assert.Empty(t, sys.Update(trapTick, em.GetAllEntities()))
			assert.True(t, trap.Armed)
			assert.False(t, trap.Spent)
			assert.False(t, detectedTrap(e), "a trap that has not fired stays undetected")
		})
	}
}

// Afloat ending on a trap's cell counts as standing there: the trap fires
// only once they step off and on again.
func TestTrapSystem_AfloatEndingOnTheCell_FiresNothingUntilTheyStepOnAgain(t *testing.T) {
	em := ecs.NewEntityManager()
	cell := components.Cell{X: 5, Y: 5}
	_, trap := trapOn(em, components.TrapSpikePlate, cell)
	delver := lift(bodyAt(em, 0, 0), 60)
	sys := newTrapSystem()
	standAt(delver, cell)
	require.Empty(t, sys.Update(trapTick, em.GetAllEntities()))

	// afloat lapses where they stand
	delete(mustBook(t, delver).States, components.BookStateAfloat)
	for range 30 {
		assert.Empty(t, sys.Update(trapTick, em.GetAllEntities()), "already standing on it")
	}
	assert.True(t, trap.Armed)

	standAt(delver, components.Cell{X: 6, Y: 5})
	sys.Update(trapTick, em.GetAllEntities())
	standAt(delver, cell)
	assert.Len(t, sys.Update(trapTick, em.GetAllEntities()), 1, "stepped on again")
}

// A grounded delver on the same tick still fires the trap an afloat one
// stands on.
func TestTrapSystem_AnAfloatDelverBeside_ADelverStillFiresIt(t *testing.T) {
	em := ecs.NewEntityManager()
	cell := components.Cell{X: 5, Y: 5}
	e, _ := trapOn(em, components.TrapSpikePlate, cell)
	floating := lift(bodyAt(em, 0, 0), 60)
	grounded := bodyAt(em, 0, 0)
	sys := newTrapSystem()
	sys.Update(trapTick, em.GetAllEntities())

	standAt(floating, cell)
	standAt(grounded, cell)
	springs := sys.Update(trapTick, em.GetAllEntities())

	require.Len(t, springs, 1)
	assert.Equal(t, TrapSpring{Trap: e, Kind: components.TrapSpikePlate, Body: grounded}, springs[0])
}

// An afloat delver in a gas vent's cloud makes it puff at no one and is
// never puffed at by a cloud another keeps puffing.
func TestTrapSystem_AnAfloatDelverBreathesNoVent(t *testing.T) {
	em := ecs.NewEntityManager()
	cell := components.Cell{X: 10, Y: 10}
	vent, trap := trapOn(em, components.TrapGasVent, cell)
	floating := lift(bodyAt(em, 0, 0), 60)
	sys := newTrapSystem()
	sys.Update(trapTick, em.GetAllEntities())

	standAt(floating, cell)
	assert.Empty(t, sys.Update(trapTick, em.GetAllEntities()), "afloat alone: no puff")
	assert.False(t, trap.Puffed)
	assert.False(t, detectedTrap(vent))

	grounded := bodyAt(em, 0, 0)
	standAt(grounded, components.Cell{X: 11, Y: 10})
	springs := sys.Update(trapTick, em.GetAllEntities())
	require.Len(t, springs, 1)
	assert.Equal(t, grounded, springs[0].Body, "the puff takes the grounded delver alone")
}

// mustBook is the delver's book.
func mustBook(t *testing.T, e *ecs.Entity) *components.BookComponent {
	t.Helper()
	book, ok := bookOf(e)
	require.True(t, ok)
	return book
}
