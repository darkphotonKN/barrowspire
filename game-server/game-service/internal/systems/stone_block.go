package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
	Stone blocks (FS-5FZ4J §C R19): a block fills one cell and blocks every body
	as a wall does. A delver walking against one of its faces along one axis
	builds a push; once they have walked it for the time a cell takes at half
	their walk speed, the block's cell moves on one that way and the block slides
	there over that time, as long again. A touch shorter than that moves nothing,
	two pushes along different ways on one tick cancel, and a push into a cell a
	block may not enter is refused: the block stays and the delver is blocked.
	Blocks never move on their own; monsters never push them.

	A block is no wall to the static wall index, which is built once per set of
	walls and doors and never sees one move: the walk tests the floor's few
	blocks live, by their place this tick (withStoneBlocks). The floor's grid,
	the one monster paths and straight moves read, has a block's cell shut while
	it stands there (§D R22): its new cell from the tick its push lands, its old
	one opened the tick its slide ends.
*/

// BlockPushSpeedShare is the share of a delver's walk speed a push moves a
// block at: half (FS-5FZ4J §C R19). A push builds over, and a block slides
// over, the time one cell takes at it.
const BlockPushSpeedShare = 0.5

// blockContactSlack is how near, px, a body's leading edge stands to a
// block's face to be walking against it: the walk's sweep leaves it touching.
const blockContactSlack = 0.5

// blockDone is how near to whole a push or a slide counts as done, against
// the drift of summing ticks.
const blockDone = 1e-9

// CellMask is a dungeon floor's grid as the blocks read and write it: which
// cells are ground, and a block's cell shut or opened (FS-5FZ4J §D R22).
type CellMask interface {
	Walkable(x, y int) bool
	SetWalkable(x, y int, walkable bool)
}

// StoneBlockSystem builds the pushes on a floor's stone blocks and slides
// them, after the walk each tick, over the floor's grid.
type StoneBlockSystem struct {
	grid CellMask
}

// NewStoneBlockSystem is the block system over a dungeon floor's grid.
func NewStoneBlockSystem(grid CellMask) *StoneBlockSystem {
	return &StoneBlockSystem{grid: grid}
}

// stoneBlock is one block as the system reads it.
type stoneBlock struct {
	entity *ecs.Entity
	piece  *components.SealPieceComponent
	at     *components.TransformComponent
	block  *components.StoneBlockComponent
}

// rect is the block's square this tick, by its corners.
func (b stoneBlock) rect() (x0, y0, x1, y1 float64) {
	half := b.block.Size / 2
	return b.at.X - half, b.at.Y - half, b.at.X + half, b.at.Y + half
}

// push is one delver walking against one block's face this tick.
type push struct {
	dx, dy int
	speed  float64
	by     uuid.UUID
}

// Update builds, cancels, refuses or lands this tick's pushes and slides
// every sliding block on. NOTE: this runs every game tick, after the walk.
func (s *StoneBlockSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	blocks := stoneBlocksOf(entities)
	if len(blocks) == 0 {
		return
	}

	pushes := make([][]push, len(blocks))
	for _, entity := range entities {
		p, x, y, walking := walkAlongAxis(entity)
		if !walking {
			continue
		}
		if i, against := faceWalked(blocks, x, y, p.dx, p.dy); against {
			pushes[i] = append(pushes[i], p)
		}
	}

	for i, b := range blocks {
		if b.block.Sliding {
			s.slide(b, deltaTime)
			continue
		}
		s.build(b, pushes[i], deltaTime, entities, blocks)
	}
}

// build adds this tick's push to the block's, or starts it over: with no
// push, two along different ways, a push along a new way or one refused. A
// push built whole lands: the block's cell moves on and its slide begins.
func (s *StoneBlockSystem) build(b stoneBlock, pushes []push, deltaTime float64, entities []*ecs.Entity, blocks []stoneBlock) {
	if len(pushes) == 0 {
		b.block.Pushed = 0
		return
	}
	lead := pushes[0]
	for _, p := range pushes[1:] {
		if p.dx != lead.dx || p.dy != lead.dy {
			// equal and opposite, or across: neither moves it
			b.block.Pushed = 0
			return
		}
		if p.speed > lead.speed {
			lead = p
		}
	}
	if lead.dx != b.block.PushX || lead.dy != b.block.PushY {
		b.block.PushX, b.block.PushY, b.block.Pushed = lead.dx, lead.dy, 0
	}
	target := components.Cell{X: b.piece.Cell.X + lead.dx, Y: b.piece.Cell.Y + lead.dy}
	if s.refused(target, b, entities, blocks) {
		b.block.Pushed = 0
		return
	}

	rate := lead.speed * BlockPushSpeedShare / b.block.Size
	b.block.Pushed += deltaTime * rate
	if b.block.Pushed < 1-blockDone {
		return
	}
	b.block.Pushed = 0
	b.block.PushedBy = lead.by
	b.piece.Cell = target
	s.grid.SetWalkable(target.X, target.Y, false)
	b.block.Sliding = true
	b.block.FromX, b.block.FromY = b.at.X, b.at.Y
	b.block.Slid, b.block.SlideFor = 0, 1/rate
}

// slide moves a sliding block on toward its cell's centre; the tick it
// arrives its old cell opens.
func (s *StoneBlockSystem) slide(b stoneBlock, deltaTime float64) {
	b.block.Slid += deltaTime
	toX := (float64(b.piece.Cell.X) + 0.5) * b.block.Size
	toY := (float64(b.piece.Cell.Y) + 0.5) * b.block.Size
	t := b.block.Slid / b.block.SlideFor
	if t < 1-blockDone {
		b.at.X = b.block.FromX + (toX-b.block.FromX)*t
		b.at.Y = b.block.FromY + (toY-b.block.FromY)*t
		return
	}
	b.at.X, b.at.Y = toX, toY
	b.block.Sliding = false
	from := cellAt(b.block.FromX, b.block.FromY, b.block.Size)
	s.grid.SetWalkable(from.X, from.Y, true)
}

/*
refused is whether a block may not be pushed onto target (FS-5FZ4J §C R19):
off the floor, rock or shut on the grid (a shell wall, a shut gate or secret
door, a pit, another block), any barrier's cell even open (a block never enters
the gate's cells or a pit, Edge States), another block's cell, a shut door's,
or a cell a body overlaps.
*/
func (s *StoneBlockSystem) refused(target components.Cell, self stoneBlock, entities []*ecs.Entity, blocks []stoneBlock) bool {
	if !s.grid.Walkable(target.X, target.Y) {
		return true
	}
	for _, other := range blocks {
		if other.entity.ID != self.entity.ID && other.piece.Cell == target {
			return true
		}
	}
	size := self.block.Size
	x0, y0 := float64(target.X)*size, float64(target.Y)*size
	x1, y1 := x0+size, y0+size
	r := constants.PlayerRadius
	for _, entity := range entities {
		if bc, ok := entity.GetComponent(ecs.ComponentTypeBarrier); ok {
			for _, c := range bc.(*components.BarrierComponent).Cells {
				if c == target {
					return true
				}
			}
			continue
		}
		if door, ok := blockerOf(entity, ecs.ComponentTypeDoor); ok && !door.open() {
			dx0, dy0, dx1, dy1 := extent(door)
			if overlaps(dx0, dy0, dx1, dy1, x0, y0, x1, y1) {
				return true
			}
			continue
		}
		if BodyKindOf(entity) == BodyNone {
			continue
		}
		if tc, ok := entity.GetComponent(ecs.ComponentTypeTransform); ok {
			at := tc.(*components.TransformComponent)
			if overlaps(at.X-r, at.Y-r, at.X+r, at.Y+r, x0, y0, x1, y1) {
				return true
			}
		}
	}
	return false
}

// overlaps is whether two boxes, by their corners, share any area: touching
// edges do not.
func overlaps(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1 float64) bool {
	return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1
}

// cellAt is the cell of side size holding (x, y).
func cellAt(x, y, size float64) components.Cell {
	return components.Cell{X: int(math.Floor(x / size)), Y: int(math.Floor(y / size))}
}

// stoneBlocksOf picks the floor's stone blocks out of the entities.
func stoneBlocksOf(entities []*ecs.Entity) []stoneBlock {
	var blocks []stoneBlock
	for _, entity := range entities {
		bc, isBlock := entity.GetComponent(ecs.ComponentTypeStoneBlock)
		pc, isPiece := entity.GetComponent(ecs.ComponentTypeSealPiece)
		tc, placed := entity.GetComponent(ecs.ComponentTypeTransform)
		if !isBlock || !isPiece || !placed {
			continue
		}
		blocks = append(blocks, stoneBlock{
			entity: entity,
			piece:  pc.(*components.SealPieceComponent),
			at:     tc.(*components.TransformComponent),
			block:  bc.(*components.StoneBlockComponent),
		})
	}
	return blocks
}

/*
walkAlongAxis is the push a body makes this tick, if it makes one: a body
that pushes (a delver in play, never a monster) walking, not charging nor
pinned, its held direction along one axis. A walk off an axis slides along a
face and pushes nothing.
*/
func walkAlongAxis(entity *ecs.Entity) (p push, x, y float64, walking bool) {
	if !BodyKindOf(entity).Pushes() || entity.HasComponent(ecs.ComponentTypeDash) {
		return push{}, 0, 0, false
	}
	vc, moves := entity.GetComponent(ecs.ComponentTypeVelocity)
	tc, placed := entity.GetComponent(ecs.ComponentTypeTransform)
	if !moves || !placed {
		return push{}, 0, 0, false
	}
	velocity := vc.(*components.VelocityComponent)
	speed := velocity.Speed * walkFactor(entity)
	if speed <= 0 {
		return push{}, 0, 0, false
	}
	at := tc.(*components.TransformComponent)
	switch {
	case velocity.VX != 0 && math.Abs(velocity.VY) < blockDone:
		return push{dx: int(math.Copysign(1, velocity.VX)), speed: speed, by: entity.ID}, at.X, at.Y, true
	case velocity.VY != 0 && math.Abs(velocity.VX) < blockDone:
		return push{dy: int(math.Copysign(1, velocity.VY)), speed: speed, by: entity.ID}, at.X, at.Y, true
	}
	return push{}, 0, 0, false
}

// faceWalked is the block whose face a body at (x, y) walking (dx, dy) stands
// against: its leading edge on the face, its centre within the face's span.
func faceWalked(blocks []stoneBlock, x, y float64, dx, dy int) (int, bool) {
	r := constants.PlayerRadius
	for i, b := range blocks {
		x0, y0, x1, y1 := b.rect()
		var against bool
		switch {
		case dx > 0:
			against = math.Abs(x+r-x0) <= blockContactSlack && y >= y0 && y <= y1
		case dx < 0:
			against = math.Abs(x-r-x1) <= blockContactSlack && y >= y0 && y <= y1
		case dy > 0:
			against = math.Abs(y+r-y0) <= blockContactSlack && x >= x0 && x <= x1
		case dy < 0:
			against = math.Abs(y-r-y1) <= blockContactSlack && x >= x0 && x <= x1
		}
		if against {
			return i, true
		}
	}
	return 0, false
}

// blockedWalls is the walk's wall tests with the floor's stone blocks beside
// the static index, each tested where it stands this tick.
type blockedWalls struct {
	walls  wallTests
	blocks []blocker
}

// withStoneBlocks is walls with the entities' stone blocks tested beside
// them, live; walls itself when there are none.
func withStoneBlocks(walls wallTests, entities []*ecs.Entity) wallTests {
	var blocks []blocker
	for _, b := range stoneBlocksOf(entities) {
		x0, y0, _, _ := b.rect()
		blocks = append(blocks, blocker{x: x0, y: y0, w: b.block.Size, h: b.block.Size})
	}
	if len(blocks) == 0 {
		return walls
	}
	return blockedWalls{walls: walls, blocks: blocks}
}

func (w blockedWalls) sweepX(x, y, dx float64) float64 {
	t := w.walls.sweepX(x, y, dx)
	for _, b := range w.blocks {
		t = min(t, SweptX(x, y, b.x, b.y, b.w, b.h, dx))
	}
	return t
}

func (w blockedWalls) sweepY(x, y, dy float64) float64 {
	t := w.walls.sweepY(x, y, dy)
	for _, b := range w.blocks {
		t = min(t, SweptY(x, y, b.x, b.y, b.w, b.h, dy))
	}
	return t
}

// depenetrate pushes a body out of the walls, then the blocks, then the
// walls again, so a body a sliding block leans on is never left in a wall.
func (w blockedWalls) depenetrate(x, y float64) (float64, float64) {
	x, y = w.walls.depenetrate(x, y)
	for _, b := range w.blocks {
		x, y = depenetrate(x, y, b.x, b.y, b.w, b.h)
	}
	return w.walls.depenetrate(x, y)
}
