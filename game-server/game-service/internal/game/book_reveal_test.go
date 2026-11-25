package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R49, FS-5FZ4J §D R30: a witchlight burning 3 cells from an
// undetected trap reveals it on the run's tick, so it is in every member's
// state that tick with revealed: true; one 4 cells off stays off the wire.
// I-X2CMM-14.
func TestBookReveal_AWitchlightRevealsATrapOnTheTicksWire(t *testing.T) {
	s, ids := trapsRun(t, 7, 2)
	traps := trapsOf(s)
	require.NotEmpty(t, traps)
	trap := traps[0]
	for _, id := range ids {
		require.NotContains(t, trapsIn(runState(t, s, id)), trap.ID, "undetected before the light")
	}
	mage := delverEntity(t, s, ids[0])
	c := trapOf(trap).Cell

	far := s.dungeon.cellCentre(components.Cell{X: c.X + 4, Y: c.Y})
	light := systems.SetDownBookEffect(s.EntityManager, components.BookEffectWitchlight, far.x, far.y, 20, mage)
	tick(s)
	require.NotContains(t, trapsIn(runState(t, s, ids[1])), trap.ID, "4 cells off: still hidden")
	s.EntityManager.RemoveEntity(light.ID)

	near := s.dungeon.cellCentre(components.Cell{X: c.X + 3, Y: c.Y})
	systems.SetDownBookEffect(s.EntityManager, components.BookEffectWitchlight, near.x, near.y, 20, mage)
	tick(s)

	for _, id := range ids {
		listed := trapsIn(runState(t, s, id))
		require.Contains(t, listed, trap.ID, "revealed: in every member's state")
		assert.True(t, listed[trap.ID].Revealed)
	}
}
