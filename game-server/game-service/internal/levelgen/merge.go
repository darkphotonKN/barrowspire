package levelgen

import "sort"

// run is a horizontal span of wall cells [x0, x1) open as a rect since row y0.
type run struct {
	x0, x1, y0 int
}

// mergeWalls merges the wall cells of a row-major mask into axis-aligned rects
// in px: each row splits into runs, and a run identical to one in the row above
// extends that rect downward. Rects are ordered by top, then left.
func mergeWalls(cols, rows int, wall []bool, cell float64) []Rect {
	var rects []Rect
	closeRun := func(r run, y int) {
		rects = append(rects, Rect{
			X: float64(r.x0) * cell,
			Y: float64(r.y0) * cell,
			W: float64(r.x1-r.x0) * cell,
			H: float64(y-r.y0) * cell,
		})
	}

	var open []run
	for y := 0; y < rows; y++ {
		var next []run
		i := 0 // open runs are sorted by x0, as are this row's runs
		for x := 0; x < cols; {
			if !wall[y*cols+x] {
				x++
				continue
			}
			x0 := x
			for x < cols && wall[y*cols+x] {
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
