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

// provokeFarthest has the delver hit the monster farthest from them and steps
// the world once, so that monster chases them from across the floor. It
// returns that monster.
func provokeFarthest(t *testing.T, s *Session, playerID uuid.UUID) *components.MonsterComponent {
	t.Helper()
	d := delverEntity(t, s, playerID)
	at := transformOf(t, d)

	var farthest *ecs.Entity
	best := -1.0
	for _, m := range monstersInWorld(s.EntityManager) {
		mt := transformOf(t, m)
		if gap := math.Hypot(mt.X-at.X, mt.Y-at.Y); gap > best {
			farthest, best = m, gap
		}
	}
	require.NotNil(t, farthest, "the floor has monsters")
	monster := monsterOf(farthest)
	monster.LastAttacker = d.ID

	s.step(1.0/float64(constants.GameFrameRate), s.EntityManager.GetAllEntities())

	require.Equal(t, d.ID, monster.Target, "the monster took the delver up")
	return monster
}

// On floor 1, a dungeon, a chasing monster searches a path over the floor's
// cells to the delver's cell; on floor 2, a floor of buildings, the AI is
// rebuilt with no grid and chases straight, with no path. FS-KE075 §D R21,
// R26 (owner: floor 1 only).
func TestMonsterNavigation_Floor1PathsFloor2ChasesStraight(t *testing.T) {
	s, ids := dungeonRun(t, 3, 1, 0)
	require.NotNil(t, s.dungeon)

	monster := provokeFarthest(t, s, ids[0])

	require.NotEmpty(t, monster.Route.Cells, "floor 1 paths")
	at := transformOf(t, delverEntity(t, s, ids[0]))
	cell := s.dungeon.layout.CellSize
	delverCell := int(at.Y/cell)*s.dungeon.layout.Cols + int(at.X/cell)
	assert.Equal(t, delverCell, monster.Route.Goal, "searched to the delver's cell")
	assert.Equal(t, delverCell, monster.Route.Cells[len(monster.Route.Cells)-1])

	require.NoError(t, s.regenerateFloor())
	require.Nil(t, s.dungeon)

	monster = provokeFarthest(t, s, ids[0])

	assert.Empty(t, monster.Route.Cells, "floor 2 keeps the straight chase")
}

// A floor 1 that fell back to a floor of buildings has no grid: its monsters
// chase straight. FS-KE075 §B R17.
func TestMonsterNavigation_FallbackFloor1ChasesStraight(t *testing.T) {
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.generateDungeon = (&failingGenerator{}).generate
	s.spawnRand = seededSpawns(3)
	s.InitialSystems()
	id := uuid.New()
	s.AddPlayer(id, types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	s.InitialMapObjects(nil)
	require.Nil(t, s.dungeon)

	monster := provokeFarthest(t, s, id)

	assert.Empty(t, monster.Route.Cells)
}
