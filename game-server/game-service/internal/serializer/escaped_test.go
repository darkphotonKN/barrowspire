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

// seatEscapeRun puts two delvers in a run, one still playing and one escaped,
// the escaped one carrying a class resource.
func seatEscapeRun(em *ecs.EntityManager, playing, escaped uuid.UUID) {
	for _, d := range []struct {
		id      uuid.UUID
		escaped bool
	}{{playing, false}, {escaped, true}} {
		e := em.CreateEntity()
		e.AddComponent(components.NewPlayerComponent(d.id, "warrior", "delver", d.escaped))
		e.AddComponent(components.NewTransformComponent(100, 100))
		e.AddComponent(components.NewVelocityComponent(0, 0, 200))
		e.AddComponent(components.NewItemIDListComponent(nil))
		e.AddComponent(components.NewHealthComponent(100, 100))
		if d.escaped {
			e.AddComponent(components.NewResourceComponent(components.ResourceStamina, 40, 100, 20))
		}
	}
}

// An escaped delver keeps receiving their own state, escaped, so their client
// knows it resolved; the delver still playing never sees them and counts them
// as escaped once. FS-QPDKN §Requirements 24.
func TestFormatStateToClientState_EscapedDelverStillSeesThemselves(t *testing.T) {
	em := ecs.NewEntityManager()
	playing, escaped := uuid.New(), uuid.New()
	seatEscapeRun(em, playing, escaped)

	s := NewStateSerializer(em, nil)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)

	own := s.FormatStateToClientState(backendState, escaped)
	require.NotNil(t, own.CurrentPlayer, "the escaped delver lost their own state")
	assert.Equal(t, escaped, own.CurrentPlayer.ID)
	assert.True(t, own.CurrentPlayer.Escape, "seen as escaped")
	require.NotNil(t, own.CurrentPlayer.Resource, "their resource rides their own frame")
	assert.Equal(t, 40, own.CurrentPlayer.Resource.Current)
	assert.Equal(t, 1, own.EscapedCount)

	others := s.FormatStateToClientState(backendState, playing)
	require.NotNil(t, others.CurrentPlayer)
	assert.Equal(t, playing, others.CurrentPlayer.ID)
	for _, other := range others.OtherPlayers {
		assert.NotEqual(t, escaped, other.ID, "another delver sees the escaped one")
	}
	assert.Equal(t, 1, others.EscapedCount, "the escaped delver is counted once")
}

// The pooled backend state forgets who escaped when it is reset, so a later
// broadcast never shows a delver from an earlier world. FS-QPDKN
// §Requirements 24.
func TestRestBackendStatePool_ForgetsEscapedDelvers(t *testing.T) {
	em := ecs.NewEntityManager()
	playing, escaped := uuid.New(), uuid.New()
	seatEscapeRun(em, playing, escaped)

	s := NewStateSerializer(em, nil)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)

	s.RestBackendStatePool(backendState)

	assert.Nil(t, s.FormatStateToClientState(backendState, escaped).CurrentPlayer)
	assert.Zero(t, backendState.EscapedCount)
}
