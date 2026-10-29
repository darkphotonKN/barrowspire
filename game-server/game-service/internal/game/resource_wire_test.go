package game

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ownResourceOnTheWire is the class resource the recipient's frame carries, as
// the client reads it.
func ownResourceOnTheWire(t *testing.T, s *Session, recipient uuid.UUID) map[string]any {
	t.Helper()

	stateSerializer := serializer.NewStateSerializer(s.EntityManager)
	backendState, err := stateSerializer.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
	require.NoError(t, err)

	raw, err := json.Marshal(stateSerializer.FormatStateToClientState(backendState, recipient))
	require.NoError(t, err)
	var frame struct {
		CurrentPlayer map[string]any `json:"current_player"`
	}
	require.NoError(t, json.Unmarshal(raw, &frame))
	require.NotNil(t, frame.CurrentPlayer)

	resource, ok := frame.CurrentPlayer["resource"].(map[string]any)
	require.True(t, ok, "current_player carries a resource")
	return resource
}

// A seated delver is told their class's resource, full, with their class's
// ability priced in it. FS-8AY7S §Requirements 12, 17.
func TestAddPlayer_SeatsAResourceTheWireCarries(t *testing.T) {
	tests := []struct {
		class string
		want  map[string]any
	}{
		{"warrior", map[string]any{"kind": "stamina", "current": float64(100), "max": float64(100), "ability_cost": float64(25)}},
		{"mage", map[string]any{"kind": "mana", "current": float64(150), "max": float64(150), "ability_cost": float64(15)}},
		{"archer", map[string]any{"kind": "stamina", "current": float64(100), "max": float64(100), "ability_cost": float64(40)}},
		{"mercenary", map[string]any{"kind": "parry_charges", "current": float64(0), "max": float64(3), "ability_cost": float64(0)}},
	}

	for _, tt := range tests {
		t.Run(tt.class, func(t *testing.T) {
			s := unstartedRun(t)
			delver := uuid.New()
			s.AddPlayer(delver, types.CharacterInPlay{Name: "Wren", Class: tt.class, Level: 1}, "")

			assert.Equal(t, tt.want, ownResourceOnTheWire(t, s, delver))
		})
	}
}
