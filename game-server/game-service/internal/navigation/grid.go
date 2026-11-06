// Package navigation finds paths over a dungeon floor's cell grid (FS-KE075
// §D, ADR-0062): which cells are walkable, A* between two of them, and
// whether a body can move straight from one point to another without
// touching rock.
package navigation

import "math"

/*
Grid is a floor's cells as navigation reads them: a cell is walkable or it is
rock. Bodies are not obstacles to it (ADR-0062 Decision 1); collision stays the
movement system's.

Cells are numbered row by row, y*cols + x. A cell's walls are whole cells of
rock (ADR-0061), so a body that overlaps only walkable cells touches no wall.

The walkable cells never change, but Path reuses one search's scratch: a Grid
is used by one goroutine at a time, the tick's.
*/
type Grid struct {
	cols, rows int
	size       float64
	walkable   []bool

	search search
}

// NewGrid is the grid of cols x rows cells of size px, walkable[y*cols+x]
// saying whether each is ground. walkable is read, never kept.
func NewGrid(cols, rows int, size float64, walkable []bool) *Grid {
	g := &Grid{cols: cols, rows: rows, size: size, walkable: make([]bool, cols*rows)}
	copy(g.walkable, walkable)
	g.search = newSearch(cols * rows)
	return g
}

// Cell is the walkable cell holding (x, y); false on rock or off the grid. A
// point on a shared edge is in the cell right of it or below it.
func (g *Grid) Cell(x, y float64) (int, bool) {
	cx, cy := int(math.Floor(x/g.size)), int(math.Floor(y/g.size))
	if !g.ground(cx, cy) {
		return 0, false
	}
	return cy*g.cols + cx, true
}

// Centre is the centre of cell in px.
func (g *Grid) Centre(cell int) (x, y float64) {
	return (float64(cell%g.cols) + 0.5) * g.size, (float64(cell/g.cols) + 0.5) * g.size
}

// Near reports whether b is a's cell or one step from it under the step rule:
// an 8-neighbour, diagonal only when both orthogonal cells it passes are
// walkable (FS-KE075 §D R22–23). Both must be walkable.
func (g *Grid) Near(a, b int) bool {
	if !g.valid(a) || !g.valid(b) {
		return false
	}
	ax, ay, bx, by := a%g.cols, a/g.cols, b%g.cols, b/g.cols
	dx, dy := bx-ax, by-ay
	if dx < -1 || dx > 1 || dy < -1 || dy > 1 {
		return false
	}
	return g.ground(bx, by) && g.ground(ax, ay) && (dx == 0 || dy == 0 || g.ground(ax+dx, ay) && g.ground(ax, ay+dy))
}

/*
Clear reports whether a square body of half-size half, moving in a straight
line from (ax, ay) to (bx, by), only ever overlaps walkable cells. Touching a
rock cell's edge is not overlapping it, as the movement system's depenetration
leaves a body touching a wall.

The move is cut into sub-steps of at most half a cell, and the box swept by
each sub-step is bounded by the box round both its ends: a conservative test,
never clear when the body would clip rock, and only a few pixels stricter than
the exact sweep.
*/
func (g *Grid) Clear(ax, ay, bx, by, half float64) bool {
	steps := max(1, int(math.Ceil(math.Hypot(bx-ax, by-ay)/(g.size/2))))
	px, py := ax, ay
	for i := 1; i <= steps; i++ {
		t := float64(i) / float64(steps)
		qx, qy := ax+(bx-ax)*t, ay+(by-ay)*t
		if !g.boxClear(min(px, qx)-half, min(py, qy)-half, max(px, qx)+half, max(py, qy)+half) {
			return false
		}
		px, py = qx, qy
	}
	return true
}

// boxClear reports whether the box from (x0, y0) to (x1, y1) overlaps only
// walkable cells.
func (g *Grid) boxClear(x0, y0, x1, y1 float64) bool {
	c0, r0 := int(math.Floor(x0/g.size)), int(math.Floor(y0/g.size))
	c1, r1 := int(math.Ceil(x1/g.size))-1, int(math.Ceil(y1/g.size))-1
	for y := r0; y <= r1; y++ {
		for x := c0; x <= c1; x++ {
			if !g.ground(x, y) {
				return false
			}
		}
	}
	return true
}

// Within appends to dst the walkable cells whose centres lie within radius of
// (x, y), row by row (FS-KE075 §D R25).
func (g *Grid) Within(dst []int, x, y, radius float64) []int {
	c0, r0 := max(0, int(math.Floor((x-radius)/g.size))), max(0, int(math.Floor((y-radius)/g.size)))
	c1, r1 := min(g.cols-1, int(math.Floor((x+radius)/g.size))), min(g.rows-1, int(math.Floor((y+radius)/g.size)))
	for cy := r0; cy <= r1; cy++ {
		for cx := c0; cx <= c1; cx++ {
			c := cy*g.cols + cx
			if !g.walkable[c] {
				continue
			}
			centreX, centreY := g.Centre(c)
			if math.Hypot(centreX-x, centreY-y) <= radius {
				dst = append(dst, c)
			}
		}
	}
	return dst
}

// ground is whether the cell at column x, row y is on the grid and walkable.
func (g *Grid) ground(x, y int) bool {
	return x >= 0 && y >= 0 && x < g.cols && y < g.rows && g.walkable[y*g.cols+x]
}

// valid is whether cell is on the grid and walkable.
func (g *Grid) valid(cell int) bool {
	return cell >= 0 && cell < len(g.walkable) && g.walkable[cell]
}
