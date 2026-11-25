package levelgen

import "math/rand/v2"

/**
* A room's shape is the set of cells of its rect that are cut: not walkable,
* shell where they touch the room's floor (FS-KE075 §Change: Room variety
* R68-R74). The room's floor is its rect less its cuts, less any cell left
* with no way to the room's centre, and the cells a corridor carves are never
* cut. Server-only, as the roles are: the client sees the floor's cells and
* the walls.
**/

// RoomShape names which cells of a room's rect are cut. An L names the corner
// its notch is cut from.
type RoomShape string

const (
	ShapeRectangle  RoomShape = "rectangle"
	ShapeLNorthWest RoomShape = "l_nw"
	ShapeLNorthEast RoomShape = "l_ne"
	ShapeLSouthWest RoomShape = "l_sw"
	ShapeLSouthEast RoomShape = "l_se"
	ShapeCross      RoomShape = "cross"
	ShapePillared   RoomShape = "pillared"
	ShapeCutCorners RoomShape = "cut_corners"
)

// lShapes are the four L shapes, one per notched corner, drawn evenly.
var lShapes = []RoomShape{ShapeLNorthWest, ShapeLNorthEast, ShapeLSouthWest, ShapeLSouthEast}

// shapeDraw is each shape's weight among those a room may take (R71); an L's
// weight is shared by its four corners.
var shapeDraw = []struct {
	shape  RoomShape
	weight int
}{
	{ShapeRectangle, 30},
	{ShapeLNorthWest, 20},
	{ShapeCross, 15},
	{ShapePillared, 15},
	{ShapeCutCorners, 20},
}

// isL reports whether s is one of the L shapes.
func (s RoomShape) isL() bool {
	switch s {
	case ShapeLNorthWest, ShapeLNorthEast, ShapeLSouthWest, ShapeLSouthEast:
		return true
	}
	return false
}

// Fits reports whether a room of w x h cells may take s (R70): an L and cut
// corners at least 5 x 5, a cross 6 x 6, pillared 7 x 6, a hall; a
// rectangle anything.
func (s RoomShape) Fits(w, h int) bool {
	switch {
	case s == ShapeRectangle:
		return true
	case s.isL(), s == ShapeCutCorners:
		return w >= 5 && h >= 5
	case s == ShapeCross:
		return w >= 6 && h >= 6
	case s == ShapePillared:
		return w >= 7 && h >= 6
	}
	return false
}

// shapeCuts lists the cells s cuts from a w x h room, in the room's own cells,
// (0, 0) its top-left, row by row (R69). None for a shape the size does not
// fit.
func shapeCuts(s RoomShape, w, h int) []Cell {
	if !s.Fits(w, h) {
		return nil
	}
	cut := make([]bool, w*h)
	block := func(x0, y0, bw, bh int) {
		for y := y0; y < y0+bh; y++ {
			for x := x0; x < x0+bw; x++ {
				cut[y*w+x] = true
			}
		}
	}
	switch {
	case s.isL():
		bw, bh := (w-1)/2, (h-1)/2
		x0, y0 := 0, 0
		if s == ShapeLNorthEast || s == ShapeLSouthEast {
			x0 = w - bw
		}
		if s == ShapeLSouthWest || s == ShapeLSouthEast {
			y0 = h - bh
		}
		block(x0, y0, bw, bh)
	case s == ShapeCross:
		bw, bh := w/3, h/3
		block(0, 0, bw, bh)
		block(w-bw, 0, bw, bh)
		block(0, h-bh, bw, bh)
		block(w-bw, h-bh, bw, bh)
	case s == ShapePillared:
		at := func(side int) [2]int {
			if side <= 6 {
				return [2]int{1, side - 2}
			}
			return [2]int{2, side - 3}
		}
		for _, x := range at(w) {
			for _, y := range at(h) {
				block(x, y, 1, 1)
			}
		}
	case s == ShapeCutCorners:
		for _, c := range [4][2]int{{0, 0}, {w - 1, 0}, {0, h - 1}, {w - 1, h - 1}} {
			block(c[0], c[1], 1, 1)
			if w >= 6 && h >= 6 {
				dx, dy := 1, 1
				if c[0] > 0 {
					dx = -1
				}
				if c[1] > 0 {
					dy = -1
				}
				block(c[0]+dx, c[1], 1, 1)
				block(c[0], c[1]+dy, 1, 1)
			}
		}
	}
	var out []Cell
	for i, c := range cut {
		if c {
			out = append(out, Cell{X: i % w, Y: i / w})
		}
	}
	return out
}

// drawShape draws a w x h room's shape from those it may take, by weight
// (R71).
func drawShape(rng *rand.Rand, w, h int) RoomShape {
	total := 0
	for _, d := range shapeDraw {
		if d.shape.Fits(w, h) {
			total += d.weight
		}
	}
	pick := rng.IntN(total)
	for _, d := range shapeDraw {
		if !d.shape.Fits(w, h) {
			continue
		}
		if pick < d.weight {
			if d.shape.isL() {
				return lShapes[rng.IntN(len(lShapes))]
			}
			return d.shape
		}
		pick -= d.weight
	}
	return ShapeRectangle
}

// drawShapes draws every room's shape, in room order: the rooms in fixed
// rectangular keep the rectangle and draw nothing (R72).
func drawShapes(rng *rand.Rand, rects []CellRect, rectangular map[int]bool) []RoomShape {
	shapes := make([]RoomShape, len(rects))
	for i, r := range rects {
		shapes[i] = ShapeRectangle
		if !rectangular[i] {
			shapes[i] = drawShape(rng, r.W, r.H)
		}
	}
	return shapes
}

/**
* roomFloors lays every room's floor on the grid (R73): its rect less its
* shape's cuts, a cell a corridor carved never cut, then only the cells
* 4-connected to the room's centre within the rect. A rect cell left out is
* cut, or, when a corridor carved it, a corridor cell. floor[c] is the room
* index + 1 of the room whose floor c is, 0 for none; cut[c] says c was cut.
* carved marks every cell a corridor carved.
**/
func roomFloors(cols, rows int, rects []CellRect, shapes []RoomShape, carved []bool) (floor []int, cut []bool) {
	floor = make([]int, len(carved))
	cut = make([]bool, len(carved))
	for i, r := range rects {
		for _, c := range shapeCuts(shapes[i], r.W, r.H) {
			if at := (r.Y+c.Y)*cols + r.X + c.X; !carved[at] {
				cut[at] = true
			}
		}
		// the room's floor, the centre's walk inside the rect
		inRect := func(c int) bool {
			x, y := c%cols, c/cols
			return x >= r.X && x < r.X+r.W && y >= r.Y && y < r.Y+r.H && !cut[c]
		}
		from := centreIndex(cols, r)
		floor[from] = i + 1
		for queue := []int{from}; len(queue) > 0; queue = queue[1:] {
			c := queue[0]
			for _, n := range neighbours4(cols, rows, c) {
				if inRect(n) && floor[n] == 0 {
					floor[n] = i + 1
					queue = append(queue, n)
				}
			}
		}
		for _, c := range rectCells(cols, r) {
			if floor[c] == 0 && !carved[c] {
				cut[c] = true
			}
		}
	}
	return floor, cut
}
