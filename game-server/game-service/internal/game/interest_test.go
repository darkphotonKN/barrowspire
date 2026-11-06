package game

import (
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stateSender keeps the latest state each recipient was sent.
type stateSender struct {
	orderedSender
	mu     sync.Mutex
	states map[uuid.UUID]*types.ClientGameState
}

func (s *stateSender) SendStateToPlayer(playerID uuid.UUID, state *types.ClientGameState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.states == nil {
		s.states = map[uuid.UUID]*types.ClientGameState{}
	}
	s.states[playerID] = state
	return nil
}

func (s *stateSender) latest(playerID uuid.UUID) *types.ClientGameState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.states[playerID]
}

// A run's broadcast on a dungeon floor cuts each recipient's monsters and
// containers to those near its own body, while the teammate far away is still
// sent; on a floor of buildings everyone is sent everything. FS-KE075 §G
// R36, R39; ADR-0060 Decision 4.
func TestBroadcastFullState_DungeonFloorCutsEachRecipientToItsOwnInterest(t *testing.T) {
	tests := []struct {
		name     string
		cellSize float64
		cut      bool
	}{
		{"a dungeon floor", 80, true},
		{"a floor of buildings", 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newRun(t, &countingItemsClient{})
			west, east := uuid.New(), uuid.New()
			s.AddPlayer(west, types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")
			s.AddPlayer(east, types.CharacterInPlay{Name: "Kaelen", Class: "mage"}, "")
			westBody := bodyAt(t, s, delverEntity(t, s, west).ID)
			westBody.X, westBody.Y = 100, 100
			eastBody := bodyAt(t, s, delverEntity(t, s, east).ID)
			eastBody.X, eastBody.Y = 5600, 3700

			for _, e := range s.EntityManager.GetAllEntities() {
				if fc, ok := e.GetComponent(ecs.ComponentTypeFloor); ok {
					fc.(*components.FloorComponent).CellSize = tt.cellSize
				}
			}
			byWest := s.EntityManager.CreateEntity()
			byWest.AddComponent(&components.MonsterComponent{Archetype: components.MonsterArchetypeGhoul, Name: "Ghoul", Level: 1})
			byWest.AddComponent(components.NewTransformComponent(200, 100))
			byWest.AddComponent(components.NewHealthComponent(40, 40))
			byEast := s.EntityManager.CreateEntity()
			byEast.AddComponent(components.NewContainerComponent(uuid.New()))
			byEast.AddComponent(components.NewTransformComponent(5500, 3700))
			byEast.AddComponent(components.NewItemIDListComponent(nil))

			sender := &stateSender{}
			s.sender = sender
			s.stateSerializer = serializer.NewStateSerializer(s.EntityManager, nil)
			require.NoError(t, s.broadcastFullState(s.EntityManager.GetAllEntities()))

			for _, playerID := range []uuid.UUID{west, east} {
				require.Eventually(t, func() bool { return sender.latest(playerID) != nil }, time.Second, time.Millisecond)
			}
			westState, eastState := sender.latest(west), sender.latest(east)

			assert.Equal(t, true, hasMonster(westState, byWest.ID))
			assert.Equal(t, !tt.cut, hasMonster(eastState, byWest.ID))
			assert.Equal(t, true, hasContainer(eastState, byEast.ID))
			assert.Equal(t, !tt.cut, hasContainer(westState, byEast.ID))

			require.Len(t, westState.OtherPlayers, 1, "the far teammate is always sent")
			assert.Equal(t, east, westState.OtherPlayers[0].ID)
		})
	}
}

func hasMonster(state *types.ClientGameState, id uuid.UUID) bool {
	for _, m := range state.Monsters {
		if m.EntityID == id {
			return true
		}
	}
	return false
}

func hasContainer(state *types.ClientGameState, id uuid.UUID) bool {
	for _, c := range state.Containers {
		if c.EntityID == id {
			return true
		}
	}
	return false
}
