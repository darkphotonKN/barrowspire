package serializer

import (
	"context"
	"testing"

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
