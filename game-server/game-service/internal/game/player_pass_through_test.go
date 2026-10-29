package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// bodyAt is where the player's body stands in this world.
func bodyAt(t *testing.T, s *Session, entityID uuid.UUID) *components.TransformComponent {
	t.Helper()

	entity, ok := s.EntityManager.GetEntity(entityID)
	require.True(t, ok)
	comp, ok := entity.GetComponent(ecs.ComponentTypeTransform)
	require.True(t, ok)

	return comp.(*components.TransformComponent)
}

// Whether two players push each other is the world's rule, chosen from its
// type: never in the hub or a field, always in a run. Two players seated on
// one spot stay overlapping in a shared world and are pushed apart in a run.
// FS-0XMCP §Requirements 26, 27, 29.
func TestSession_PlayersPassThroughByWorldType(t *testing.T) {
	tests := []struct {
		name        string
		bounds      WorldBounds
		passThrough bool
	}{
		{"hub", HubBounds(), true},
		{"field", FieldBounds(GentleMeadows()), true},
		{"run", RunBounds(), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// not started, no map: the test is the only thing ticking this world
			s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, tt.bounds)
			character := types.CharacterInPlay{Name: "Wren", Class: "warrior"}
			// one px apart: an exact overlap has no direction to push along
			a := s.AddPlayerAt(uuid.New(), character, "", 400, 300)
			b := s.AddPlayerAt(uuid.New(), character, "", 401, 300)

			tick(s)

			pa, pb := bodyAt(t, s, a), bodyAt(t, s, b)
			gap := math.Hypot(pa.X-pb.X, pa.Y-pb.Y)
			if tt.passThrough {
				assert.InDelta(t, 1.0, gap, 0.001, "the players pushed each other")
			} else {
				assert.InDelta(t, 2*constants.PlayerRadius, gap, 0.001, "the players did not body-block")
			}
		})
	}
}
