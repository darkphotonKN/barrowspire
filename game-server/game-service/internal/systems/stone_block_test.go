package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/navigation"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// blockCell is a push world's cell side, a dungeon floor's.
const blockCell = 80.0

// blockTick is one game tick, s.
const blockTick = 1.0 / float64(constants.GameFrameRate)

// pushWorld is a 12 x 12 floor of open ground, every cell walkable, with
// one stone block standing on cell (5, 5): the movement and the block system
// over one shared grid, as a session ticks them.
type pushWorld struct {
	em     *ecs.EntityManager
	grid   *navigation.Grid
	move   *MovementSystem
	blocks *StoneBlockSystem
	block  *ecs.Entity
}

func newPushWorld(t *testing.T) *pushWorld {
	t.Helper()
	walkable := make([]bool, 12*12)
	for i := range walkable {
		walkable[i] = true
	}
	w := &pushWorld{em: ecs.NewEntityManager(), grid: navigation.NewGrid(12, 12, blockCell, walkable)}
	w.move = &MovementSystem{MapWidth: 12 * blockCell, MapHeight: 12 * blockCell, Grid: w.grid}
	w.blocks = NewStoneBlockSystem(w.grid, BlockDrift{})
	w.block = w.addBlock(5, 5)
	return w
}

// addBlock stands a stone block on cell (x, y) and shuts the cell on the grid.
func (w *pushWorld) addBlock(x, y int) *ecs.Entity {
	block := w.em.CreateEntity()
	block.AddComponent(&components.SealPieceComponent{Kind: components.SealPieceBlock, Cell: components.Cell{X: x, Y: y}})
	block.AddComponent(components.NewTransformComponent((float64(x)+0.5)*blockCell, (float64(y)+0.5)*blockCell))
	block.AddComponent(&components.StoneBlockComponent{Size: blockCell})
	w.grid.SetWalkable(x, y, false)
	return block
}

// addDelver stands an in-play delver at (x, y), walking (vx, vy).
func (w *pushWorld) addDelver(x, y, vx, vy float64) *ecs.Entity {
	delver := w.em.CreateEntity()
	delver.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "Delver", false))
	delver.AddComponent(components.NewHealthComponent(100, 100))
	delver.AddComponent(components.NewTransformComponent(x, y))
	delver.AddComponent(components.NewVelocityComponent(vx, vy, constants.DefaultSpeed))
	return delver
}

// addMonster stands a live monster at (x, y), walking (vx, vy).
func (w *pushWorld) addMonster(x, y, vx, vy float64) *ecs.Entity {
	monster := w.em.CreateEntity()
	monster.AddComponent(&components.MonsterComponent{})
	monster.AddComponent(components.NewHealthComponent(100, 100))
	monster.AddComponent(components.NewTransformComponent(x, y))
	monster.AddComponent(components.NewVelocityComponent(vx, vy, constants.DefaultSpeed))
	return monster
}

// run ticks the world for d seconds, movement then blocks, as a session does.
func (w *pushWorld) run(d float64) {
	for range int(math.Round(d / blockTick)) {
		entities := w.em.GetAllEntities()
		w.move.Update(blockTick, entities)
		w.blocks.Update(blockTick, entities)
	}
}

// cellOf is the block's piece cell.
func cellOf(block *ecs.Entity) components.Cell {
	pc, _ := block.GetComponent(ecs.ComponentTypeSealPiece)
	return pc.(*components.SealPieceComponent).Cell
}

// centreOf is an entity's position.
func centreOf(e *ecs.Entity) (float64, float64) {
	tc, _ := e.GetComponent(ecs.ComponentTypeTransform)
	return tc.(*components.TransformComponent).X, tc.(*components.TransformComponent).Y
}

// pushTime is how long a delver at the default speed walks a face to push a
// block: a cell at half their walk speed (FS-5FZ4J §C R19).
func pushTime() float64 { return blockCell / (constants.DefaultSpeed * BlockPushSpeedShare) }

// westOfBlock is a delver standing a few px west of the (5, 5) block's west
// face, on its row's middle.
func westOfBlock() (float64, float64) {
	return 5*blockCell - constants.PlayerRadius - 4, 5.5 * blockCell
}

// FS-5FZ4J §C R19: a delver walking east into a block's west face for the
// half-speed time pushes it one cell east; it slides there over that time,
// standing on (6, 5) once it has, and the grid follows it.
func TestStoneBlock_SustainedWalkEast_PushesItOneCellEast(t *testing.T) {
	w := newPushWorld(t)
	x, y := westOfBlock()
	w.addDelver(x, y, 1, 0)

	w.run(2*pushTime() + 0.2)

	assert.Equal(t, components.Cell{X: 6, Y: 5}, cellOf(w.block), "one cell east")
	bx, by := centreOf(w.block)
	assert.InDelta(t, 6.5*blockCell, bx, 1e-9, "slid all the way onto its new cell")
	assert.InDelta(t, 5.5*blockCell, by, 1e-9)
	assert.False(t, w.grid.Walkable(6, 5), "its new cell is shut to paths")
	assert.True(t, w.grid.Walkable(5, 5), "its old cell is ground again")
}

// FS-5FZ4J §C R19: a touch shorter than the push time moves nothing, and a
// push broken off starts over: the walk must be sustained.
func TestStoneBlock_ShortTouch_MovesNothing(t *testing.T) {
	w := newPushWorld(t)
	x, y := westOfBlock()
	delver := w.addDelver(x, y, 1, 0)

	w.run(pushTime() * 0.6)
	vc, _ := delver.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).VX = 0
	w.run(0.2)
	vc.(*components.VelocityComponent).VX = 1
	w.run(pushTime() * 0.6)
	vc.(*components.VelocityComponent).VX = 0
	w.run(1)

	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
	bx, by := centreOf(w.block)
	assert.Equal(t, 5.5*blockCell, bx)
	assert.Equal(t, 5.5*blockCell, by)
}

// FS-5FZ4J §C R19: the push is made along the face it is walked against: a
// delver walking north into its south face pushes it north.
func TestStoneBlock_SustainedWalkNorth_PushesItOneCellNorth(t *testing.T) {
	w := newPushWorld(t)
	w.addDelver(5.5*blockCell, 6*blockCell+constants.PlayerRadius+4, 0, -1)

	w.run(2*pushTime() + 0.2)

	assert.Equal(t, components.Cell{X: 5, Y: 4}, cellOf(w.block))
}

// FS-5FZ4J §C R19: a block blocks every body as a wall does: a delver walking
// into it is stopped at its face.
func TestStoneBlock_BlocksABodyAsAWall(t *testing.T) {
	w := newPushWorld(t)
	x, y := westOfBlock()
	delver := w.addDelver(x, y, 1, 0)

	w.run(pushTime() * 0.9)

	dx, _ := centreOf(delver)
	assert.InDelta(t, 5*blockCell-constants.PlayerRadius, dx, 1e-6, "held at the west face")
}

// FS-5FZ4J §C R19: a walk that is not along one axis slides along the face
// and pushes nothing.
func TestStoneBlock_DiagonalWalk_PushesNothing(t *testing.T) {
	w := newPushWorld(t)
	x, y := westOfBlock()
	w.addDelver(x, y, math.Sqrt2/2, math.Sqrt2/2)

	w.run(3 * pushTime())

	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
}

// FS-5FZ4J §C R19: monsters never push a block, however long they walk at it.
func TestStoneBlock_MonsterWalkingIntoIt_DoesNotMoveIt(t *testing.T) {
	w := newPushWorld(t)
	x, y := westOfBlock()
	monster := w.addMonster(x, y, 1, 0)

	w.run(3 * pushTime())

	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
	mx, _ := centreOf(monster)
	assert.InDelta(t, 5*blockCell-constants.PlayerRadius, mx, 1e-6, "the block stops it as a wall")
}

// FS-5FZ4J Edge States: two delvers pushing one block from opposite faces on
// the same ticks cancel: neither push moves it.
func TestStoneBlock_OppositePushes_Cancel(t *testing.T) {
	w := newPushWorld(t)
	x, y := westOfBlock()
	w.addDelver(x, y, 1, 0)
	w.addDelver(6*blockCell+constants.PlayerRadius+4, y, -1, 0)

	w.run(3 * pushTime())

	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
}

// FS-5FZ4J §C R19: a push is refused, the block staying where it is and the
// delver blocked, when the cell beyond is rock or shut on the grid (a shell
// wall, a shut gate, a secret door, a pit), any barrier's even open, another
// block, a body, a shut door, or off the floor.
func TestStoneBlock_Refusals_LeaveTheBlockInPlace(t *testing.T) {
	beyond := components.Cell{X: 6, Y: 5}
	cases := []struct {
		name  string
		setup func(w *pushWorld)
	}{
		{"rock or a shell wall", func(w *pushWorld) { w.grid.SetWalkable(beyond.X, beyond.Y, false) }},
		{"another block", func(w *pushWorld) { w.addBlock(beyond.X, beyond.Y) }},
		{"a delver's body", func(w *pushWorld) { w.addDelver(6.5*blockCell, 5.5*blockCell, 0, 0) }},
		{"a monster's body", func(w *pushWorld) { w.addMonster(6.5*blockCell, 5.5*blockCell, 0, 0) }},
		{"a body only overlapping the cell", func(w *pushWorld) {
			w.addMonster(7*blockCell+constants.PlayerRadius-2, 5.5*blockCell, 0, 0)
		}},
		{"an open gate's cell", func(w *pushWorld) {
			gate := w.em.CreateEntity()
			gate.AddComponent(&components.BarrierComponent{Kind: components.BarrierGate, Cells: []components.Cell{beyond}})
			gate.AddComponent(components.NewDoorComponent(blockCell, blockCell))
			gate.AddComponent(components.NewTransformComponent(6*blockCell, 5*blockCell))
			gate.AddComponent(components.NewOpenableComponent(true))
		}},
		{"a pit", func(w *pushWorld) {
			pit := w.em.CreateEntity()
			pit.AddComponent(&components.BarrierComponent{Kind: components.BarrierPit, Cells: []components.Cell{beyond}})
		}},
		{"a shut door", func(w *pushWorld) {
			door := w.em.CreateEntity()
			door.AddComponent(components.NewDoorComponent(blockCell, blockCell/2))
			door.AddComponent(components.NewTransformComponent(6*blockCell, 5*blockCell))
			door.AddComponent(components.NewOpenableComponent(false))
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := newPushWorld(t)
			tc.setup(w)
			x, y := westOfBlock()
			delver := w.addDelver(x, y, 1, 0)

			w.run(3 * pushTime())

			assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block), "the block stays")
			bx, _ := centreOf(w.block)
			assert.Equal(t, 5.5*blockCell, bx)
			dx, _ := centreOf(delver)
			assert.LessOrEqual(t, dx, 5*blockCell-constants.PlayerRadius+1e-6, "the delver is blocked")
		})
	}

	t.Run("off the floor", func(t *testing.T) {
		w := newPushWorld(t)
		edge := w.addBlock(11, 2)
		w.addDelver(11*blockCell-constants.PlayerRadius-4, 2.5*blockCell, 1, 0)

		w.run(3 * pushTime())

		assert.Equal(t, components.Cell{X: 11, Y: 2}, cellOf(edge))
	})
}

// FS-5FZ4J §C R19: a resolved delver, dead or escaped, pushes nothing and is
// no body in a block's way.
func TestStoneBlock_ResolvedDelver_NeitherPushesNorBlocks(t *testing.T) {
	w := newPushWorld(t)
	x, y := westOfBlock()
	dead := w.addDelver(x, y, 1, 0)
	hc, _ := dead.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	w.run(3 * pushTime())
	require.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block), "the dead push nothing")

	w.em.RemoveEntity(dead.ID)
	escaped := w.addDelver(6.5*blockCell, 5.5*blockCell, 0, 0)
	pc, _ := escaped.GetComponent(ecs.ComponentTypePlayer)
	pc.(*components.PlayerComponent).Escape = true
	w.addDelver(x, y, 1, 0)
	w.run(2*pushTime() + 0.2)
	assert.Equal(t, components.Cell{X: 6, Y: 5}, cellOf(w.block), "an escaped body is in no one's way")
}

// FS-5FZ4J §C R19: a block's last push names its pusher, and a block pushed
// again moves on from where it came to rest.
func TestStoneBlock_TwoPushes_MoveItTwoCells_ItsPusherNamed(t *testing.T) {
	w := newPushWorld(t)
	x, y := westOfBlock()
	delver := w.addDelver(x, y, 1, 0)

	w.run(4*pushTime() + 0.4)

	assert.Equal(t, components.Cell{X: 7, Y: 5}, cellOf(w.block))
	bc, _ := w.block.GetComponent(ecs.ComponentTypeStoneBlock)
	assert.Equal(t, delver.ID, bc.(*components.StoneBlockComponent).PushedBy)
	assert.True(t, w.grid.Walkable(6, 5))
	assert.False(t, w.grid.Walkable(7, 5))
}

// driftAfter and driftClear are the drift rule's numbers, FS-5FZ4J §C R19 as
// amended: 20 s unmoved, no delver within 2 cells.
const (
	driftAfter = 20.0
	driftClear = 2.0
)

// newRoomWorld is a push world whose block system drifts blocks home and
// whose (5, 5) block stands in a plates room of cells (2, 2) to (9, 8),
// laid on its home cell: the rest of the floor is open ground too, a
// corridor's.
func newRoomWorld(t *testing.T) *pushWorld {
	t.Helper()
	w := newPushWorld(t)
	w.blocks = NewStoneBlockSystem(w.grid, BlockDrift{After: driftAfter, ClearCells: driftClear})
	w.inRoom(w.block)
	return w
}

// inRoom makes block a plates room's, laid on the cell it stands on.
func (w *pushWorld) inRoom(block *ecs.Entity) {
	bc, _ := block.GetComponent(ecs.ComponentTypeStoneBlock)
	stone := bc.(*components.StoneBlockComponent)
	stone.Home = cellOf(block)
	stone.Room = components.CellRect{X: 2, Y: 2, W: 8, H: 7}
}

// moveBlock stands block on cell, as a push would have left it: its old
// cell open on the grid, its new one shut.
func (w *pushWorld) moveBlock(block *ecs.Entity, cell components.Cell) {
	was := cellOf(block)
	w.grid.SetWalkable(was.X, was.Y, true)
	pc, _ := block.GetComponent(ecs.ComponentTypeSealPiece)
	pc.(*components.SealPieceComponent).Cell = cell
	tc, _ := block.GetComponent(ecs.ComponentTypeTransform)
	tc.(*components.TransformComponent).X = (float64(cell.X) + 0.5) * blockCell
	tc.(*components.TransformComponent).Y = (float64(cell.Y) + 0.5) * blockCell
	w.grid.SetWalkable(cell.X, cell.Y, false)
}

// stoneOf is a block's stone block component.
func stoneOf(block *ecs.Entity) *components.StoneBlockComponent {
	bc, _ := block.GetComponent(ecs.ComponentTypeStoneBlock)
	return bc.(*components.StoneBlockComponent)
}

// FS-5FZ4J §C R19 (amended, ADR-0092): a push that would take a block out of
// its plates room's cells is refused, the block staying on the room's edge
// and the delver blocked, though the ground beyond is open: no block reaches
// a corridor, so none jams one.
func TestStoneBlock_PushOutOfItsRoom_IsRefused(t *testing.T) {
	w := newRoomWorld(t)
	w.moveBlock(w.block, components.Cell{X: 9, Y: 5}) // the room's east edge
	require.True(t, w.grid.Walkable(10, 5), "open ground beyond, a corridor's")
	delver := w.addDelver(9*blockCell-constants.PlayerRadius-4, 5.5*blockCell, 1, 0)

	w.run(3 * pushTime())

	assert.Equal(t, components.Cell{X: 9, Y: 5}, cellOf(w.block), "it stays in its room")
	assert.True(t, w.grid.Walkable(10, 5))
	dx, _ := centreOf(delver)
	assert.LessOrEqual(t, dx, 9*blockCell-constants.PlayerRadius+1e-6, "the delver is blocked")

	// pushed along the edge, it moves as ever
	vc, _ := delver.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).VX = 0
	tc, _ := delver.GetComponent(ecs.ComponentTypeTransform)
	tc.(*components.TransformComponent).X, tc.(*components.TransformComponent).Y = 9.5*blockCell, 6*blockCell+constants.PlayerRadius+4
	vc.(*components.VelocityComponent).VY = -1
	w.run(2*pushTime() + 0.2)
	assert.Equal(t, components.Cell{X: 9, Y: 4}, cellOf(w.block))
}

// FS-5FZ4J §C R19 (amended): a block off its home cell, on no plate, unmoved
// for 20 s with no delver within 2 cells, slides back to its home cell at the
// push speed, a cell at a time, the grid following it as a push's does.
func TestStoneBlock_LeftAlone20s_DriftsHome(t *testing.T) {
	w := newRoomWorld(t)
	w.moveBlock(w.block, components.Cell{X: 8, Y: 7})

	w.run(driftAfter - 0.5)
	require.Equal(t, components.Cell{X: 8, Y: 7}, cellOf(w.block), "not before 20 s")

	// 3 cells west and 2 north, a cell each push time
	w.run(0.5 + 5*pushTime() + 0.5)

	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block), "home")
	assert.False(t, stoneOf(w.block).Sliding)
	bx, by := centreOf(w.block)
	assert.InDelta(t, 5.5*blockCell, bx, 1e-9)
	assert.InDelta(t, 5.5*blockCell, by, 1e-9)
	assert.False(t, w.grid.Walkable(5, 5), "its home is shut to paths")
	assert.True(t, w.grid.Walkable(8, 7), "where it lay is ground again")
	for y := 2; y <= 8; y++ {
		for x := 2; x <= 9; x++ {
			if x != 5 || y != 5 {
				assert.True(t, w.grid.Walkable(x, y), "cell (%d, %d) is ground", x, y)
			}
		}
	}
}

// FS-5FZ4J §C R19 (amended): a step home takes a push's time: a block one
// cell from home is still sliding after half of it.
func TestStoneBlock_DriftStep_TakesAPushTime(t *testing.T) {
	w := newRoomWorld(t)
	w.moveBlock(w.block, components.Cell{X: 6, Y: 5})
	stoneOf(w.block).Still = driftAfter

	w.run(pushTime() / 2)
	assert.True(t, stoneOf(w.block).Sliding, "mid-slide")
	bx, _ := centreOf(w.block)
	assert.Greater(t, bx, 5.5*blockCell)
	assert.Less(t, bx, 6.5*blockCell)

	w.run(pushTime()/2 + 0.1)
	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
	assert.False(t, stoneOf(w.block).Sliding)
}

// FS-5FZ4J §C R19 (amended): a block stays where it is while a delver stands
// within 2 cells of it, or it rests on a plate, or its home cell is taken, or
// it moved less than 20 s ago; once the delver walks off it drifts.
func TestStoneBlock_Drift_HeldBack(t *testing.T) {
	away := components.Cell{X: 8, Y: 5}
	cases := []struct {
		name  string
		setup func(w *pushWorld)
	}{
		{"a delver within 2 cells", func(w *pushWorld) { w.addDelver(8.5*blockCell, 7.4*blockCell, 0, 0) }},
		{"resting on a plate", func(w *pushWorld) {
			plate := w.em.CreateEntity()
			plate.AddComponent(&components.SealPieceComponent{Kind: components.SealPiecePlate, Cell: away})
			plate.AddComponent(components.NewTransformComponent(8.5*blockCell, 5.5*blockCell))
		}},
		{"its home taken by a body", func(w *pushWorld) { w.addMonster(5.5*blockCell, 5.5*blockCell, 0, 0) }},
		{"its home taken by a block", func(w *pushWorld) { w.inRoom(w.addBlock(5, 5)) }},
		{"moved a moment ago", func(w *pushWorld) { stoneOf(w.block).Still = -10 }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := newRoomWorld(t)
			w.moveBlock(w.block, away)
			tc.setup(w)

			w.run(driftAfter + 3*pushTime())

			assert.Equal(t, away, cellOf(w.block), "it stays")
		})
	}

	t.Run("until the delver walks off", func(t *testing.T) {
		w := newRoomWorld(t)
		w.moveBlock(w.block, away)
		delver := w.addDelver(8.5*blockCell, 7.4*blockCell, 0, 0)
		w.run(driftAfter + 1)
		require.Equal(t, away, cellOf(w.block))

		tc, _ := delver.GetComponent(ecs.ComponentTypeTransform)
		tc.(*components.TransformComponent).X, tc.(*components.TransformComponent).Y = 11.5*blockCell, 11.5*blockCell
		w.run(3*pushTime() + 0.5)
		assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block), "home once no one is near")
	})
}

// FS-5FZ4J §C R19 (amended): a push resets the 20 s: a block pushed 15 s
// after it last moved waits 20 s from the push.
func TestStoneBlock_APush_StartsThe20sAgain(t *testing.T) {
	w := newRoomWorld(t)
	w.moveBlock(w.block, components.Cell{X: 6, Y: 5})
	w.run(15)
	delver := w.addDelver(6*blockCell-constants.PlayerRadius-4, 5.5*blockCell, 1, 0)
	w.run(2*pushTime() + 0.2)
	require.Equal(t, components.Cell{X: 7, Y: 5}, cellOf(w.block), "pushed east")
	w.em.RemoveEntity(delver.ID)

	w.run(driftAfter - 1)
	assert.Equal(t, components.Cell{X: 7, Y: 5}, cellOf(w.block), "20 s from the push, not from before it")
	w.run(1 + 2*pushTime() + 0.5)
	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
}

// FS-5FZ4J §C R19 (amended): the way home goes round another block in its
// path, never through it.
func TestStoneBlock_DriftHome_GoesRoundABlock(t *testing.T) {
	w := newRoomWorld(t)
	w.moveBlock(w.block, components.Cell{X: 8, Y: 5})
	other := w.addBlock(6, 5)
	w.inRoom(other)
	stoneOf(w.block).Still = driftAfter
	stoneOf(other).Still = -1000 // it stays where it is

	for range int(math.Round(10 / blockTick)) {
		entities := w.em.GetAllEntities()
		w.move.Update(blockTick, entities)
		w.blocks.Update(blockTick, entities)
		assert.NotEqual(t, cellOf(other), cellOf(w.block), "never on the other block's cell")
	}

	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block), "home round it")
	assert.Equal(t, components.Cell{X: 6, Y: 5}, cellOf(other))
}

// A body on a cell is in a block's way, the one test a push and a laid block
// share (FS-5FZ4J §C R19).
func TestBodyOverlapsCell(t *testing.T) {
	w := newPushWorld(t)
	w.addMonster(7*blockCell+constants.PlayerRadius-2, 5.5*blockCell, 0, 0)
	entities := w.em.GetAllEntities()
	assert.True(t, BodyOverlapsCell(components.Cell{X: 6, Y: 5}, blockCell, entities), "overlapping its edge")
	assert.True(t, BodyOverlapsCell(components.Cell{X: 7, Y: 5}, blockCell, entities))
	assert.False(t, BodyOverlapsCell(components.Cell{X: 5, Y: 5}, blockCell, entities))
}
