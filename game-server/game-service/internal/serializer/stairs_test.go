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

// A run broadcast carries the floor's stairs every tick, an empty list on the
// top floor; the hub has no stairs and no key for them. FS-F6F88 §Requirements 27.
func TestFormatStateToClientState_CarriesStairsOnlyInARun(t *testing.T) {
	tests := []struct {
		name       string
		world      types.WorldType
		withStairs bool
		wantKey    bool
	}{
		{"a run below the top", types.WorldTypeRun, true, true},
		{"a run on the top floor", types.WorldTypeRun, false, true},
		{"the hub", types.WorldTypeHub, false, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			var stairsID uuid.UUID
			if tt.withStairs {
				stairs := em.CreateEntity()
				stairs.AddComponent(components.NewStairsComponent())
				stairs.AddComponent(components.NewTransformComponent(300, 400))
				stairsID = stairs.ID
			}
			s := NewStateSerializer(em)

			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), tt.world, em.GetAllEntities())
			require.NoError(t, err)
			clientState := s.FormatStateToClientState(backendState, uuid.New())

			raw, err := json.Marshal(clientState)
			require.NoError(t, err)
			var wire map[string]any
			require.NoError(t, json.Unmarshal(raw, &wire))

			stairs, hasStairs := wire["stairs"]
			require.Equal(t, tt.wantKey, hasStairs, "stairs on the wire")
			if !tt.wantKey {
				return
			}

			list, ok := stairs.([]any)
			require.True(t, ok, "stairs is a list, never null: %v", stairs)
			if !tt.withStairs {
				assert.Empty(t, list)
				return
			}
			require.Len(t, list, 1)
			assert.Equal(t, map[string]any{
				"entity_id": stairsID.String(),
				"position":  map[string]any{"x": 300.0, "y": 400.0},
			}, list[0])
		})
	}
}
