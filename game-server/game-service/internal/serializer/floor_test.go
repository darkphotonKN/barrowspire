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

// A run broadcast says which floor the party is on and never how many there
// are: the height is the server's. The hub has no floors and says nothing
// about them. FS-F6F88 §Requirements 26, FS-M8CSE §A R5.
func TestFormatStateToClientState_CarriesFloorOnlyInARun(t *testing.T) {
	tests := []struct {
		name      string
		world     types.WorldType
		withFloor bool
		wantFloor int
	}{
		{"a run on its first floor", types.WorldTypeRun, true, 1},
		{"the hub has no floors", types.WorldTypeHub, false, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			if tt.withFloor {
				runLevel := em.CreateEntity()
				runLevel.AddComponent(components.NewFloorComponent(1, 3))
			}
			s := NewStateSerializer(em, nil)

			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), tt.world, em.GetAllEntities())
			require.NoError(t, err)
			clientState := s.FormatStateToClientState(backendState, uuid.New())

			assert.Equal(t, tt.wantFloor, clientState.Floor)

			wire := wireKeys(t, clientState)
			_, hasFloor := wire["floor"]
			_, hasStairs := wire["stairs"]
			assert.Equal(t, tt.withFloor, hasFloor, "floor on the wire")
			assert.Equal(t, tt.withFloor, hasStairs, "stairs on the wire")
			assert.NotContains(t, wire, "floor_count", "the height never leaves the server")
		})
	}
}

// The client reads an empty stairs list as the top floor, so every run state
// must hold a non-nil list however its frame came to be: a nil one drops the
// key and the top-floor card shows the wrong line. FS-M8CSE §B R8.
func TestFormatStateToClientState_TopFloorIsAnEmptyStairsListInEveryRunState(t *testing.T) {
	topFloor := func(t *testing.T) (*StateSerializer, *types.BackendGameState) {
		t.Helper()
		em := ecs.NewEntityManager()
		em.CreateEntity().AddComponent(components.NewFloorComponent(3, 3))
		s := NewStateSerializer(em, nil)
		backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
		require.NoError(t, err)
		return s, backendState
	}

	tests := []struct {
		name    string
		prepare func(t *testing.T) (*StateSerializer, *types.BackendGameState)
	}{
		{"a freshly serialized frame", topFloor},
		{"a dungeon floor's frame", func(t *testing.T) (*StateSerializer, *types.BackendGameState) {
			s, backendState := topFloor(t)
			backendState.CellSize = 32
			return s, backendState
		}},
		{"a frame reset for reuse", func(t *testing.T) (*StateSerializer, *types.BackendGameState) {
			s, backendState := topFloor(t)
			s.RestBackendStatePool(backendState)
			return s, backendState
		}},
		{"a backend state that never had a list", func(t *testing.T) (*StateSerializer, *types.BackendGameState) {
			s, backendState := topFloor(t)
			backendState.Stairs = nil
			return s, backendState
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, backendState := tt.prepare(t)

			clientState := s.FormatStateToClientState(backendState, uuid.New())

			require.NotNil(t, clientState.Stairs, "a nil pointer omits the key")
			assert.Empty(t, *clientState.Stairs)

			wire := wireKeys(t, clientState)
			stairs, hasStairs := wire["stairs"]
			require.True(t, hasStairs, "the top floor still says where its stairs are")
			list, isList := stairs.([]any)
			require.True(t, isList, "stairs is a list, never null: %v", stairs)
			assert.Empty(t, list)
			assert.NotContains(t, wire, "floor_count", "the height never leaves the server")
		})
	}
}

func wireKeys(t *testing.T, state *types.ClientGameState) map[string]any {
	t.Helper()
	raw, err := json.Marshal(state)
	require.NoError(t, err)
	var wire map[string]any
	require.NoError(t, json.Unmarshal(raw, &wire))
	return wire
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

	s := NewStateSerializer(em, nil)
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

	s := NewStateSerializer(em, nil)
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
