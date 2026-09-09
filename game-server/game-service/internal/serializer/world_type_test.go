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

// The client is told which world it is in rather than inferring it from the
// shape of the broadcast. FS-0008 §Requirements 18.
func TestFormatStateToClientState_CarriesTheWorldType(t *testing.T) {
	tests := []struct {
		name  string
		world types.WorldType
	}{
		{"hub", types.WorldTypeHub},
		{"run", types.WorldTypeRun},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			s := NewStateSerializer(em)
			sessionID := uuid.New()

			backendState, err := s.SerializeBackendState(context.Background(), sessionID, tt.world, em.GetAllEntities())
			require.NoError(t, err)

			clientState := s.FormatStateToClientState(backendState, uuid.New())

			assert.Equal(t, tt.world, clientState.WorldType)
			assert.Equal(t, sessionID, clientState.SessionID,
				"session id stays; the world type is what was missing")
		})
	}
}

// A delver cannot talk to someone they cannot see. The hub's residents ride in
// the broadcast alongside players — the ambient ones in I-0052 will move, so one
// list covers both rather than a static delivery plus a moving one.
// FS-0008 §Requirements 9.
func TestSerializeBackendState_CarriesNPCs(t *testing.T) {
	em := ecs.NewEntityManager()

	npc := em.CreateEntity()
	npc.AddComponent(components.NewNPCComponent("Spirewarden", components.NPCFunctionDelve))
	npc.AddComponent(components.NewTransformComponent(300, 400))

	s := NewStateSerializer(em)

	backendState, err := s.SerializeBackendState(
		context.Background(), uuid.New(), types.WorldTypeHub, em.GetAllEntities(),
	)
	require.NoError(t, err)

	clientState := s.FormatStateToClientState(backendState, uuid.New())

	require.Len(t, clientState.NPCs, 1)
	assert.Equal(t, "Spirewarden", clientState.NPCs[0].Name)
	assert.Equal(t, string(components.NPCFunctionDelve), clientState.NPCs[0].Function)
	assert.Equal(t, 300.0, clientState.NPCs[0].Position.X)
	assert.Equal(t, 400.0, clientState.NPCs[0].Position.Y)
}
