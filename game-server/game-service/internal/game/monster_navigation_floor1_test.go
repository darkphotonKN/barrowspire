package game

import (
	"math"
	"sort"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
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

	for i, m := range chasers {
		// five bodies of 40 px crowd round one delver: within a few bodies; a
		// ranged monster stops where it shoots from (FS-B4SG9 §A R4)
		reach := 4 * 2 * constants.PlayerRadius
		if mc := monsterOf(m); mc.ShotProjectileType != "" {
			reach = max(reach, mc.AttackRange)
		}
		assert.LessOrEqual(t, closest[i], reach, "seed %d: monster %d never reached the delver", seed, i)
	}
}

// On generated floor 1 layouts, a Bone Archer standing in range of a delver
// with rock in its arrow's flight starts no draw there: it walks its path
// until the flight is clear, then stands and shoots, and the arrow lands.
// FS-B4SG9 §A R4, R5; AC "in range with rock between".
func TestMonsterNavigation_Floor1_RangedMonsterBehindRockWalksIntoSightThenShoots(t *testing.T) {
	for _, seed := range []uint64{1, 2, 3, 4, 5, 6} {
		s, ids := dungeonRun(t, seed, 1, 0)
		require.NotNil(t, s.dungeon)
		d := delverEntity(t, s, ids[0])
		target := transformOf(t, d)
		for _, m := range monstersInWorld(s.EntityManager) {
			s.EntityManager.RemoveEntity(m.ID)
		}

		grid := s.dungeon.navGrid()
		sheet := monsterSheets[components.MonsterArchetypeBoneArcher]
		// the start room is open ground: the delver stands at the first cell
		// that has, in the archer's shooting range, a cell with rock in the
		// flight between them, and the archer on the farthest such cell
		var x, y float64
		found := false
		everywhere := math.Hypot(s.mapWidth, s.mapHeight)
		for _, stand := range grid.Within(nil, 0, 0, everywhere) {
			sx, sy := grid.Centre(stand)
			for _, cell := range grid.Within(nil, sx, sy, sheet.AttackRange) {
				if cx, cy := grid.Centre(cell); !grid.Clear(cx, cy, sx, sy, sheet.Shot.Radius) {
					x, y, found = cx, cy, true
				}
			}
			if found {
				target.X, target.Y = sx, sy
				break
			}
		}
		require.True(t, found, "seed %d: no cell is out of sight of another in range", seed)
		sees := func(x, y float64) bool { return grid.Clear(x, y, target.X, target.Y, sheet.Shot.Radius) }

		archer := boneArcher(s, x, y)
		m, at := monsterOf(archer), transformOf(t, archer)
		hc, _ := d.GetComponent(ecs.ComponentTypeHealth)
		health := hc.(*components.HealthComponent)
		draws, hit := 0, false
		dt := 1.0 / float64(constants.GameFrameRate)
		for n := 0; !hit && n < 60*constants.GameFrameRate; n++ {
			keepStanding(s.EntityManager)
			// its walk round may pass the leash: it is hit again every tick
			m.LastAttacker = d.ID
			drawing := m.WindUpRemaining > 0
			s.step(dt, s.EntityManager.GetAllEntities())
			if !drawing && m.WindUpRemaining > 0 {
				draws++
				assert.True(t, sees(at.X, at.Y), "seed %d: drew at (%.0f, %.0f) with rock in the flight", seed, at.X, at.Y)
				assert.LessOrEqual(t, math.Hypot(target.X-at.X, target.Y-at.Y), sheet.AttackRange)
			}
			// topped up before the tick: anything short of full is the arrow
			hit = health.CurrentHealth < health.MaxHealth
		}

		assert.Positive(t, draws, "seed %d: it never drew", seed)
		assert.True(t, hit, "seed %d: no arrow reached the delver", seed)
	}
}
