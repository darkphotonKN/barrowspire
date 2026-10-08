package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
)

// Floor depth is world state: a system finds it in the entity list it is handed
// each tick, with no access to the session. FS-F6F88 §Requirements 3.
func TestCurrentFloor_ReadsTheRunLevelEntity(t *testing.T) {
	em := ecs.NewEntityManager()
	em.CreateEntity().AddComponent(components.NewTransformComponent(1, 1))
	em.CreateEntity().AddComponent(components.NewFloorComponent(2, 3))

	floor, ok := CurrentFloor(em.GetAllEntities())

	assert.True(t, ok)
	assert.Equal(t, 2, floor.Depth)
	assert.Equal(t, 3, floor.Count)
}

func TestCurrentFloor_HubHasNone(t *testing.T) {
	em := ecs.NewEntityManager()
	em.CreateEntity().AddComponent(components.NewTransformComponent(1, 1))

	_, ok := CurrentFloor(em.GetAllEntities())

	assert.False(t, ok)
}
