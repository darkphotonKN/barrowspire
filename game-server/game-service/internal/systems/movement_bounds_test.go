package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// walkFarRight drives one player east for long enough to hit whatever boundary
// the system is enforcing, and reports where they ended up.
func walkFarRight(t *testing.T, sys MovementSystem, startX, startY float64) float64 {
	t.Helper()

	em := ecs.NewEntityManager()
	entity := em.CreateEntity()
	entity.AddComponent(components.NewPlayerComponent(uuid.New(), "mage", "Delver", false, false, false))
	entity.AddComponent(components.NewTransformComponent(startX, startY))
	entity.AddComponent(components.NewVelocityComponent(1, 0, constants.DefaultSpeed))

	deltaTime := 1.0 / float64(constants.GameFrameRate)
	for range 600 {
		sys.Update(deltaTime, em.GetAllEntities())
	}

	transformComp, ok := entity.GetComponent(ecs.ComponentTypeTransform)
	require.True(t, ok)

	return transformComp.(*components.TransformComponent).X
}

// The hub is 2000 wide; a run's map is 1440. Boundaries belong to the world, not
// to the system. FS-29KSH §Requirements 3, 5.
func TestMovementSystem_ClampsToTheWorldsOwnBounds(t *testing.T) {
	t.Run("a run keeps the default bounds", func(t *testing.T) {
		endX := walkFarRight(t, *NewMovementSystem(), 100, 500)

		assert.InDelta(t, constants.MapWidth-constants.PlayerRadius, endX, 1)
	})

	t.Run("the hub is wider and the player can reach its edge", func(t *testing.T) {
		hub := MovementSystem{MapWidth: constants.HubMapWidth, MapHeight: constants.HubMapHeight}

		endX := walkFarRight(t, hub, 100, 500)

		assert.InDelta(t, constants.HubMapWidth-constants.PlayerRadius, endX, 1)
		assert.Greater(t, endX, constants.MapWidth,
			"a player in the hub must not be trapped inside a run's map width")
	})
}
