package game

import (
	"math"
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// walkFrom is the 4-neighbour walk in cells over d's walkable cells from the
// cell holding p: -1 where unreachable.
func walkFrom(d *dungeonFloor, p point) []int {
	cols, rows := d.layout.Cols, d.layout.Rows
	dist := make([]int, len(d.region))
	for i := range dist {
		dist[i] = -1
	}
	c := d.cellOf(p)
	from := c.Y*cols + c.X
	dist[from] = 0
	queue := []int{from}
	for i := 0; i < len(queue); i++ {
		x, y := queue[i]%cols, queue[i]/cols
		for _, n := range [][2]int{{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}} {
			if n[0] < 0 || n[1] < 0 || n[0] >= cols || n[1] >= rows {
				continue
			}
			ni := n[1]*cols + n[0]
			if d.region[ni] != 0 && dist[ni] < 0 {
				dist[ni] = dist[queue[i]] + 1
				queue = append(queue, ni)
			}
		}
	}
	return dist
}

// newMonsters is the monsters in s not among before.
func newMonsters(s *Session, before []*ecs.Entity) []*ecs.Entity {
	var out []*ecs.Entity
	for _, m := range monstersInWorld(s.EntityManager) {
		if !slices.ContainsFunc(before, func(b *ecs.Entity) bool { return b.ID == m.ID }) {
			out = append(out, m)
		}
	}
	return out
}

// FS-5FZ4J §B R14, §C R16: a lever's first in-turn pull wakes one ambush, a
// pack of 2-4 of the floor's pool (at most one brute, the rest fodder) at its
// monster level, in the nearest room by walk to the lever that is not the
// lever's own, the start or the stairs room, every one at least
// MonsterDelverExclusion from the delver and hunting the puller. Pulled again
// after a reset, that lever wakes nothing.
func TestAmbush_FirstInTurnPullWakesOnePack_ASecondWakesNothing(t *testing.T) {
	for _, seed := range []uint64{3, 7, 11, 19} {
		s, player, _ := sealedRun(t, seed, forcedSeal(components.SealLeverOrder))
		d := s.dungeon
		levers := leversInTurn(t, s)
		lever := levers[0]
		before := monstersInWorld(s.EntityManager)

		pull(t, s, player, lever)

		pack := newMonsters(s, before)
		require.GreaterOrEqual(t, len(pack), AmbushSizeMin, "seed %d", seed)
		require.LessOrEqual(t, len(pack), AmbushSizeMax, "seed %d", seed)

		at := transformOf(t, lever)
		leverRoom := d.roomAt(at.X, at.Y)
		body := transformOf(t, delverEntity(t, s, player))
		room := -1
		brutes := 0
		for _, m := range pack {
			mt := transformOf(t, m)
			r := d.roomAt(mt.X, mt.Y)
			if room == -1 {
				room = r
			}
			assert.Equal(t, room, r, "seed %d: one room", seed)
			assert.GreaterOrEqual(t, math.Hypot(mt.X-body.X, mt.Y-body.Y), MonsterDelverExclusion, "seed %d", seed)
			mc := monsterOf(m)
			assert.Equal(t, delverEntity(t, s, player).ID, mc.LastAttacker, "seed %d: it hunts the puller", seed)
			entry, ok := variantOf(mc.Archetype)
			require.True(t, ok)
			assert.True(t, slices.ContainsFunc(s.floorPool.Members, func(e rosterEntry) bool { return e.Variant.Archetype == mc.Archetype }),
				"seed %d: of the floor's pool", seed)
			switch entry.Family.Role {
			case roleBrute:
				brutes++
			case roleFodder:
			default:
				assert.Fail(t, "a pack is a brute and fodder", "seed %d: %s", seed, entry.Family.Role)
			}
		}
		assert.LessOrEqual(t, brutes, 1, "seed %d: at most one brute", seed)

		// the nearest qualifying room by walk from the lever
		dist := walkFrom(d, point{at.X, at.Y})
		nearest, best := -1, math.MaxInt
		for r := range d.layout.Rooms {
			if r == leverRoom || r == d.layout.Roles.Start || r == d.layout.Roles.Stairs {
				continue
			}
			c := d.layout.Rooms[r].Rect
			centre := d.cellOf(point{(float64(c.X) + float64(c.W)/2) * d.layout.CellSize, (float64(c.Y) + float64(c.H)/2) * d.layout.CellSize})
			if dd := dist[centre.Y*d.layout.Cols+centre.X]; dd >= 0 && dd < best {
				nearest, best = r, dd
			}
		}
		assert.Equal(t, nearest, room, "seed %d: the nearest room by walk that qualifies", seed)

		tick(s)
		for _, m := range pack {
			assert.Equal(t, delverEntity(t, s, player).ID, monsterOf(m).Target, "seed %d: aggroed", seed)
		}

		// a wrong pull resets the order; lever 1 pulled in turn again wakes nothing
		pull(t, s, player, levers[2])
		awake := monstersInWorld(s.EntityManager)
		pull(t, s, player, lever)
		require.True(t, pieceOf(lever).Active)
		assert.Empty(t, newMonsters(s, awake), "seed %d: a lever wakes one ambush in the floor's life", seed)
	}
}
