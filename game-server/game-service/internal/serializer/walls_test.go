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

// A run's walls travel in its floor map, so its per-tick state carries no walls
// key on any floor; the hub and the fields keep theirs, house id and all.
// FS-KE075 §F Requirement 34, ADR-0060 Decision 2.
func TestFormatStateToClientState_WallsOnlyOutsideARun(t *testing.T) {
	tests := []struct {
		name    string
		world   types.WorldType
		wantKey bool
	}{
		{"a run", types.WorldTypeRun, false},
		{"the hub", types.WorldTypeHub, true},
		{"a field", types.WorldTypeField, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			houseID := uuid.New()
			wall := em.CreateEntity()
			wall.AddComponent(components.NewWallComponent(houseID, uuid.New(), 200, 10))
			wall.AddComponent(components.NewTransformComponent(100, 40))
			s := NewStateSerializer(em, nil)

			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), tt.world, em.GetAllEntities())
			require.NoError(t, err)
			raw, err := json.Marshal(s.FormatStateToClientState(backendState, uuid.New()))
			require.NoError(t, err)
			var wire map[string]any
			require.NoError(t, json.Unmarshal(raw, &wire))

			walls, hasWalls := wire["walls"]
			require.Equal(t, tt.wantKey, hasWalls, "walls on the wire")
			if !tt.wantKey {
				return
			}
			assert.Equal(t, []any{map[string]any{
				"house_id":  houseID.String(),
				"entity_id": wall.ID.String(),
				"position":  map[string]any{"x": 100.0, "y": 40.0},
				"width":     200.0,
				"height":    10.0,
			}}, walls)
		})
	}
}

// A hub with no walls still says so: the key stays, an empty list, as today.
func TestFormatStateToClientState_HubWithNoWallsKeepsTheKey(t *testing.T) {
	em := ecs.NewEntityManager()
	s := NewStateSerializer(em, nil)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeHub, em.GetAllEntities())
	require.NoError(t, err)
	raw, err := json.Marshal(s.FormatStateToClientState(backendState, uuid.New()))
	require.NoError(t, err)
	var wire map[string]any
	require.NoError(t, json.Unmarshal(raw, &wire))

	assert.Equal(t, []any{}, wire["walls"])
}
