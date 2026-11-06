package levelgen

import "sort"

// run is a horizontal span of wall cells [x0, x1) open as a rect since row y0.
type run struct {
	x0, x1, y0 int
}

// mergeWalls merges the wall cells of a row-major mask into axis-aligned rects
// in px, ordered by top, then left (see mergeCells).
func mergeWalls(cols, rows int, wall []bool, cell float64) []Rect {
	cells := mergeCells(cols, rows, wall)
	if len(cells) == 0 {
		return nil
	}
	rects := make([]Rect, len(cells))
	for i, c := range cells {
		rects[i] = Rect{
			X: float64(c.X) * cell,
			Y: float64(c.Y) * cell,
			W: float64(c.W) * cell,
			H: float64(c.H) * cell,
		}
	}
	return rects
}

// mergeCells merges the set cells of a row-major mask into axis-aligned rects
// in cells: each row splits into runs, and a run identical to one in the row
// above extends that rect downward. The rects cover the set cells exactly once
// and are ordered by top, then left.
func mergeCells(cols, rows int, mask []bool) []CellRect {
	var rects []CellRect
	closeRun := func(r run, y int) {
		rects = append(rects, CellRect{X: r.x0, Y: r.y0, W: r.x1 - r.x0, H: y - r.y0})
	}

	var open []run
	for y := 0; y < rows; y++ {
		var next []run
		i := 0 // open runs are sorted by x0, as are this row's runs
		for x := 0; x < cols; {
			if !mask[y*cols+x] {
				x++
				continue
			}
			x0 := x
			for x < cols && mask[y*cols+x] {
				x++
			}
			for i < len(open) && open[i].x0 < x0 {
				closeRun(open[i], y)
				i++
			}
			if i < len(open) && open[i].x0 == x0 && open[i].x1 == x {
				next = append(next, open[i])
				i++
				continue
			}
			next = append(next, run{x0: x0, x1: x, y0: y})
		}
		for ; i < len(open); i++ {
			closeRun(open[i], y)
		}
		open = next
	}
	for _, r := range open {
		closeRun(r, rows)
	}

	sort.Slice(rects, func(a, b int) bool {
		if rects[a].Y != rects[b].Y {
			return rects[a].Y < rects[b].Y
		}
		return rects[a].X < rects[b].X
	})
	return rects
}
