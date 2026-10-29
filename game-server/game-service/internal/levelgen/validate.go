package levelgen

import (
	"errors"
	"fmt"
	"math"
)

// errInvalidLayout marks a layout that breaks a rule; Generate retries on it.
var errInvalidLayout = errors.New("invalid layout")

// validate checks l against every layout rule for p (FS-3QHQZ R6), using only
// the layout itself: reachability, clearings, wall tiling and budget, border,
// no loops, gap, trail tree shape and main-trail span.
func validate(p Params, l Layout) error {
	bad := func(format string, args ...any) error {
		return fmt.Errorf("%w: %s", errInvalidLayout, fmt.Sprintf(format, args...))
	}
	cols, rows, cell := p.Cols, p.Rows, p.CellSize
	if l.Bounds != (Size{W: float64(cols) * cell, H: float64(rows) * cell}) {
		return bad("bounds %+v do not match a %dx%d map", l.Bounds, cols, rows)
	}

	open := make([]bool, cols*rows)
	for _, pt := range l.Open {
		c, ok := cellAt(p, pt)
		if !ok || open[c] {
			return bad("open point %+v is off the grid or repeated", pt)
		}
		open[c] = true
	}

	if err := checkWalls(p, l.Walls, open); err != nil {
		return bad("walls: %v", err)
	}
	if len(l.Trails) == 0 {
		return bad("no main trail")
	}
	mouth, err := mouthCells(p, l.Entrance, open)
	if err != nil {
		return bad("border: %v", err)
	}
	if n := reachable(p, mouth, open); n != len(l.Open) {
		return bad("%d of %d open cells are unreachable from the mouth", len(l.Open)-n, len(l.Open))
	}
	if !wallsReachEdge(p, open) {
		return bad("trails close a loop around wall")
	}
	if err := checkGap(p, open); err != nil {
		return bad("gap: %v", err)
	}
	if err := checkTrails(p, l, open); err != nil {
		return bad("trails: %v", err)
	}
	if share := mainCoverage(p, l.Trails[0].Points); share < p.SpanShare {
		return bad("main trail covers %.3f of the span, want >= %.3f", share, p.SpanShare)
	}
	return nil
}

// checkWalls requires the rects to be cell-aligned, inside the bounds, within
// budget, and to cover every uncarved cell exactly once and no open cell.
func checkWalls(p Params, walls []Rect, open []bool) error {
	if len(walls) > p.WallBudget {
		return fmt.Errorf("%d rects exceed the budget of %d", len(walls), p.WallBudget)
	}
	cover := make([]int, len(open))
	for _, r := range walls {
		x0, ok0 := cellIndex(r.X, p.CellSize)
		y0, ok1 := cellIndex(r.Y, p.CellSize)
		x1, ok2 := cellIndex(r.X+r.W, p.CellSize)
		y1, ok3 := cellIndex(r.Y+r.H, p.CellSize)
		if !ok0 || !ok1 || !ok2 || !ok3 || x0 < 0 || y0 < 0 || x1 > p.Cols || y1 > p.Rows || x1 <= x0 || y1 <= y0 {
			return fmt.Errorf("rect %+v is off the cell grid or outside the bounds", r)
		}
		for y := y0; y < y1; y++ {
			for x := x0; x < x1; x++ {
				cover[y*p.Cols+x]++
			}
		}
	}
	for c, n := range cover {
		switch {
		case open[c] && n > 0:
			return fmt.Errorf("a rect covers open cell %d", c)
		case !open[c] && n != 1:
			return fmt.Errorf("uncarved cell %d is covered %d times", c, n)
		}
	}
	return nil
}

// mouthCells requires the border to be solid except across the mouth, which
// must be fully open, and returns the mouth's cells.
func mouthCells(p Params, e Entrance, open []bool) ([]int, error) {
	if e.Side != p.Entrance {
		return nil, fmt.Errorf("entrance side %q, want %q", e.Side, p.Entrance)
	}
	half := float64(p.TrailWidth) / 2 * p.CellSize
	var mouth []int
	for c := range open {
		x, y := c%p.Cols, c/p.Cols
		var inBand bool
		var along, at float64
		switch p.Entrance {
		case SideNorth:
			inBand, along, at = y < p.Border, cellMid(x, p.CellSize), e.At.X
		case SideSouth:
			inBand, along, at = y >= p.Rows-p.Border, cellMid(x, p.CellSize), e.At.X
		case SideWest:
			inBand, along, at = x < p.Border, cellMid(y, p.CellSize), e.At.Y
		default:
			inBand, along, at = x >= p.Cols-p.Border, cellMid(y, p.CellSize), e.At.Y
		}
		isMouth := inBand && math.Abs(along-at) < half
		onBorder := x < p.Border || y < p.Border || x >= p.Cols-p.Border || y >= p.Rows-p.Border
		switch {
		case isMouth && !open[c]:
			return nil, fmt.Errorf("mouth cell %d is wall", c)
		case isMouth:
			mouth = append(mouth, c)
		case onBorder && open[c]:
			return nil, fmt.Errorf("border cell %d is open outside the mouth", c)
		}
	}
	if len(mouth) == 0 {
		return nil, errors.New("no mouth")
	}
	return mouth, nil
}

// reachable counts the open cells 4-connected to the start cells.
func reachable(p Params, start []int, open []bool) int {
	seen := make([]bool, len(open))
	queue := append([]int(nil), start...)
	for _, c := range start {
		seen[c] = true
	}
	for i := 0; i < len(queue); i++ {
		for _, n := range neighbours4(p, queue[i]) {
			if open[n] && !seen[n] {
				seen[n] = true
				queue = append(queue, n)
			}
		}
	}
	return len(queue)
}

// wallsReachEdge reports whether every wall cell is 8-connected through wall
// to the map edge. A wall cell cut off from the edge sits inside a loop of
// open cells, so this holds exactly when the trail network has no loops.
func wallsReachEdge(p Params, open []bool) bool {
	seen := make([]bool, len(open))
	var queue []int
	walls := 0
	for c := range open {
		if open[c] {
			continue
		}
		walls++
		x, y := c%p.Cols, c/p.Cols
		if x == 0 || y == 0 || x == p.Cols-1 || y == p.Rows-1 {
			seen[c] = true
			queue = append(queue, c)
		}
	}
	for i := 0; i < len(queue); i++ {
		cx, cy := queue[i]%p.Cols, queue[i]/p.Cols
		for y := max(0, cy-1); y <= min(p.Rows-1, cy+1); y++ {
			for x := max(0, cx-1); x <= min(p.Cols-1, cx+1); x++ {
				if n := y*p.Cols + x; !open[n] && !seen[n] {
					seen[n] = true
					queue = append(queue, n)
				}
			}
		}
	}
	return len(queue) == walls
}

// checkGap requires any two open cells closer than Gap+1 cells to be joined
// locally: a short open path links them. Two segments that are not joined
// only meet through the rest of the tree, far longer than that.
func checkGap(p Params, open []bool) error {
	limit := 2 * (p.Gap + 1)
	dist := make([]int, len(open))
	for c := range open {
		if !open[c] {
			continue
		}
		for i := range dist {
			dist[i] = -1
		}
		dist[c] = 0
		queue := []int{c}
		for i := 0; i < len(queue); i++ {
			if dist[queue[i]] == limit {
				continue
			}
			for _, n := range neighbours4(p, queue[i]) {
				if open[n] && dist[n] < 0 {
					dist[n] = dist[queue[i]] + 1
					queue = append(queue, n)
				}
			}
		}
		cx, cy := c%p.Cols, c/p.Cols
		for y := max(0, cy-p.Gap); y <= min(p.Rows-1, cy+p.Gap); y++ {
			for x := max(0, cx-p.Gap); x <= min(p.Cols-1, cx+p.Gap); x++ {
				if n := y*p.Cols + x; open[n] && dist[n] < 0 {
					return fmt.Errorf("open cells %d and %d are within %d cells but not joined", c, n, p.Gap)
				}
			}
		}
	}
	return nil
}

// checkTrails requires a main trail then branches that each sprout from an
// earlier trail within the depth limit, a branch count in range, and one
// clearing per dead end, carved in full.
func checkTrails(p Params, l Layout, open []bool) error {
	depth := make([]int, len(l.Trails))
	for i, t := range l.Trails {
		switch {
		case len(t.Points) == 0:
			return fmt.Errorf("trail %d is empty", i)
		case i == 0 && t.Parent != -1:
			return fmt.Errorf("main trail has parent %d", t.Parent)
		case i > 0 && (t.Parent < 0 || t.Parent >= i):
			return fmt.Errorf("trail %d has parent %d", i, t.Parent)
		}
		if i > 0 {
			depth[i] = depth[t.Parent] + 1
		}
		if depth[i] > p.MaxBranchDepth {
			return fmt.Errorf("trail %d is %d forks deep, max %d", i, depth[i], p.MaxBranchDepth)
		}
		for _, pt := range t.Points {
			// An even trail width puts a step's centre on a cell corner; nudge
			// up-left so it lands in a cell of that step's block.
			if c, ok := cellAt(p, Point{X: pt.X - 1, Y: pt.Y - 1}); !ok || !open[c] {
				return fmt.Errorf("trail %d point %+v is not on open ground", i, pt)
			}
		}
	}
	if b := len(l.Trails) - 1; b < p.Branches.Min || b > p.Branches.Max {
		return fmt.Errorf("%d branches, want %d..%d", b, p.Branches.Min, p.Branches.Max)
	}

	if len(l.DeadEnds) != len(l.Trails) {
		return fmt.Errorf("%d dead ends for %d trails", len(l.DeadEnds), len(l.Trails))
	}
	for i, d := range l.DeadEnds {
		pts := l.Trails[i].Points
		want := DeadEnd{
			Center: pts[len(pts)-1],
			Radius: float64(p.ClearingRadius) * p.CellSize,
			Trail:  i,
			Main:   i == 0,
		}
		if d != want {
			return fmt.Errorf("dead end %d is %+v, want %+v", i, d, want)
		}
		for _, c := range clearingCells(p, d.Center) {
			if !open[c] {
				return fmt.Errorf("clearing %d leaves cell %d uncarved", i, c)
			}
		}
	}
	return nil
}

// clearingCells lists the interior cells whose centres lie within the
// clearing radius of center, row by row.
func clearingCells(p Params, center Point) []int {
	r := float64(p.ClearingRadius)
	cx, cy := center.X/p.CellSize, center.Y/p.CellSize
	var out []int
	for y := max(p.Border, int(math.Floor(cy-r))); y < min(p.Rows-p.Border, int(math.Ceil(cy+r))+1); y++ {
		for x := max(p.Border, int(math.Floor(cx-r))); x < min(p.Cols-p.Border, int(math.Ceil(cx+r))+1); x++ {
			dx, dy := float64(x)+0.5-cx, float64(y)+0.5-cy
			if dx*dx+dy*dy <= r*r {
				out = append(out, y*p.Cols+x)
			}
		}
	}
	return out
}

// mainCoverage is the share of the map's span along the walk axis that the
// main trail's centre line covers, measured from the entrance edge.
func mainCoverage(p Params, pts []Point) float64 {
	w, h := float64(p.Cols)*p.CellSize, float64(p.Rows)*p.CellSize
	best := 0.0
	for _, pt := range pts {
		var d float64
		switch p.Entrance {
		case SideNorth:
			d = pt.Y / h
		case SideSouth:
			d = (h - pt.Y) / h
		case SideWest:
			d = pt.X / w
		default:
			d = (w - pt.X) / w
		}
		best = max(best, d)
	}
	return best
}

func neighbours4(p Params, c int) []int {
	x, y := c%p.Cols, c/p.Cols
	out := make([]int, 0, 4)
	if y > 0 {
		out = append(out, c-p.Cols)
	}
	if x < p.Cols-1 {
		out = append(out, c+1)
	}
	if y < p.Rows-1 {
		out = append(out, c+p.Cols)
	}
	if x > 0 {
		out = append(out, c-1)
	}
	return out
}

// cellCenter is the centre of cell c in px.
func cellCenter(p Params, c int) Point {
	return Point{X: cellMid(c%p.Cols, p.CellSize), Y: cellMid(c/p.Cols, p.CellSize)}
}

func cellMid(i int, cell float64) float64 { return (float64(i) + 0.5) * cell }

// cellAt is the cell containing pt, if it is on the grid.
func cellAt(p Params, pt Point) (int, bool) {
	x, y := int(math.Floor(pt.X/p.CellSize)), int(math.Floor(pt.Y/p.CellSize))
	if x < 0 || y < 0 || x >= p.Cols || y >= p.Rows {
		return 0, false
	}
	return y*p.Cols + x, true
}

// cellIndex converts a px coordinate on a cell boundary to its cell index.
func cellIndex(v, cell float64) (int, bool) {
	i := math.Round(v / cell)
	return int(i), math.Abs(i*cell-v) < 1e-9
}
