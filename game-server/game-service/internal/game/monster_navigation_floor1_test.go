package game

import (
	"math"
	"sort"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// On generated floor 1 layouts, the monsters farthest from a delver, rooms and
// corridors away, all reach them by path: no body snags on a wall corner of a
// real layout. The longest of these paths is about 90 cells, some 7 400 px, a
// troll's 80 s at 90 px/s; three minutes cover it. FS-KE075 §D R23, ADR-0062.
func TestMonsterNavigation_Floor1_FarthestMonstersReachTheDelver(t *testing.T) {
	for _, seed := range []uint64{1, 2, 3, 4, 5, 6} {
		s, ids := dungeonRun(t, seed, 1, 0)
		require.NotNil(t, s.dungeon)
		assertFarthestMonstersReach(t, s, ids[0], seed)
	}
}

// A climbed floor's AI paths over that floor's own grid: its farthest monsters,
// behind its walls, reach the delver. FS-M8CSE §C Requirement 14.
func TestMonsterNavigation_Floor2_FarthestMonstersReachTheDelver(t *testing.T) {
	for _, seed := range []uint64{1, 2, 3} {
		s, ids := dungeonRun(t, seed, 1, 0)
		require.NoError(t, s.regenerateFloor())
		require.NotNil(t, s.dungeon, "seed %d: floor 2 is a dungeon", seed)
		assertFarthestMonstersReach(t, s, ids[0], seed)
	}
}

// assertFarthestMonstersReach walks the five monsters farthest from a delver of
// s for three minutes, each kept on the delver, and checks every one reached
// it.
func assertFarthestMonstersReach(t *testing.T, s *Session, delver uuid.UUID, seed uint64) {
	t.Helper()
	const far = 5
	d := delverEntity(t, s, delver)
	at := transformOf(t, d)

	monsters := monstersInWorld(s.EntityManager)
	require.Greater(t, len(monsters), far)
	gap := func(m *ecs.Entity) float64 {
		mt := transformOf(t, m)
		return math.Hypot(mt.X-at.X, mt.Y-at.Y)
	}
	sort.Slice(monsters, func(i, j int) bool { return gap(monsters[i]) > gap(monsters[j]) })
	for _, m := range monsters[far:] {
		s.EntityManager.RemoveEntity(m.ID)
	}
	chasers := monsters[:far]
	closest := make([]float64, far)
	for i, m := range chasers {
		closest[i] = gap(m)
	}

	dt := 1.0 / float64(constants.GameFrameRate)
	for range 180 * constants.GameFrameRate {
		keepStanding(s.EntityManager)
		for _, m := range chasers {
			// the leash never lets a monster this far off keep a target,
			// so each is hit again every tick
			monsterOf(m).LastAttacker = d.ID
		}
		s.step(dt, s.EntityManager.GetAllEntities())
		for i, m := range chasers {
			closest[i] = min(closest[i], gap(m))
		}
	}

	for i := range chasers {
		// five bodies of 40 px crowd round one delver: within a few bodies
		assert.LessOrEqual(t, closest[i], 4*2*constants.PlayerRadius, "seed %d: monster %d never reached the delver", seed, i)
	}
}
