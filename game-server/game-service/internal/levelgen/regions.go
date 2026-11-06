package levelgen

// buildRegions numbers the walkable cells into regions (FS-KE075 §A.5): room i
// is region i+1, its rect; the corridor cells (walkable, outside every room)
// follow as corridor segments, each described as merged cell rects.
func buildRegions(cols, rows int, rooms []CellRect, corridor []bool, segmentMax int) []Region {
	regions := make([]Region, 0, len(rooms))
	for i, r := range rooms {
		regions = append(regions, Region{ID: i + 1, Kind: RegionRoom, Cells: []CellRect{r}})
	}
	mask := make([]bool, cols*rows)
	for _, seg := range corridorSegments(cols, rows, corridor, segmentMax) {
		for _, c := range seg {
			mask[c] = true
		}
		regions = append(regions, Region{
			ID:    len(regions) + 1,
			Kind:  RegionCorridor,
			Cells: mergeCells(cols, rows, mask),
		})
		for _, c := range seg {
			mask[c] = false
		}
	}
	return regions
}

// corridorSegments cuts the corridor cells into 4-connected segments whose
// bounding box is at most maxSide cells on its longer side. Each segment
// starts at the first unassigned corridor cell in row order and grows by
// breadth-first search, taking a 4-neighbour only while the box stays in
// bounds; a neighbour it cannot take seeds a later segment. Segments come in
// the order they start, their cells in the order they were taken.
func corridorSegments(cols, rows int, corridor []bool, maxSide int) [][]int {
	taken := make([]bool, len(corridor))
	var segs [][]int
	for seed := range corridor {
		if !corridor[seed] || taken[seed] {
			continue
		}
		taken[seed] = true
		x0, y0 := seed%cols, seed/cols
		x1, y1 := x0, y0
		seg := []int{seed}
		for i := 0; i < len(seg); i++ {
			for _, n := range neighbours4(cols, rows, seg[i]) {
				if !corridor[n] || taken[n] {
					continue
				}
				nx, ny := n%cols, n/cols
				bx0, by0, bx1, by1 := min(x0, nx), min(y0, ny), max(x1, nx), max(y1, ny)
				if bx1-bx0+1 > maxSide || by1-by0+1 > maxSide {
					continue
				}
				taken[n] = true
				x0, y0, x1, y1 = bx0, by0, bx1, by1
				seg = append(seg, n)
			}
		}
		segs = append(segs, seg)
	}
	return segs
}

// roomDoorways lists room's cells 4-adjacent to a corridor cell, row by row
// (FS-KE075 §A.6).
func roomDoorways(cols, rows int, room CellRect, corridor []bool) []Cell {
	var out []Cell
	for _, c := range rectCells(cols, room) {
		for _, n := range neighbours4(cols, rows, c) {
			if corridor[n] {
				out = append(out, Cell{X: c % cols, Y: c / cols})
				break
			}
		}
	}
	return out
}

// shellCells marks the shell (FS-KE075 §A.7): every non-walkable cell
// 8-adjacent to a walkable one. The shell is closed on diagonals, so the rock
// beyond it, the void, is never reached and needs no wall.
func shellCells(cols, rows int, open []bool) []bool {
	shell := make([]bool, len(open))
	for c := range open {
		if open[c] {
			continue
		}
		cx, cy := c%cols, c/cols
	near:
		for y := max(0, cy-1); y <= min(rows-1, cy+1); y++ {
			for x := max(0, cx-1); x <= min(cols-1, cx+1); x++ {
				if open[y*cols+x] {
					shell[c] = true
					break near
				}
			}
		}
	}
	return shell
}
