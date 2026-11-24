package levelgen

import "slices"

// A Chasm needs a stairs room at least chasmDepth cells deep from its doorway
// wall and chasmWidth cells wide along it (FS-5FZ4J §E R33).
const (
	chasmDepth = 6
	chasmWidth = 5
)

// BarredRoom is a dead-end room: entered through exactly one corridor and shut
// off from the start room by a barrier one cell thick across that corridor's
// full width, on the corridor cells next to the room's doorway. The stairs
// room stands behind its gate (FS-5FZ4J §A R2, R4), a hidden room behind its
// secret door (§F R36). The layout names where the barrier goes; laying it is
// the floor build's.
type BarredRoom struct {
	// Room is an index into the layout's Rooms.
	Room int `json:"room"`
	// Barrier is the barrier's cells, every one a corridor cell: one cell
	// thick (W or H is 1) and as long as the corridor is wide.
	Barrier CellRect `json:"barrier"`
	// BarrierSegments are Barrier's cells by the corridor segment that holds
	// them, by region id: what a floor map cuts out of a segment to hide a
	// secret door (§F R37).
	BarrierSegments []SegmentCells `json:"barrier_segments"`
}

// SegmentCells is some of one corridor segment's cells.
type SegmentCells struct {
	// Region is the corridor segment's region id.
	Region int `json:"region"`
	// Cells are its cells, row by row.
	Cells []Cell `json:"cells"`
}

// chasmCapable reports whether a barred room can take a Chasm: at least
// chasmDepth cells deep from its doorway wall and chasmWidth wide along it. A
// barrier in a column stands on a west or east wall, so the room's depth is
// its width.
func chasmCapable(room, barrier CellRect) bool {
	depth, width := room.H, room.W
	if barrier.W == 1 && barrier.H > 1 {
		depth, width = room.W, room.H
	}
	return depth >= chasmDepth && width >= chasmWidth
}

/**
* barrierOf is room's barrier when the room is a dead end on open: exactly one
* edge joins it, the corridor cells 4-adjacent to it form one straight,
* unbroken run as long as that edge is wide, and with those cells shut the walk
* from cell from reaches every walkable cell but the room's and the barrier's,
* and none of the room's. A room a corridor runs through or alongside, or one a
* second corridor reaches, is no dead end.
**/
func barrierOf(cols, rows int, rooms []CellRect, edges []Edge, open []bool, room, from int) (CellRect, bool) {
	width, joined := 0, 0
	for _, e := range edges {
		if e.A == room || e.B == room {
			width = e.Width
			joined++
		}
	}
	if joined != 1 {
		return CellRect{}, false
	}
	run, ok := doorwayRun(cols, rows, rooms, open, room)
	if !ok || run.W*run.H != width {
		return CellRect{}, false
	}
	if !barredOff(cols, rows, open, from, rooms, []BarredRoom{{Room: room, Barrier: run}}) {
		return CellRect{}, false
	}
	return run, true
}

// doorwayRun is the rect of the corridor cells 4-adjacent to rooms[room] when
// they form one straight, unbroken run; false when they do not or there are none.
func doorwayRun(cols, rows int, rooms []CellRect, open []bool, room int) (CellRect, bool) {
	inRoom := func(c int) bool {
		x, y := c%cols, c/cols
		for _, r := range rooms {
			if x >= r.X && x < r.X+r.W && y >= r.Y && y < r.Y+r.H {
				return true
			}
		}
		return false
	}
	seen := map[int]bool{}
	x0, y0, x1, y1 := cols, rows, -1, -1
	for _, c := range rectCells(cols, rooms[room]) {
		for _, n := range neighbours4(cols, rows, c) {
			if !open[n] || inRoom(n) || seen[n] {
				continue
			}
			seen[n] = true
			x, y := n%cols, n/cols
			x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
		}
	}
	r := CellRect{X: x0, Y: y0, W: x1 - x0 + 1, H: y1 - y0 + 1}
	if len(seen) == 0 || (r.W != 1 && r.H != 1) || r.W*r.H != len(seen) {
		return CellRect{}, false
	}
	return r, true
}

/**
* barredOff reports whether, with every barrier shut, the walk from cell from
* reaches every walkable cell outside the barred rooms and their barriers, and
* no cell of a barred room (FS-5FZ4J §A R8): each barrier cuts off its own room
* and nothing else.
**/
func barredOff(cols, rows int, open []bool, from int, rooms []CellRect, barred []BarredRoom) bool {
	shut := make([]bool, len(open))
	behind := make([]bool, len(open))
	for _, b := range barred {
		for _, c := range rectCells(cols, b.Barrier) {
			shut[c] = true
		}
		for _, c := range rectCells(cols, rooms[b.Room]) {
			behind[c] = true
		}
	}
	walk := make([]bool, len(open))
	for c := range open {
		walk[c] = open[c] && !shut[c]
	}
	if !walk[from] {
		return false
	}
	dist := walkDistances(cols, rows, walk, from)
	for c := range open {
		switch {
		case behind[c] && dist[c] >= 0:
			return false
		case walk[c] && !behind[c] && dist[c] < 0:
			return false
		}
	}
	return true
}

// barrableRooms lists every room but start that is a dead end on open, the
// rooms a barrier could shut, by room index.
func barrableRooms(cols, rows int, rooms []CellRect, edges []Edge, open []bool, start int) []BarredRoom {
	from := centreIndex(cols, rooms[start])
	var out []BarredRoom
	for i := range rooms {
		if i == start {
			continue
		}
		if barrier, ok := barrierOf(cols, rows, rooms, edges, open, i, from); ok {
			out = append(out, BarredRoom{Room: i, Barrier: barrier})
		}
	}
	return out
}

// withBarrierSegments is b with its BarrierSegments filled from grid, each
// cell's region id.
func withBarrierSegments(cols int, grid []int, b BarredRoom) BarredRoom {
	by := map[int][]Cell{}
	for _, c := range rectCells(cols, b.Barrier) {
		by[grid[c]] = append(by[grid[c]], Cell{X: c % cols, Y: c / cols})
	}
	b.BarrierSegments = make([]SegmentCells, 0, len(by))
	for region, cells := range by {
		b.BarrierSegments = append(b.BarrierSegments, SegmentCells{Region: region, Cells: cells})
	}
	slices.SortFunc(b.BarrierSegments, func(x, y SegmentCells) int { return x.Region - y.Region })
	return b
}

// centreIndex is r's centre cell's index on a grid cols wide.
func centreIndex(cols int, r CellRect) int { c := r.centre(); return c.Y*cols + c.X }
