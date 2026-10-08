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

// seatDelver puts a minimal delver of the level and experience in the world.
func seatDelver(em *ecs.EntityManager, memberID uuid.UUID, level, experience int) {
	delver := em.CreateEntity()
	delver.AddComponent(components.NewPlayerComponent(memberID, "warrior", "Wren", false))
	delver.AddComponent(components.NewTransformComponent(10, 10))
	delver.AddComponent(components.NewVelocityComponent(0, 0, 1))
	delver.AddComponent(components.NewItemIDListComponent([]uuid.UUID{}))
	stats := components.NewStatsComponent(8, 4, 9, 2)
	stats.Level = level
	stats.Experience = experience
	delver.AddComponent(stats)
}

// The world state a client receives carries its own player's level,
// experience, level floor and next-level threshold, the threshold absent at
// the cap. FS-BDA7X §Requirements 21.
func TestFormatStateToClientState_CarriesTheOwnPlayersProgression(t *testing.T) {
	tests := []struct {
		name          string
		level         int
		experience    int
		wantFloor     float64
		wantNext      float64
		wantNextOnCap bool
	}{
		{"a fresh character", 1, 0, 0, 100, true},
		{"part way through level 5", 5, 640, 600, 870, true},
		{"at the cap, experience still accumulating", 20, 40000, 38530, 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			memberID := uuid.New()
			seatDelver(em, memberID, tt.level, tt.experience)
			s := NewStateSerializer(em)

			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
			require.NoError(t, err)

			raw, err := json.Marshal(s.FormatStateToClientState(backendState, memberID))
			require.NoError(t, err)
			var wire struct {
				CurrentPlayer map[string]any `json:"current_player"`
			}
			require.NoError(t, json.Unmarshal(raw, &wire))
			me := wire.CurrentPlayer
			require.NotNil(t, me)

			assert.Equal(t, float64(tt.level), me["level"])
			assert.Equal(t, float64(tt.experience), me["experience"])
			assert.Equal(t, tt.wantFloor, me["level_floor"])

			next, hasNext := me["next_level_at"]
			require.Equal(t, tt.wantNextOnCap, hasNext, "next_level_at is absent exactly at the cap")
			if hasNext {
				assert.Equal(t, tt.wantNext, next)
			}
		})
	}
}
