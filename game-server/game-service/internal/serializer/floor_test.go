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

// A run broadcast says which floor the party is on and how many there are; the
// hub has no floors and says nothing about them. FS-F6F88 §Requirements 26.
func TestFormatStateToClientState_CarriesFloorOnlyInARun(t *testing.T) {
	tests := []struct {
		name           string
		world          types.WorldType
		withFloor      bool
		wantFloor      int
		wantFloorCount int
	}{
		{"a run on its first floor", types.WorldTypeRun, true, 1, 3},
		{"the hub has no floors", types.WorldTypeHub, false, 0, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			if tt.withFloor {
				runLevel := em.CreateEntity()
				runLevel.AddComponent(components.NewFloorComponent(1, 3))
			}
			s := NewStateSerializer(em)

			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), tt.world, em.GetAllEntities())
			require.NoError(t, err)
			clientState := s.FormatStateToClientState(backendState, uuid.New())

			assert.Equal(t, tt.wantFloor, clientState.Floor)
			assert.Equal(t, tt.wantFloorCount, clientState.FloorCount)

			raw, err := json.Marshal(clientState)
			require.NoError(t, err)
			var wire map[string]any
			require.NoError(t, json.Unmarshal(raw, &wire))

			_, hasFloor := wire["floor"]
			_, hasFloorCount := wire["floor_count"]
			assert.Equal(t, tt.withFloor, hasFloor, "floor on the wire")
			assert.Equal(t, tt.withFloor, hasFloorCount, "floor_count on the wire")
		})
	}
}

// A dead delver's body stays on the floor the party left: once they have been
// left behind, no later broadcast shows them. FS-F6F88 §Requirements 15.
func TestSerializeBackendState_LeavesOutDelversLeftBehind(t *testing.T) {
	em := ecs.NewEntityManager()
	present, leftBehind := uuid.New(), uuid.New()

	for _, d := range []struct {
		id         uuid.UUID
		leftBehind bool
	}{{present, false}, {leftBehind, true}} {
		e := em.CreateEntity()
		player := components.NewPlayerComponent(d.id, "mage", "delver", false)
		player.LeftBehind = d.leftBehind
		e.AddComponent(player)
		e.AddComponent(components.NewTransformComponent(100, 100))
		e.AddComponent(components.NewVelocityComponent(0, 0, 200))
		e.AddComponent(components.NewItemIDListComponent(nil))
	}

	s := NewStateSerializer(em)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)

	assert.Contains(t, backendState.Players, present)
	assert.NotContains(t, backendState.Players, leftBehind)
	assert.Zero(t, backendState.EscapedCount, "being left behind is not escaping")
}

// Being left behind hides the BODY from everyone else, not the delver from
// themselves: the dead delver still receives their own state, dead, so the
// client plays the death path rather than the escape path. FS-F6F88
// §Requirements 15.
func TestFormatStateToClientState_DelverLeftBehindStillSeesThemselves(t *testing.T) {
	em := ecs.NewEntityManager()
	present, leftBehind := uuid.New(), uuid.New()

	for _, d := range []struct {
		id         uuid.UUID
		leftBehind bool
	}{{present, false}, {leftBehind, true}} {
		e := em.CreateEntity()
		player := components.NewPlayerComponent(d.id, "mage", "delver", false)
		player.LeftBehind = d.leftBehind
		e.AddComponent(player)
		e.AddComponent(components.NewTransformComponent(100, 100))
		e.AddComponent(components.NewVelocityComponent(0, 0, 200))
		e.AddComponent(components.NewItemIDListComponent(nil))
		health := components.NewHealthComponent(100, 100)
		if d.leftBehind {
			health.CurrentHealth, health.IsEliminated = 0, true
		}
		e.AddComponent(health)
	}

	s := NewStateSerializer(em)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)

	own := s.FormatStateToClientState(backendState, leftBehind)
	require.NotNil(t, own.CurrentPlayer, "the dead delver lost their own state")
	assert.Equal(t, leftBehind, own.CurrentPlayer.ID)
	assert.Zero(t, own.CurrentPlayer.CurrentHealth, "seen as dead")
	assert.False(t, own.CurrentPlayer.Escape, "not as escaped")

	others := s.FormatStateToClientState(backendState, present)
	for _, other := range others.OtherPlayers {
		assert.NotEqual(t, leftBehind, other.ID, "another delver sees the body left behind")
	}
}
