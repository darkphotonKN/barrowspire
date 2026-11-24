package levelgen

import (
	"fmt"
	"reflect"
	"slices"
)

// validateDungeon checks l against every dungeon layout rule for p (FS-KE075
// §A.3–8, §B.12), re-deriving each from the layout itself: grid, rooms,
// connection graph and corridors, regions, edge ring, walls, doorways,
// reachability and roles.
func validateDungeon(p DungeonParams, l DungeonLayout) error {
	bad := func(format string, args ...any) error {
		return fmt.Errorf("%w: %s", errInvalidLayout, fmt.Sprintf(format, args...))
	}
	cols, rows := p.Cols, p.Rows
	if l.Cols != cols || l.Rows != rows || l.CellSize != p.CellSize ||
		l.Bounds != (Size{W: float64(cols) * p.CellSize, H: float64(rows) * p.CellSize}) {
		return bad("grid %dx%d of %v px, bounds %+v, do not match the params", l.Cols, l.Rows, l.CellSize, l.Bounds)
	}

	rects := make([]CellRect, len(l.Rooms))
	for i, room := range l.Rooms {
		rects[i] = room.Rect
	}
	if err := checkRooms(p, rects); err != nil {
		return bad("rooms: %v", err)
	}
	if err := checkEdges(p, rects, l.Edges); err != nil {
		return bad("edges: %v", err)
	}

	grid, err := regionGrid(p, l)
	if err != nil {
		return bad("regions: %v", err)
	}
	open := make([]bool, len(grid))
	carved := make([]bool, len(grid))
	for c, id := range grid {
		open[c] = id > 0
	}
	for _, r := range rects {
		for _, c := range rectCells(cols, r) {
			carved[c] = true
		}
	}
	for i, e := range l.Edges {
		for _, c := range corridorCells(cols, rects[e.A], rects[e.B], e.Width, e.HorizontalFirst) {
			if c < 0 || c >= len(carved) {
				return bad("edge %d carves off the grid", i)
			}
			carved[c] = true
		}
	}
	if !reflect.DeepEqual(open, carved) {
		return bad("the regions do not cover exactly the rooms and carved corridors")
	}
	if err := checkOpenCells(p, open, grid, len(rects)); err != nil {
		return bad("walkable cells: %v", err)
	}

	if err := checkShell(p, l.Walls, open); err != nil {
		return bad("walls: %v", err)
	}

	corridor := make([]bool, len(grid))
	for c, id := range grid {
		corridor[c] = id > len(rects)
	}
	for i, room := range l.Rooms {
		want := roomDoorways(cols, rows, room.Rect, corridor)
		switch {
		case room.Region != i+1:
			return bad("room %d names region %d, want %d", i, room.Region, i+1)
		case len(want) == 0:
			return bad("room %d has no doorway", i)
		case !reflect.DeepEqual(room.Doorways, want):
			return bad("room %d doorways %v, want %v", i, room.Doorways, want)
		}
	}

	if err := checkRoles(p, l, rects, open); err != nil {
		return bad("roles: %v", err)
	}
	if err := checkBarred(p, l, rects, open, grid); err != nil {
		return bad("barred rooms: %v", err)
	}
	start := rects[l.Roles.Start].centre()
	walkable := 0
	for _, o := range open {
		if o {
			walkable++
		}
	}
	if n := reachable(cols, rows, []int{start.Y*cols + start.X}, open); n != walkable {
		return bad("%d of %d walkable cells are unreachable from the start room", walkable-n, walkable)
	}
	return nil
}

// checkRooms requires the room count, every size and the edge margin in range,
// and every two rooms at least RoomGap apart.
func checkRooms(p DungeonParams, rooms []CellRect) error {
	if n := len(rooms); n < p.Rooms.Min || n > p.Rooms.Max {
		return fmt.Errorf("%d rooms, want %d..%d", n, p.Rooms.Min, p.Rooms.Max)
	}
	m := p.EdgeMargin
	for i, r := range rooms {
		switch {
		case r.W < p.RoomWidth.Min || r.W > p.RoomWidth.Max || r.H < p.RoomHeight.Min || r.H > p.RoomHeight.Max:
			return fmt.Errorf("room %d is %dx%d, want %d..%d x %d..%d", i, r.W, r.H,
				p.RoomWidth.Min, p.RoomWidth.Max, p.RoomHeight.Min, p.RoomHeight.Max)
		case r.X < m || r.Y < m || r.X+r.W > p.Cols-m || r.Y+r.H > p.Rows-m:
			return fmt.Errorf("room %d %+v is inside the %d-cell edge margin", i, r, m)
		}
		for j := range i {
			if !apart(r, rooms[j], p.RoomGap) {
				return fmt.Errorf("rooms %d and %d are closer than %d cells", j, i, p.RoomGap)
			}
		}
	}
	return nil
}

// checkEdges requires the connection graph to be exactly the spanning tree,
// then round(ExtraEdgeShare x rooms) extra pairs taken shortest first from the
// pairs not in the tree (some passed over, FS-5FZ4J §A R3), with every
// corridor's width in range.
func checkEdges(p DungeonParams, rooms []CellRect, edges []Edge) error {
	tree, rest := connectionPairs(rooms)
	if want := len(tree) + extraEdges(p, len(rooms)); len(edges) != want {
		return fmt.Errorf("%d edges, want %d (%d tree, %d extra)", len(edges), want, len(tree), extraEdges(p, len(rooms)))
	}
	order := make(map[[2]int]int, len(rest))
	for i, pr := range rest {
		order[pr] = i
	}
	last := -1
	for i, e := range edges {
		isExtra := i >= len(tree)
		pr := [2]int{e.A, e.B}
		switch {
		case e.Extra != isExtra:
			return fmt.Errorf("edge %d extra %v, want %v", i, e.Extra, isExtra)
		case !isExtra && pr != tree[i]:
			return fmt.Errorf("edge %d joins %d-%d, want tree pair %d-%d", i, e.A, e.B, tree[i][0], tree[i][1])
		case e.Width < p.CorridorWidth.Min || e.Width > p.CorridorWidth.Max:
			return fmt.Errorf("edge %d is %d wide, want %d..%d", i, e.Width, p.CorridorWidth.Min, p.CorridorWidth.Max)
		}
		if !isExtra {
			continue
		}
		at, ok := order[pr]
		if !ok || at <= last {
			return fmt.Errorf("extra edge %d joins %d-%d, not the next shortest pair outside the tree", i, e.A, e.B)
		}
		last = at
	}
	return nil
}

// regionGrid requires region ids 1.. in order, rooms first and each exactly
// its room's rect, then corridor segments that are 4-connected, at most
// SegmentMax on the longer side and hold no room cell; no cell in two regions.
// It returns the region id of every cell, 0 for rock.
func regionGrid(p DungeonParams, l DungeonLayout) ([]int, error) {
	cols, rows := p.Cols, p.Rows
	grid := make([]int, cols*rows)
	for i, reg := range l.Regions {
		isRoom := i < len(l.Rooms)
		switch {
		case reg.ID != i+1:
			return nil, fmt.Errorf("region %d has id %d, want %d", i, reg.ID, i+1)
		case isRoom && (reg.Kind != RegionRoom || !reflect.DeepEqual(reg.Cells, []CellRect{l.Rooms[i].Rect})):
			return nil, fmt.Errorf("region %d is not room %d's rect", reg.ID, i)
		case !isRoom && reg.Kind != RegionCorridor:
			return nil, fmt.Errorf("region %d is %q, want a corridor segment", reg.ID, reg.Kind)
		case len(reg.Cells) == 0:
			return nil, fmt.Errorf("region %d has no cells", reg.ID)
		}
		var cells []int
		for _, r := range reg.Cells {
			if r.W <= 0 || r.H <= 0 || r.X < 0 || r.Y < 0 || r.X+r.W > cols || r.Y+r.H > rows {
				return nil, fmt.Errorf("region %d rect %+v is empty or off the grid", reg.ID, r)
			}
			for _, c := range rectCells(cols, r) {
				if grid[c] != 0 {
					return nil, fmt.Errorf("cell (%d, %d) is in regions %d and %d", c%cols, c/cols, grid[c], reg.ID)
				}
				grid[c] = reg.ID
				cells = append(cells, c)
			}
		}
		if isRoom {
			continue
		}
		x0, y0, x1, y1 := cols, rows, -1, -1
		for _, c := range cells {
			x, y := c%cols, c/cols
			x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
		}
		if w, h := x1-x0+1, y1-y0+1; max(w, h) > p.SegmentMax {
			return nil, fmt.Errorf("corridor segment %d spans %dx%d, over %d", reg.ID, w, h, p.SegmentMax)
		}
		in := make([]bool, len(grid))
		for _, c := range cells {
			in[c] = true
		}
		if n := reachable(cols, rows, cells[:1], in); n != len(cells) {
			return nil, fmt.Errorf("corridor segment %d is not 4-connected", reg.ID)
		}
	}
	for _, room := range l.Rooms {
		for _, c := range rectCells(cols, room.Rect) {
			if grid[c] == 0 {
				return nil, fmt.Errorf("a room cell is in no region")
			}
		}
	}
	return grid, nil
}

// checkOpenCells requires no walkable cell on the edge ring and every corridor
// cell inside a fully walkable 2x2 block, so no corridor narrows below two.
func checkOpenCells(p DungeonParams, open []bool, grid []int, rooms int) error {
	cols, rows := p.Cols, p.Rows
	at := func(x, y int) bool { return x >= 0 && y >= 0 && x < cols && y < rows && open[y*cols+x] }
	for c, o := range open {
		if !o {
			continue
		}
		x, y := c%cols, c/cols
		if x == 0 || y == 0 || x == cols-1 || y == rows-1 {
			return fmt.Errorf("cell (%d, %d) is on the edge ring", x, y)
		}
		if grid[c] <= rooms {
			continue
		}
		wide := false
		for _, d := range [4][2]int{{-1, -1}, {0, -1}, {-1, 0}, {0, 0}} {
			bx, by := x+d[0], y+d[1]
			if at(bx, by) && at(bx+1, by) && at(bx, by+1) && at(bx+1, by+1) {
				wide = true
				break
			}
		}
		if !wide {
			return fmt.Errorf("corridor cell (%d, %d) is in no 2x2 walkable block", x, y)
		}
	}
	return nil
}

// checkShell requires the wall rects to cover every shell cell exactly once
// and nothing else: no walkable cell, no void.
func checkShell(p DungeonParams, walls []Rect, open []bool) error {
	cover, err := coverCounts(p.Cols, p.Rows, p.CellSize, walls)
	if err != nil {
		return err
	}
	shell := shellCells(p.Cols, p.Rows, open)
	for c, n := range cover {
		switch {
		case shell[c] && n != 1:
			return fmt.Errorf("shell cell (%d, %d) is covered %d times", c%p.Cols, c/p.Cols, n)
		case !shell[c] && n > 0:
			return fmt.Errorf("a wall covers non-shell cell (%d, %d)", c%p.Cols, c/p.Cols)
		}
	}
	return nil
}

// checkRoles requires every role room to exist, the start room at least
// StartMin a side, the stairs, switch and escape door at or past the median
// distance, the treasure count in range, no room with two roles or a role and
// a barrier, and every room's distance to be the walk from the start; on a
// floor with an escape door, its room the far free room farthest by walk from
// the stairs (FS-5FZ4J §A R7), and on one without, no switch or escape door.
func checkRoles(p DungeonParams, l DungeonLayout, rooms []CellRect, open []bool) error {
	r := l.Roles
	all := append([]int{r.Start, r.Stairs}, r.Treasure...)
	if p.EscapeDoor {
		all = append(all, r.Switch, r.EscapeDoor)
	} else if r.Switch != noRoom || r.EscapeDoor != noRoom {
		return fmt.Errorf("switch %d and escape door %d on a floor with no escape door", r.Switch, r.EscapeDoor)
	}
	for _, h := range l.Hidden {
		all = append(all, h.Room)
	}
	seen := make(map[int]bool, len(all))
	for _, i := range all {
		if i < 0 || i >= len(rooms) {
			return fmt.Errorf("role room %d is not a room", i)
		}
		if seen[i] {
			return fmt.Errorf("room %d has two roles", i)
		}
		seen[i] = true
	}
	if s := rooms[r.Start]; s.W < p.StartMin || s.H < p.StartMin {
		return fmt.Errorf("start room is %dx%d, want at least %dx%d", s.W, s.H, p.StartMin, p.StartMin)
	}
	if n := len(r.Treasure); n < p.TreasureRooms.Min || n > p.TreasureRooms.Max {
		return fmt.Errorf("%d treasure rooms, want %d..%d", n, p.TreasureRooms.Min, p.TreasureRooms.Max)
	}
	dist, err := roomDistances(p.Cols, p.Rows, rooms, open, r.Start)
	if err != nil {
		return err
	}
	for i, room := range l.Rooms {
		if room.Distance != dist[i] {
			return fmt.Errorf("room %d distance %d, want %d", i, room.Distance, dist[i])
		}
	}
	median := medianDistance(dist, r.Start)
	fixed := []int{r.Stairs}
	if p.EscapeDoor {
		fixed = append(fixed, r.Switch, r.EscapeDoor)
	}
	for _, i := range fixed {
		if dist[i] < median {
			return fmt.Errorf("role room %d is %d cells from the start, under the median %d", i, dist[i], median)
		}
	}
	if !p.EscapeDoor {
		return nil
	}
	var free []int
	for i, d := range dist {
		if d >= median && i != r.Start && i != r.Stairs && !slices.ContainsFunc(l.Hidden, func(h BarredRoom) bool { return h.Room == i }) {
			free = append(free, i)
		}
	}
	if want := free[farthestFrom(p.Cols, p.Rows, open, rooms, r.Stairs, free)]; r.EscapeDoor != want {
		return fmt.Errorf("escape door in room %d, want room %d, the far room farthest from the stairs", r.EscapeDoor, want)
	}
	return nil
}

// checkBarred requires the stairs room to be the barrable room farthest from
// the start, HiddenRooms other barrable rooms by room index, each barrier and
// its segments as the layout's cells give them, every barrier shut to cut off
// its own room and nothing else, no extra connection to a barred room, and
// the Chasm flag to match the stairs room (FS-5FZ4J §A R2-R4, R8, §E R33, §F
// R36).
func checkBarred(p DungeonParams, l DungeonLayout, rooms []CellRect, open []bool, grid []int) error {
	barrable := barrableRooms(p.Cols, p.Rows, rooms, l.Edges, open, l.Roles.Start)
	dist := make([]int, len(l.Rooms))
	for i, room := range l.Rooms {
		dist[i] = room.Distance
	}
	at := farthestBarred(barrable, dist)
	if at < 0 {
		return fmt.Errorf("no room is a dead end")
	}
	want := func(room int) (BarredRoom, bool) {
		for _, b := range barrable {
			if b.Room == room {
				return withBarrierSegments(p.Cols, grid, b), true
			}
		}
		return BarredRoom{}, false
	}
	switch b, ok := want(l.Stairs.Room); {
	case l.Stairs.Room != l.Roles.Stairs:
		return fmt.Errorf("the stairs are barred in room %d but stand in room %d", l.Stairs.Room, l.Roles.Stairs)
	case l.Stairs.Room != barrable[at].Room:
		return fmt.Errorf("stairs room %d, want room %d, the farthest dead end", l.Stairs.Room, barrable[at].Room)
	case !ok || !reflect.DeepEqual(l.Stairs, b):
		return fmt.Errorf("stairs barrier %+v, want %+v", l.Stairs, b)
	}
	if len(l.Hidden) != p.HiddenRooms {
		return fmt.Errorf("%d hidden rooms, want %d", len(l.Hidden), p.HiddenRooms)
	}
	for i, h := range l.Hidden {
		b, ok := want(h.Room)
		switch {
		case !ok || !reflect.DeepEqual(h, b):
			return fmt.Errorf("hidden room %+v is not a dead end behind %+v", h, b)
		case i > 0 && h.Room <= l.Hidden[i-1].Room:
			return fmt.Errorf("hidden rooms out of room order")
		}
	}
	barred := append([]BarredRoom{l.Stairs}, l.Hidden...)
	for _, e := range l.Edges {
		for _, b := range barred {
			if e.Extra && (e.A == b.Room || e.B == b.Room) {
				return fmt.Errorf("extra edge %d-%d joins barred room %d", e.A, e.B, b.Room)
			}
		}
	}
	if !barredOff(p.Cols, p.Rows, open, centreIndex(p.Cols, rooms[l.Roles.Start]), rooms, barred) {
		return fmt.Errorf("with every barrier shut, a barred room is reachable or another cell is cut off")
	}
	if want := chasmCapable(rooms[l.Stairs.Room], l.Stairs.Barrier); l.ChasmCapable != want {
		return fmt.Errorf("chasm capable %v, want %v", l.ChasmCapable, want)
	}
	return nil
}
