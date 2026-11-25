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
	Monsters never push them.

	A block keeps to its plates room: a push that would take it out of the
	room's cells is refused. A block left alone drifts home: off its home cell,
	on no plate, unmoved by a push for BlockDrift.After seconds and with no
	delver within BlockDrift.ClearCells cells, it slides back toward its home
	cell, a cell at a time at the push speed, round whatever stands in the
	room, while that cell is free. So no block is ever lost to a wall or a
	corner and the plates stay solvable by one (§C R19 as amended, ADR-0092).

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

// BlockDrift is when a block left alone drifts home: After seconds unmoved
// by a push, with no delver within ClearCells cells of it. The zero drift
// never drifts. FS-5FZ4J §C R19 as amended.
type BlockDrift struct {
	After      float64
	ClearCells float64
}

// StoneBlockSystem builds the pushes on a floor's stone blocks, drifts the
// ones left alone home and slides them, after the walk each tick, over the
// floor's grid.
type StoneBlockSystem struct {
	grid  CellMask
	drift BlockDrift
}

// NewStoneBlockSystem is the block system over a dungeon floor's grid,
// drifting blocks home by drift.
func NewStoneBlockSystem(grid CellMask, drift BlockDrift) *StoneBlockSystem {
	return &StoneBlockSystem{grid: grid, drift: drift}
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

// Update builds, cancels, refuses or lands this tick's pushes, drifts the
// blocks left alone and slides every sliding block on. NOTE: this runs every
// game tick, after the walk.
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

	plates := plateCellsOf(entities)
	for i, b := range blocks {
		switch {
		case b.block.Sliding:
			s.slide(b, deltaTime)
		case len(pushes[i]) > 0:
			s.build(b, pushes[i], deltaTime, entities, blocks)
		default:
			b.block.Pushed = 0
			s.driftHome(b, deltaTime, entities, blocks, plates)
		}
	}
}

// build adds this tick's pushes to the block's, or starts it over: with two
// along different ways, a push along a new way or one refused. A push built
// whole lands: the block's cell moves on and its slide begins.
func (s *StoneBlockSystem) build(b stoneBlock, pushes []push, deltaTime float64, entities []*ecs.Entity, blocks []stoneBlock) {
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
	b.block.Still = 0
	s.land(b, target, lead.by, 1/rate)
}

// land moves the block's cell on to target and starts its slide there over
// slideFor seconds: target is shut on the grid from this tick, the cell it
// leaves the tick the slide ends. by is the delver whose push moved it,
// uuid.Nil for a drift home.
func (s *StoneBlockSystem) land(b stoneBlock, target components.Cell, by uuid.UUID, slideFor float64) {
	b.block.PushedBy = by
	b.piece.Cell = target
	s.grid.SetWalkable(target.X, target.Y, false)
	b.block.Sliding = true
	b.block.FromX, b.block.FromY = b.at.X, b.at.Y
	b.block.Slid, b.block.SlideFor = 0, slideFor
}

/*
driftHome counts a block left alone this tick and, once it has been left
alone long enough, steps it one cell toward its home cell (FS-5FZ4J §C R19 as
amended): a block with a room to keep to, off its home, on no plate, with no
delver near and its home cell free, slides one cell along the shortest way
home through its room that crosses no other block or plate, at the push speed
of a delver at the walk's default speed. A step is a slide as a push's is,
the grid following it; it does not count as a push, so the next step follows
on the tick the slide ends.
*/
func (s *StoneBlockSystem) driftHome(b stoneBlock, deltaTime float64, entities []*ecs.Entity, blocks []stoneBlock, plates map[components.Cell]bool) {
	b.block.Still += deltaTime
	switch {
	case s.drift.After <= 0 || b.block.Room.W <= 0 || b.piece.Cell == b.block.Home:
		return
	case b.block.Still < s.drift.After, plates[b.piece.Cell]:
		return
	case s.delverNear(b, entities), s.refused(b.block.Home, b, entities, blocks):
		return
	}
	next, ok := s.stepHome(b, blocks, plates)
	if !ok || s.refused(next, b, entities, blocks) {
		return
	}
	s.land(b, next, uuid.Nil, b.block.Size/(constants.DefaultSpeed*BlockPushSpeedShare))
}

// delverNear is whether a delver in play stands within the drift's clear
// cells of the block's centre.
func (s *StoneBlockSystem) delverNear(b stoneBlock, entities []*ecs.Entity) bool {
	reach := s.drift.ClearCells * b.block.Size
	for _, entity := range entities {
		if BodyKindOf(entity) != BodyDelver {
			continue
		}
		if tc, ok := entity.GetComponent(ecs.ComponentTypeTransform); ok {
			at := tc.(*components.TransformComponent)
			if math.Hypot(at.X-b.at.X, at.Y-b.at.Y) <= reach {
				return true
			}
		}
	}
	return false
}

// stepHome is the first cell of the shortest 4-neighbour way from the
// block's cell to its home cell inside its room, over ground the grid holds
// open and no other block's cell or plate's: breadth first, a room of a few
// dozen cells. false when no such way exists this tick.
func (s *StoneBlockSystem) stepHome(b stoneBlock, blocks []stoneBlock, plates map[components.Cell]bool) (components.Cell, bool) {
	taken := map[components.Cell]bool{}
	for _, other := range blocks {
		if other.entity.ID != b.entity.ID {
			taken[other.piece.Cell] = true
		}
	}
	from, home := b.piece.Cell, b.block.Home
	firstStep := map[components.Cell]components.Cell{from: from}
	queue := []components.Cell{from}
	for len(queue) > 0 {
		at := queue[0]
		queue = queue[1:]
		if at == home {
			return firstStep[at], true
		}
		for _, d := range [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			next := components.Cell{X: at.X + d[0], Y: at.Y + d[1]}
			if _, seen := firstStep[next]; seen || !inRect(b.block.Room, next) || taken[next] || plates[next] ||
				!s.grid.Walkable(next.X, next.Y) {
				continue
			}
			first := firstStep[at]
			if at == from {
				first = next
			}
			firstStep[next] = first
			queue = append(queue, next)
		}
	}
	return components.Cell{}, false
}

// plateCellsOf is the cells the floor's plates cover.
func plateCellsOf(entities []*ecs.Entity) map[components.Cell]bool {
	plates := map[components.Cell]bool{}
	for _, entity := range entities {
		if pc, ok := entity.GetComponent(ecs.ComponentTypeSealPiece); ok {
			if piece := pc.(*components.SealPieceComponent); piece.Kind == components.SealPiecePlate {
				plates[piece.Cell] = true
			}
		}
	}
	return plates
}

// inRect is whether cell lies in rect.
func inRect(rect components.CellRect, cell components.Cell) bool {
	return cell.X >= rect.X && cell.Y >= rect.Y && cell.X < rect.X+rect.W && cell.Y < rect.Y+rect.H
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
out of its plates room's cells (as amended), off the floor, rock or shut on the
grid (a shell wall, a shut gate or secret door, a pit, another block), any
barrier's cell even open (a block never enters the gate's cells or a pit, Edge
States), another block's cell, a shut door's, or a cell a body overlaps.
*/
func (s *StoneBlockSystem) refused(target components.Cell, self stoneBlock, entities []*ecs.Entity, blocks []stoneBlock) bool {
	if self.block.Room.W > 0 && !inRect(self.block.Room, target) {
		return true
	}
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
		}
	}
	return BodyOverlapsCell(target, size, entities)
}

// BodyOverlapsCell is whether a body the ground counts (a delver in play, a
// live monster) overlaps cell, of side size px: a block may not be pushed,
// drift or be laid there (FS-5FZ4J §C R19).
func BodyOverlapsCell(cell components.Cell, size float64, entities []*ecs.Entity) bool {
	x0, y0 := float64(cell.X)*size, float64(cell.Y)*size
	x1, y1 := x0+size, y0+size
	r := constants.PlayerRadius
	for _, entity := range entities {
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

// passingPits is the walls as an afloat body meets them, the blocks still
// standing: a block is no pit.
func (w blockedWalls) passingPits() wallTests {
	return blockedWalls{walls: w.walls.passingPits(), blocks: w.blocks}
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
