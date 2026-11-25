package navigation

import "math"

/*
NearestAcross is the walkable cell whose centre lies nearest (x, y) among
those reached from (x, y)'s cell across crossable cells: a 4-neighbour search
outward over the cells that are not walkable but crossable (a chasm's shut
pits, judged by their centre in px), stopping at the first walkable cell on
each way out, never through rock. Ties go to the lower cell. A point on a
walkable cell is that cell. False off the grid, on rock that is not
crossable, or when no walkable cell is reached (FS-X2CMM §J R51: a delver
whose afloat ends over a pit is set down on the bank the pit reaches, never
one behind a wall).
*/
func (g *Grid) NearestAcross(x, y float64, crossable func(x, y float64) bool) (int, bool) {
	cx, cy := int(math.Floor(x/g.size)), int(math.Floor(y/g.size))
	if cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows {
		return 0, false
	}
	from := cy*g.cols + cx
	if g.walkable[from] {
		return from, true
	}
	if !crossable(g.Centre(from)) {
		return 0, false
	}

	best, bestD := -1, math.Inf(1)
	seen := map[int]bool{from: true}
	queue := []int{from}
	for i := 0; i < len(queue); i++ {
		c := queue[i]
		col, row := c%g.cols, c/g.cols
		for _, n := range [4][2]int{{col + 1, row}, {col - 1, row}, {col, row + 1}, {col, row - 1}} {
			if n[0] < 0 || n[1] < 0 || n[0] >= g.cols || n[1] >= g.rows {
				continue
			}
			next := n[1]*g.cols + n[0]
			if seen[next] {
				continue
			}
			seen[next] = true
			centreX, centreY := g.Centre(next)
			switch {
			case g.walkable[next]:
				if d := math.Hypot(centreX-x, centreY-y); d < bestD || d == bestD && next < best {
					best, bestD = next, d
				}
			case crossable(centreX, centreY):
				queue = append(queue, next)
			}
		}
	}
	return best, best >= 0
}
