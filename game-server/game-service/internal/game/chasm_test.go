package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// chasmRun is floor 1 of the first seeded run from seed on whose stairs room a
// forced Chasm fits, with delvers delvers and no monster, the delvers' ids and
// the floor's seal.
func chasmRun(t *testing.T, seed uint64, delvers int) (*Session, []uuid.UUID, *ecs.Entity) {
	t.Helper()
	for ; seed < 200; seed++ {
		s, ids := dungeonRun(t, seed, delvers, 0, forcedSeal(components.SealChasm))
		if s.dungeon == nil || s.dungeon.chasm == nil {
			continue
		}
		clearMonsters(s)
		seals := entitiesWith(s, ecs.ComponentTypeSeal)
		require.Len(t, seals, 1, "seed %d: one seal", seed)
		return s, ids, seals[0]
	}
	require.Fail(t, "no seed's stairs room holds a chasm")
	return nil, nil, nil
}

// chasmFrame is the floor's stairs room in the chasm's own terms.
func chasmFrameOfFloor(s *Session) chasmFrame {
	d := s.dungeon
	return chasmFrameOf(d.layout.Rooms[d.layout.Stairs.Room].Rect, d.layout.Stairs.Barrier)
}

// deepOf is how deep cell c lies from the stairs room's doorway wall.
func deepOf(f chasmFrame, c components.Cell) int {
	for v := range f.deep {
		for u := range f.wide {
			if f.cell(u, v) == c {
				return v
			}
		}
	}
	return -1
}

// walkDeep stands the delver on the room's cell (u, v) and walks them away
// from the doorway wall for secs seconds; the cell they end on.
func walkDeep(t *testing.T, s *Session, delver *ecs.Entity, u, v int, secs float64) components.Cell {
	t.Helper()
	f := chasmFrameOfFloor(s)
	standOn(t, s, delver, f.cell(u, v))
	step := f.cell(u, v+1)
	from := f.cell(u, v)
	vc, _ := delver.GetComponent(ecs.ComponentTypeVelocity)
	velocity := vc.(*components.VelocityComponent)
	velocity.VX, velocity.VY = float64(step.X-from.X), float64(step.Y-from.Y)
	passSeconds(s, secs)
	velocity.VX, velocity.VY = 0, 0
	at := transformOf(t, delver)
	return s.dungeon.cellOf(point{at.X, at.Y})
}

// acrossOf is the first place across the stairs room where a cell of r lies.
func acrossOf(s *Session, r levelgen.CellRect) int {
	f := chasmFrameOfFloor(s)
	for u := range f.wide {
		for v := range f.deep {
			if c := f.cell(u, v); c.X >= r.X && c.X < r.X+r.W && c.Y >= r.Y && c.Y < r.Y+r.H {
				return u
			}
		}
	}
	return -1
}

// nearestDeep is how deep r's cell nearest the doorway wall lies.
func nearestDeep(s *Session, r levelgen.CellRect) int {
	f := chasmFrameOfFloor(s)
	return min(deepOf(f, components.Cell{X: r.X, Y: r.Y}), deepOf(f, components.Cell{X: r.X + r.W - 1, Y: r.Y + r.H - 1}))
}

// FS-5FZ4J §E R33, §A R4, §I R46: a Chasm-only floor has no gate; its band of
// pits, two cells thick, crosses the stairs room as shut pit barriers, sent
// whole; a ledge one cell wide runs along a side wall, every other cell of it
// a spike plate; the stairs and the bridge lever stand past the band.
func TestChasm_PitsLedgeAndLever_NoGate(t *testing.T) {
	for _, seed := range []uint64{1, 40, 90} {
		s, ids, _ := chasmRun(t, seed, 1)
		d, g := s.dungeon, s.dungeon.chasm
		f := chasmFrameOfFloor(s)
		assert.Empty(t, barriersOfKind(s, components.BarrierGate), "a Chasm-only floor has no gate")

		pits := barriersOfKind(s, components.BarrierPit)
		var pitCells []components.Cell
		for _, p := range pits {
			assert.False(t, barrierOpen(p), "a pit is shut")
			pitCells = append(pitCells, doorCellsOf(p)...)
		}
		band := cellsOf(g.band)
		// the ledge from the doorway side to the stairs side
		ledge := cellsOf(g.ledge)
		slices.SortFunc(ledge, func(a, b components.Cell) int { return deepOf(f, a) - deepOf(f, b) })
		for _, c := range band {
			assert.Equal(t, !slices.Contains(ledge, c), slices.Contains(pitCells, c), "every band cell off the ledge is a pit: %v", c)
			assert.Equal(t, !slices.Contains(ledge, c), !s.navGrid.Walkable(c.X, c.Y), "pits are rock to monster paths: %v", c)
		}
		assert.Len(t, pitCells, len(band)-ChasmBandCells, "the band less its two ledge cells")
		assert.Len(t, trapsOf(s), trapCount(firstFloor)+len(g.spikes), "seed %d: the ledge's spike plates are on top of the floor's count", seed)
		for i, c := range ledge {
			assert.True(t, s.navGrid.Walkable(c.X, c.Y), "the ledge is walkable")
			trap := trapAt(s, c)
			if i%2 == 1 {
				require.NotNil(t, trap, "seed %d: ledge cell %d holds a spike plate", seed, i)
				assert.Equal(t, components.TrapSpikePlate, trapOf(trap).Kind)
			} else {
				assert.Nil(t, trap, "seed %d: ledge cell %d is bare", seed, i)
			}
		}
		far := nearestDeep(s, g.band) + ChasmBandCells - 1
		stairs := onlyEntity(t, s, ecs.ComponentTypeStairs)
		levers := piecesOfKind(s, components.SealPieceBridgeLever)
		require.Len(t, levers, 1, "one bridge lever")
		for _, e := range []*ecs.Entity{stairs, levers[0]} {
			at := transformOf(t, e)
			assert.Greater(t, deepOf(f, d.cellOf(point{at.X, at.Y})), far, "seed %d: past the band", seed)
		}
		assert.False(t, levers[0].HasComponent(ecs.ComponentTypeAmbush), "the bridge lever wakes no ambush")

		state := runState(t, s, ids[0])
		require.NotNil(t, state.Seal)
		assert.Equal(t, "chasm", state.Seal.Kind)
		pitsSent := 0
		for _, b := range state.Barriers {
			if b.Kind == "pit" {
				pitsSent++
			}
		}
		assert.Equal(t, len(pits), pitsSent, "the pits are always listed")
	}
}

// trapAt is the trap lying on cell, nil with none.
func trapAt(s *Session, cell components.Cell) *ecs.Entity {
	for _, e := range trapsOf(s) {
		if trapOf(e).Cell == cell {
			return e
		}
	}
	return nil
}

// FS-5FZ4J §E R33: a pit blocks a delver walking at it, and the ledge lets
// them along it to the stairs side, over its spike plates, which fire.
func TestChasm_PitsBlockTheLedgeCarries(t *testing.T) {
	s, ids, _ := chasmRun(t, 1, 1)
	g := s.dungeon.chasm
	f := chasmFrameOfFloor(s)
	delver := delverEntity(t, s, ids[0])
	band := nearestDeep(s, g.lane)

	end := walkDeep(t, s, delver, acrossOf(s, s.dungeon.chasm.lane), band-1, 3)
	assert.Less(t, deepOf(f, end), band, "the pits stop the delver short of the band")

	hc := healthComponentOf(delver)
	end = walkLedge(t, s, delver)
	assert.Greater(t, deepOf(f, end), band+1, "the ledge carries the delver past the band")
	assert.NotZero(t, hc.MaxHealth)
	for _, c := range g.spikes {
		assert.False(t, trapOf(trapAt(s, c)).Armed, "a spike plate on the ledge fired")
	}
}

// walkLedge walks the delver along the ledge from its doorway-side cell for 3
// seconds, kept standing; the cell they end on.
func walkLedge(t *testing.T, s *Session, delver *ecs.Entity) components.Cell {
	t.Helper()
	return walkDeep(t, s, delver, acrossOf(s, s.dungeon.chasm.ledge), nearestDeep(s, s.dungeon.chasm.ledge), 3)
}

// FS-5FZ4J §E R33, §D R22: a monster past the chasm paths to a delver on the
// doorway side round the pits, never over one.
func TestChasm_MonsterPathsRoundThePits(t *testing.T) {
	s, ids, _ := chasmRun(t, 1, 1)
	d := s.dungeon
	f := chasmFrameOfFloor(s)
	delver := delverEntity(t, s, ids[0])
	standOn(t, s, delver, f.cell(f.wide/2, 0))
	stairsSide := f.cell(f.wide/2, f.deep-1)
	at := d.cellCentre(stairsSide)
	monster := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: at.x, Y: at.y})
	mc := monsterOf(monster)
	mc.LastAttacker = delver.ID
	tick(s)

	require.NotEmpty(t, mc.Route.Cells, "a path round the chasm")
	var pits []components.Cell
	for _, p := range barriersOfKind(s, components.BarrierPit) {
		pits = append(pits, doorCellsOf(p)...)
	}
	for _, i := range mc.Route.Cells {
		c := components.Cell{X: i % d.layout.Cols, Y: i / d.layout.Cols}
		assert.NotContains(t, pits, c, "the path crosses no pit")
	}
}

// FS-5FZ4J §E R33, §B R11-R12: pulling the bridge lever lowers the bridge: its
// lane's pits open, walkable to bodies and paths, the other pits stay shut,
// the lever shows active, the seal breaks and the stairs climb; a second pull
// changes nothing.
func TestChasm_BridgeLeverOpensTheLaneAndBreaksTheSeal(t *testing.T) {
	s, ids, seal := chasmRun(t, 1, 1)
	g := s.dungeon.chasm
	f := chasmFrameOfFloor(s)
	lever := piecesOfKind(s, components.SealPieceBridgeLever)[0]
	require.True(t, s.sealHolds())

	pull(t, s, ids[0], lever)

	assert.True(t, sealComponentOf(seal).Broken)
	assert.False(t, s.sealHolds(), "the stairs climb")
	assert.True(t, pieceOf(lever).Active, "the bridge is lowered")
	for _, p := range barriersOfKind(s, components.BarrierPit) {
		lane := slices.Equal(doorCellsOf(p), cellsOf(g.lane))
		assert.Equal(t, lane, barrierOpen(p), "only the lane opens")
		for _, c := range doorCellsOf(p) {
			assert.Equal(t, lane, s.navGrid.Walkable(c.X, c.Y))
		}
	}
	pull(t, s, ids[0], lever)
	assert.True(t, sealComponentOf(seal).Broken)

	band := nearestDeep(s, g.lane)
	end := walkDeep(t, s, delverEntity(t, s, ids[0]), acrossOf(s, s.dungeon.chasm.lane), band-1, 3)
	assert.Greater(t, deepOf(f, end), band+1, "the lane carries the delver over the band")
}

// FS-5FZ4J §E R33: the Chasm's frame reads the stairs room from its doorway
// wall, whichever wall that is: the band lies in the middle of the depth.
func TestChasmFrame_FromEveryDoorwayWall(t *testing.T) {
	room := levelgen.CellRect{X: 10, Y: 20, W: 5, H: 6}
	tests := []struct {
		name  string
		room  levelgen.CellRect
		gate  levelgen.CellRect
		first components.Cell // (0, 0): the doorway wall's first cell
		deep  components.Cell // (0, 1)
	}{
		{"north", room, levelgen.CellRect{X: 11, Y: 19, W: 2, H: 1}, components.Cell{X: 10, Y: 20}, components.Cell{X: 10, Y: 21}},
		{"south", room, levelgen.CellRect{X: 11, Y: 26, W: 2, H: 1}, components.Cell{X: 10, Y: 25}, components.Cell{X: 10, Y: 24}},
		{"west", levelgen.CellRect{X: 10, Y: 20, W: 6, H: 5}, levelgen.CellRect{X: 9, Y: 21, W: 1, H: 2}, components.Cell{X: 10, Y: 20}, components.Cell{X: 11, Y: 20}},
		{"east", levelgen.CellRect{X: 10, Y: 20, W: 6, H: 5}, levelgen.CellRect{X: 16, Y: 21, W: 1, H: 2}, components.Cell{X: 15, Y: 20}, components.Cell{X: 14, Y: 20}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := chasmFrameOf(tt.room, tt.gate)
			assert.Equal(t, 5, f.wide)
			assert.Equal(t, 6, f.deep)
			assert.Equal(t, tt.first, f.cell(0, 0))
			assert.Equal(t, tt.deep, f.cell(0, 1))
		})
	}
}
