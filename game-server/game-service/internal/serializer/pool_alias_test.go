package serializer

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// aFloorOfEverything is a run floor holding one of every list a snapshot
// carries, its delver at the origin and everything within 1600 px of them.
func aFloorOfEverything(cellSize float64, delver uuid.UUID) *ecs.EntityManager {
	em := ecs.NewEntityManager()
	onFloor(em, 1, cellSize)
	addDelver(em, delver, 0, 0, 100)
	addDelver(em, uuid.New(), 100, 100, 100)
	for i := range 4 {
		addMonster(em, "Troll", float64(100+i*10), 200, 207, 207)
		addContainer(em, components.ContainerKindChest, float64(100+i*10), 300, false)
	}
	addFixedInteractables(em, 400, 400)

	trail := em.CreateEntity()
	trail.AddComponent(&components.BurningTrailComponent{ToX: 50, ToY: 50, HalfWidth: 10, Remaining: 1})
	shot := em.CreateEntity()
	shot.AddComponent(&components.ProjectileComponent{ProjectileType: "fireball"})
	shot.AddComponent(components.NewTransformComponent(10, 10))
	shot.AddComponent(components.NewVelocityComponent(1, 0, 300))
	return em
}

// A sent state is read by its connection's writer after the broadcast has put
// the backend state back in the pool, so nothing it carries may share memory
// with the pool: the next tick's reset and refill must leave it as it was.
// Under -race the writer's reads and the next tick's writes are checked
// directly. FS-KE075 §G R38, ADR-0060 Decision 6; FS-QG1HR D2 race B.
func TestFormatStateToClientState_SentStateSurvivesTheNextTicksPoolReset(t *testing.T) {
	tests := []struct {
		name     string
		cellSize float64
	}{
		{"a dungeon floor, cut", 80},
		{"a floor of buildings, uncut", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			me := uuid.New()
			first := aFloorOfEverything(tt.cellSize, me)
			s := NewStateSerializer(first, nil)
			ctx, sessionID := context.Background(), uuid.New()

			backendState, err := s.SerializeBackendState(ctx, sessionID, types.WorldTypeRun, first.GetAllEntities())
			require.NoError(t, err)
			sent := s.FormatStateToClientState(backendState, me)
			want, err := json.Marshal(sent)
			require.NoError(t, err)
			s.PutBackendState(backendState)

			// the connection's writer encodes the frame while the loop goes on
			var writer sync.WaitGroup
			writer.Add(1)
			go func() {
				defer writer.Done()
				for range 50 {
					_, _ = json.Marshal(sent)
				}
			}()

			// the next ticks: as many of each list, every entity a new one
			for range 50 {
				next := aFloorOfEverything(tt.cellSize, me)
				state, err := s.SerializeBackendState(ctx, sessionID, types.WorldTypeRun, next.GetAllEntities())
				require.NoError(t, err)
				s.PutBackendState(state)
			}
			writer.Wait()

			got, err := json.Marshal(sent)
			require.NoError(t, err)
			assert.JSONEq(t, string(want), string(got), "the next tick rewrote a frame already sent")
		})
	}
}
