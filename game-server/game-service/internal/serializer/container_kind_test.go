package serializer

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A container in world state says what it is: a chest or a drop pile. One
// built without a kind is a chest. FS-4R9M9 §Requirements 55.
func TestSerializeBackendState_ContainersCarryTheirKind(t *testing.T) {
	tests := []struct {
		name      string
		container *components.ContainerComponent
		want      string
	}{
		{"chest", components.NewContainerComponent(uuid.New()), "chest"},
		{"drop pile", &components.ContainerComponent{ContainerID: uuid.New(), Kind: components.ContainerKindDropPile}, "drop_pile"},
		{"no kind", &components.ContainerComponent{ContainerID: uuid.New()}, "chest"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			e := em.CreateEntity()
			e.AddComponent(tt.container)
			e.AddComponent(components.NewTransformComponent(20, 20))
			e.AddComponent(components.NewItemIDListComponent(nil))

			state, err := NewStateSerializer(em).SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
			require.NoError(t, err)

			require.Len(t, state.Containers, 1)
			raw, err := json.Marshal(state.Containers[0])
			require.NoError(t, err)
			assert.Contains(t, string(raw), `"kind":"`+tt.want+`"`)
		})
	}
}
