package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R50 (Far Hand springs a detected trap), on FS-5FZ4J §D
// R25-R28. I-X2CMM-15.

// A sprung spike plate, dart wall or fire jet fires as if stepped on with no
// body on its cell: it disarms, re-arms RearmAfter later, and hits no one,
// not even a body standing on it.
func TestTrapSystemSpring_AHittingTrapDisarmsAndRearmsHittingNoOne(t *testing.T) {
	for _, kind := range []components.TrapKind{components.TrapSpikePlate, components.TrapDartWall, components.TrapFireJet} {
		t.Run(string(kind), func(t *testing.T) {
			em := ecs.NewEntityManager()
			e, trap := trapOn(em, kind, components.Cell{X: 5, Y: 5})
			mage := bodyAt(em, 0, 0)
			sys := newTrapSystem()

			springs, sprung := sys.Spring(e, mage, em.GetAllEntities())

			require.True(t, sprung)
			assert.Empty(t, springs, "no body hit")
			assert.False(t, trap.Armed)
			assert.False(t, trap.Spent)
			assert.Equal(t, trapRearm, trap.RearmIn)
			assert.True(t, detectedTrap(e))

			for range int(trapRearm/trapTick) + 1 {
				sys.Update(trapTick, em.GetAllEntities())
			}
			assert.True(t, trap.Armed, "re-armed after RearmAfter")
		})
	}
}

// A sprung tripwire is spent, and springs at the body that sprang it, the one
// its ambush wakes on.
func TestTrapSystemSpring_ATripwireIsSpentAtItsSpringer(t *testing.T) {
	em := ecs.NewEntityManager()
	e, trap := trapOn(em, components.TrapTripwire, components.Cell{X: 5, Y: 5})
	mage := bodyAt(em, 0, 0)

	springs, sprung := newTrapSystem().Spring(e, mage, em.GetAllEntities())

	require.True(t, sprung)
	assert.Equal(t, []TrapSpring{{Trap: e, Kind: components.TrapTripwire, Body: mage}}, springs)
	assert.False(t, trap.Armed)
	assert.True(t, trap.Spent)
}

// A sprung gas vent puffs now at every grounded body in its cloud that
// breathes, the springer only if they stand in it, and its puff shows.
func TestTrapSystemSpring_AGasVentPuffsAtWhoeverIsInItsCloud(t *testing.T) {
	em := ecs.NewEntityManager()
	vent, trap := trapOn(em, components.TrapGasVent, components.Cell{X: 5, Y: 5})
	trap.Age = 12
	mage := bodyAt(em, 0, 0)
	inCloud := bodyAt(em, 5.5*trapCell+ventRadius-1, 5.5*trapCell)
	outside := bodyAt(em, 5.5*trapCell+ventRadius+1, 5.5*trapCell)

	springs, sprung := newTrapSystem().Spring(vent, mage, em.GetAllEntities())

	require.True(t, sprung)
	assert.Equal(t, []TrapSpring{{Trap: vent, Kind: components.TrapGasVent, Body: inCloud}}, springs)
	assert.NotContains(t, springs, TrapSpring{Trap: vent, Kind: components.TrapGasVent, Body: outside})
	assert.True(t, trap.Armed, "a gas vent is always armed")
	assert.True(t, trap.Puffed)
	assert.Equal(t, 12.0, trap.PuffedAt)
}

// A trap that is not armed (waiting to re-arm, a spent tripwire) is not
// sprung: nothing changes.
func TestTrapSystemSpring_AnUnarmedTrapIsNotSprung(t *testing.T) {
	for name, set := range map[string]func(*components.TrapComponent){
		"re-arming":      func(tr *components.TrapComponent) { tr.Armed, tr.RearmIn = false, 4 },
		"spent tripwire": func(tr *components.TrapComponent) { tr.Kind, tr.Armed, tr.Spent = components.TrapTripwire, false, true },
	} {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			e, trap := trapOn(em, components.TrapSpikePlate, components.Cell{X: 5, Y: 5})
			set(trap)
			before := *trap

			springs, sprung := newTrapSystem().Spring(e, bodyAt(em, 0, 0), em.GetAllEntities())

			assert.False(t, sprung)
			assert.Empty(t, springs)
			assert.Equal(t, before, *trap)
		})
	}
}
