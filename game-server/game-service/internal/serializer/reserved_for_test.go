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

// A field pile inside its killer-first window carries reserved_for, the
// killer's member id; an open pile, a run's pile and a chest carry no such
// key. FS-X2F2H §Requirements 35.
func TestSerializeBackendState_PileCarriesReservedForOnlyWhileReserved(t *testing.T) {
	killer := uuid.New()
	tests := []struct {
		name      string
		container *components.ContainerComponent
		want      string // "" for no key at all
	}{
		{"reserved field pile", &components.ContainerComponent{ContainerID: uuid.New(), Kind: components.ContainerKindDropPile, ReservedFor: killer}, killer.String()},
		{"open pile", &components.ContainerComponent{ContainerID: uuid.New(), Kind: components.ContainerKindDropPile}, ""},
		{"chest", components.NewContainerComponent(uuid.New()), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			e := em.CreateEntity()
			e.AddComponent(tt.container)
			e.AddComponent(components.NewTransformComponent(20, 20))
			e.AddComponent(components.NewItemIDListComponent(nil))

			state, err := NewStateSerializer(em).SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeField, em.GetAllEntities())
			require.NoError(t, err)

			require.Len(t, state.Containers, 1)
			raw, err := json.Marshal(state.Containers[0])
			require.NoError(t, err)
			if tt.want == "" {
				assert.NotContains(t, string(raw), "reserved_for")
				return
			}
			assert.Contains(t, string(raw), `"reserved_for":"`+tt.want+`"`)
		})
	}
}
