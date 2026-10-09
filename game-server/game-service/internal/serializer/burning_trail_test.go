package serializer

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A run's broadcast lists every live burning trail: its id, the path's end
// points, how far either side it reaches and the seconds it still burns.
// FS-4R9M9 §Requirements 56.
func TestFormatStateToClientState_CarriesBurningTrails(t *testing.T) {
	em := ecs.NewEntityManager()
	trail := em.CreateEntity()
	trail.AddComponent(&components.BurningTrailComponent{
		FromX: 100, FromY: 120, ToX: 280, ToY: 120, HalfWidth: 30, Remaining: 2.5,
	})
	s := NewStateSerializer(em)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	wire := wireOf(t, s.FormatStateToClientState(backendState, uuid.New()))

	trails, ok := wire["trails"].([]any)
	require.True(t, ok, "trails is on the wire as a list")
	require.Len(t, trails, 1)
	assert.Equal(t, map[string]any{
		"entity_id":  trail.ID.String(),
		"from":       map[string]any{"x": 100.0, "y": 120.0},
		"to":         map[string]any{"x": 280.0, "y": 120.0},
		"half_width": 30.0,
		"remaining":  2.5,
	}, trails[0])
}

// With no trail burning, the key is absent, as it always is in the hub.
func TestFormatStateToClientState_NoTrailsOmitsTheKey(t *testing.T) {
	em := ecs.NewEntityManager()
	s := NewStateSerializer(em)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeHub, em.GetAllEntities())
	require.NoError(t, err)
	wire := wireOf(t, s.FormatStateToClientState(backendState, uuid.New()))

	_, present := wire["trails"]
	assert.False(t, present)
}

// A pooled state never carries a previous tick's trails.
func TestSerializeBackendState_TrailsDoNotOutliveTheirTick(t *testing.T) {
	em := ecs.NewEntityManager()
	trail := em.CreateEntity()
	trail.AddComponent(&components.BurningTrailComponent{ToX: 180, HalfWidth: 30, Remaining: 1})
	s := NewStateSerializer(em)

	first, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	require.Len(t, first.Trails, 1)
	s.PutBackendState(first)
	em.RemoveEntity(trail.ID)

	second, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	assert.Empty(t, second.Trails)
}
