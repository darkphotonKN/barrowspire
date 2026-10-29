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

// The hub tells its clients where its gates are, so the client never carries a
// drifting copy; where a returning player is set down stays on the server. A
// run has no gates and no key for them. FS-0XMCP §Requirements 6.
func TestFormatStateToClientState_CarriesGatesOnlyInTheHub(t *testing.T) {
	tests := []struct {
		name    string
		world   types.WorldType
		wantKey bool
	}{
		{"the hub", types.WorldTypeHub, true},
		{"a run", types.WorldTypeRun, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			var gateID uuid.UUID
			if tt.wantKey {
				gate := em.CreateEntity()
				gate.AddComponent(components.NewGateComponent(components.GateDestinationForest, &components.GateArrival{X: 180, Y: 400}))
				gate.AddComponent(components.NewTransformComponent(40, 400))
				gate.AddComponent(components.NewInteractableComponent(80))
				gateID = gate.ID
			}
			s := NewStateSerializer(em)

			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), tt.world, em.GetAllEntities())
			require.NoError(t, err)
			clientState := s.FormatStateToClientState(backendState, uuid.New())

			raw, err := json.Marshal(clientState)
			require.NoError(t, err)
			var wire map[string]any
			require.NoError(t, json.Unmarshal(raw, &wire))

			gates, hasGates := wire["gates"]
			require.Equal(t, tt.wantKey, hasGates, "gates on the wire")
			if !tt.wantKey {
				return
			}

			list, ok := gates.([]any)
			require.True(t, ok, "gates is a list: %v", gates)
			require.Len(t, list, 1)
			assert.Equal(t, map[string]any{
				"entity_id":   gateID.String(),
				"destination": "forest",
				"position":    map[string]any{"x": 40.0, "y": 400.0},
				"range":       80.0,
			}, list[0], "exactly the four fields; the arrival point never leaves the server")
		})
	}
}
