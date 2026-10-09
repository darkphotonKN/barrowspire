package game

import (
	"testing"

	"github.com/google/uuid"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Delvers are recorded in the order they fall, on the tick they fall, and each
// once however many ticks follow. I-77AB6-11.
func TestStep_Eliminations_RecordedInTheOrderDelversFall(t *testing.T) {
	s := coopRun(t)
	firstID, first := placeDelver(t, s, "warrior", 300, 300)
	secondID, second := placeDelver(t, s, "archer", 600, 300)
	placeDelver(t, s, "mage", 900, 300) // keeps the run going

	kill(t, first)
	tick(s)
	kill(t, second)
	tick(s)
	tick(s)

	assert.Equal(t, map[uuid.UUID]int{firstID: 0, secondID: 1}, s.eliminations)
}

// A tick already in flight when the world shuts down records nothing and does
// not panic: there is no channel left for it to send on. I-77AB6-11.
func TestStep_DelverFallsAfterShutdown_NoPanicAndNothingRecorded(t *testing.T) {
	s := coopRun(t)
	_, delver := placeDelver(t, s, "warrior", 300, 300)
	placeDelver(t, s, "archer", 600, 300)
	s.isRunning = true // as if started: Shutdown only closes a running world
	s.Shutdown()

	kill(t, delver)
	require.NotPanics(t, func() { tick(s) })

	assert.Empty(t, s.eliminations)
}
