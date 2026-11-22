package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
)

// A Blink lands on the walk's own ground: the session's MovementSystem, with
// a dungeon floor's cells handed to it as the floor is built, and none on a
// floor of buildings. FS-04EEA §D R19; §Edge States "Blink in a field".
func TestSession_BlinkGround_IsTheWalksWithTheFloorsCells(t *testing.T) {
	s, _ := dungeonRun(t, 1, 1, 0)
	assert.Same(t, s.movementSystem, s.combatSystem.Ground)
	assert.NotNil(t, s.movementSystem.Grid, "a dungeon floor hands over its cells")

	buildings := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	failGeneration(buildings)
	buildings.InitialSystems()
	buildings.InitialMapObjects(nil)
	assert.Same(t, buildings.movementSystem, buildings.combatSystem.Ground)
	assert.Nil(t, buildings.movementSystem.Grid, "a floor of buildings has no cells")
}
