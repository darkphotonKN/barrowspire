package levelgen

import (
	"fmt"
	"math"
	"math/rand/v2"
	"slices"
	"sort"
)

// DungeonParams shape a dungeon floor: rooms joined by corridors on a cell grid
// (FS-KE075 §A, ADR-0061 Decision 2). Sizes are in cells unless named
// otherwise. A new dungeon floor is a new parameter set, not a new generator.
type DungeonParams struct {
	// CellSize is one cell's edge in world px.
	CellSize float64
	// Cols and Rows are the grid's size in cells.
	Cols, Rows int
	// Rooms is how many rooms a floor has, drawn uniformly.
	Rooms IntRange
	// RoomWidth and RoomHeight bound a room's size, each drawn uniformly.
	RoomWidth, RoomHeight IntRange
	// RoomGap is the fewest cells between two rooms, so each keeps its own shell.
	RoomGap int
	// EdgeMargin is the fewest cells between a room and the grid's edge.
	EdgeMargin int
	// PlaceTries is how many positions rejection sampling draws for one room
	// before the attempt fails.
	PlaceTries int
	// CorridorWidth bounds a corridor's width, drawn per corridor.
	CorridorWidth IntRange
	// ExtraEdgeShare: round(ExtraEdgeShare x rooms) connections are added to the
	// spanning tree, the shortest pairs first, so the floor has loops. None
	// joins a dead end or opens one up (FS-5FZ4J §A R3).
	ExtraEdgeShare float64
	// SegmentMax is the longest side of a corridor segment's bounding box.
	SegmentMax int
	// StartMin is the smallest side of the start room.
	StartMin int
	// TreasureRooms is how many treasure rooms a floor has, drawn uniformly.
	TreasureRooms IntRange
	// RetryLimit is how many retries follow a failed first attempt.
	RetryLimit int
	// EscapeDoor says the floor has an escape door and its switch: every floor
	// but floor 1 (FS-5FZ4J §A R6). Without one their roles are -1.
	EscapeDoor bool
	// HiddenRooms is how many hidden rooms the floor has, each a dead end behind
	// a secret door (FS-5FZ4J §F R35-R36). The game draws the count.
	HiddenRooms int
	// PlainRooms is how many rooms at least PlainMin either way round, besides
	// the fixed roles and the treasure rooms, keep the rectangle when shapes
	// are drawn (FS-KE075 §Change: Room variety R72).
	PlainRooms int
	PlainMin   Span
}

// Span is a size in cells.
type Span struct{ W, H int }

// DungeonFloor1Params is floor 1's parameter set (FS-KE075 §A.2–6, §Change:
// Room variety R62–R65), sealed (FS-5FZ4J §A): 60 x 40 cells of 80 px
// (4 800 x 3 200 px), 16–22 rooms from 4x4 to 8x7, corridors 2–3 wide in
// segments of at most 12 cells, round(0.1 x rooms) extra connections, a start
// room of at least 5x5, 3–4 treasure rooms, no escape door and no hidden room,
// and two rooms of at least 6x5 besides the roles kept plain (R72).
// Floors 2+ set EscapeDoor and their hidden-room count on a copy. The 1 000-seed
// property test is the gate for any change.
var DungeonFloor1Params = DungeonParams{
	CellSize:       80,
	Cols:           60,
	Rows:           40,
	Rooms:          IntRange{Min: 16, Max: 22},
	RoomWidth:      IntRange{Min: 4, Max: 8},
	RoomHeight:     IntRange{Min: 4, Max: 7},
	RoomGap:        2,
	EdgeMargin:     2,
	PlaceTries:     400,
	CorridorWidth:  IntRange{Min: 2, Max: 3},
	ExtraEdgeShare: 0.1,
	SegmentMax:     12,
	StartMin:       5,
	TreasureRooms:  IntRange{Min: 3, Max: 4},
	RetryLimit:     32,
	PlainRooms:     2,
	PlainMin:       Span{W: 6, H: 5},
}

// fixedRoles is how many rooms the start, switch, escape door and stairs take.
const fixedRoles = 4

// Validate reports whether p is in range, wrapping ErrInvalidParams if not.
func (p DungeonParams) Validate() error {
	invalid := func(format string, args ...any) error {
		return fmt.Errorf("%w: %s", ErrInvalidParams, fmt.Sprintf(format, args...))
	}
	rangeOK := func(r IntRange, least int) bool { return r.Min >= least && r.Min <= r.Max }
	switch {
	case !(p.CellSize > 0):
		return invalid("cell size %v must be positive", p.CellSize)
	case p.Cols <= 0 || p.Rows <= 0:
		return invalid("grid %dx%d must be positive", p.Cols, p.Rows)
	case !rangeOK(p.TreasureRooms, 0):
		return invalid("treasure rooms %d..%d must be non-negative with min <= max",
			p.TreasureRooms.Min, p.TreasureRooms.Max)
	case p.HiddenRooms < 0:
		return invalid("hidden rooms %d must not be negative", p.HiddenRooms)
	case !rangeOK(p.Rooms, fixedRoles+p.TreasureRooms.Max+p.HiddenRooms):
		return invalid("rooms %d..%d must be at least %d (the roles) with min <= max",
			p.Rooms.Min, p.Rooms.Max, fixedRoles+p.TreasureRooms.Max+p.HiddenRooms)
	case !rangeOK(p.RoomWidth, 1) || !rangeOK(p.RoomHeight, 1):
		return invalid("room size %d..%d x %d..%d must be positive with min <= max",
			p.RoomWidth.Min, p.RoomWidth.Max, p.RoomHeight.Min, p.RoomHeight.Max)
	case p.RoomGap < 1:
		return invalid("room gap %d must be at least 1", p.RoomGap)
	case p.EdgeMargin < 1:
		return invalid("edge margin %d must be at least 1", p.EdgeMargin)
	case p.RoomWidth.Max+2*p.EdgeMargin > p.Cols || p.RoomHeight.Max+2*p.EdgeMargin > p.Rows:
		return invalid("a %dx%d room with margin %d does not fit a %dx%d grid",
			p.RoomWidth.Max, p.RoomHeight.Max, p.EdgeMargin, p.Cols, p.Rows)
	case p.PlaceTries < 1:
		return invalid("place tries %d must be positive", p.PlaceTries)
	case !rangeOK(p.CorridorWidth, 1):
		return invalid("corridor width %d..%d must be positive with min <= max",
			p.CorridorWidth.Min, p.CorridorWidth.Max)
	// A corridor starts at a room's centre cell; narrower than the smallest
	// room, its first cells stay inside the room it leaves.
	case p.CorridorWidth.Max >= min(p.RoomWidth.Min, p.RoomHeight.Min):
		return invalid("corridor width %d must be below the smallest room side %d",
			p.CorridorWidth.Max, min(p.RoomWidth.Min, p.RoomHeight.Min))
	case !(p.ExtraEdgeShare >= 0 && p.ExtraEdgeShare <= 1):
		return invalid("extra edge share %v must be in [0, 1]", p.ExtraEdgeShare)
	case p.SegmentMax < 1:
		return invalid("segment max %d must be positive", p.SegmentMax)
	case p.StartMin < 1 || p.StartMin > p.RoomWidth.Max || p.StartMin > p.RoomHeight.Max:
		return invalid("start min %d must be positive and fit the largest room %dx%d",
			p.StartMin, p.RoomWidth.Max, p.RoomHeight.Max)
	case p.RetryLimit < 0:
		return invalid("retry limit %d must not be negative", p.RetryLimit)
	case p.PlainRooms < 0:
		return invalid("plain rooms %d must not be negative", p.PlainRooms)
	}
	return nil
}

// Cell is a cell's column and row on the grid.
type Cell struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// CellRect is an axis-aligned rect in cells with a top-left origin.
type CellRect struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// centre is the rect's centre cell (rounded down and right for even sides).
func (r CellRect) centre() Cell { return Cell{X: r.X + r.W/2, Y: r.Y + r.H/2} }

// RegionKind says whether a region is a room or a corridor segment.
type RegionKind string

const (
	RegionRoom     RegionKind = "room"
	RegionCorridor RegionKind = "corridor"
)

// Region is one named part of the walkable cells: a room or a corridor
// segment. Its cells are rects in cells that cover it exactly once. This is the
// floor map's region shape (FS-KE075 §F.31).
type Region struct {
	ID    int        `json:"id"`
	Kind  RegionKind `json:"kind"`
	Cells []CellRect `json:"cells"`
}

// Room is one chamber: its rect, less the cells its shape cuts (FS-KE075
// §Change: Room variety R68).
type Room struct {
	Rect CellRect `json:"rect"`
	// Shape is the room's shape; its floor, the room's region, is Rect less
	// the shape's cuts (R73-R74).
	Shape RoomShape `json:"shape"`
	// Region is the room's region id.
	Region int `json:"region"`
	// Doorways are the room's cells 4-adjacent to a corridor cell, row by row.
	Doorways []Cell `json:"doorways"`
	// Distance is the 4-neighbour walk in cells from the start room's centre
	// cell to this room's.
	Distance int `json:"distance"`
}

// Edge is one connection between two rooms, carved as an L-shaped corridor
// from A's centre cell to B's.
type Edge struct {
	// A and B are room indices, A < B.
	A int `json:"a"`
	B int `json:"b"`
	// Width is the corridor's width in cells.
	Width int `json:"width"`
	// HorizontalFirst says the corridor's first leg runs east–west from A.
	HorizontalFirst bool `json:"horizontal_first"`
	// Extra marks a connection beyond the spanning tree: it closes a loop.
	Extra bool `json:"extra"`
}

// Roles are the rooms each room role is given, as indices into Rooms.
// Server-only: never on the wire (FS-KE075 §B.12). Switch and EscapeDoor are
// noRoom on a floor with no escape door (floor 1, FS-5FZ4J §A R6).
type Roles struct {
	Start      int   `json:"start"`
	Switch     int   `json:"switch"`
	EscapeDoor int   `json:"escape_door"`
	Stairs     int   `json:"stairs"`
	Treasure   []int `json:"treasure"`
}

// DungeonLayout is the dungeon generator's output. Rooms are in placement
// order, Edges tree first then extra, Regions rooms first (room i is region
// i+1) then corridor segments, Walls by top then left.
type DungeonLayout struct {
	// Seed is the seed GenerateDungeon was given; Attempt is the retry that
	// produced the layout (0 for the first attempt).
	Seed    uint64 `json:"seed"`
	Attempt int    `json:"attempt"`

	CellSize float64 `json:"cell_size"`
	Cols     int     `json:"cols"`
	Rows     int     `json:"rows"`
	// Bounds is the floor's size in px.
	Bounds Size `json:"bounds"`

	Rooms   []Room   `json:"rooms"`
	Edges   []Edge   `json:"edges"`
	Regions []Region `json:"regions"`
	// Walls are the shell walls merged into rects in px.
	Walls []Rect `json:"walls"`
	Roles Roles  `json:"roles"`

	// Stairs is the stairs room behind its gate, Barrier the gate's cells
	// (FS-5FZ4J §A R2, R4). Stairs.Room is Roles.Stairs.
	Stairs BarredRoom `json:"stairs"`
	// Hidden are the hidden rooms, each Barrier a secret door's cells (FS-5FZ4J
	// §F R36), by room index. Server-only, as the roles are.
	Hidden []BarredRoom `json:"hidden"`
	// ChasmCapable says the stairs room is at least 6 cells deep from its
	// doorway wall and 5 wide along it, so a Chasm seal fits (FS-5FZ4J §E R33).
	ChasmCapable bool `json:"chasm_capable"`
}

// noRoom is a role no room takes.
const noRoom = -1

// HasEscapeDoor reports whether the floor has an escape door and its switch.
func (r Roles) HasEscapeDoor() bool { return r.EscapeDoor != noRoom }

// Grid returns the region id of every cell, row by row: 0 where the cell is
// not walkable (shell wall or void).
func (l DungeonLayout) Grid() []int {
	grid := make([]int, l.Cols*l.Rows)
	for _, reg := range l.Regions {
		for _, r := range reg.Cells {
			for y := max(0, r.Y); y < min(l.Rows, r.Y+r.H); y++ {
				for x := max(0, r.X); x < min(l.Cols, r.X+r.W); x++ {
					grid[y*l.Cols+x] = reg.ID
				}
			}
		}
	}
	return grid
}

// GenerateDungeon returns the dungeon layout for p and seed. It draws the room
// count once from the seed, then tries the seed itself first, then seeds
// derived from it (attempt 1..p.RetryLimit), as Generate does, each with that
// count, and returns the first layout that passes validation, so the same seed
// always yields the same layout. Exhausting the retries returns an error
// wrapping ErrNoLayout.
func GenerateDungeon(p DungeonParams, seed uint64) (DungeonLayout, error) {
	if err := p.Validate(); err != nil {
		return DungeonLayout{}, fmt.Errorf("generate dungeon: %w", err)
	}
	rooms := roomCount(p, seed)
	var lastErr error
	for attempt := 0; attempt <= p.RetryLimit; attempt++ {
		l, err := buildDungeon(p, rooms, attemptSeed(seed, attempt))
		if err == nil {
			err = validateDungeon(p, l)
		}
		if err == nil {
			l.Seed, l.Attempt = seed, attempt
			return l, nil
		}
		lastErr = err
	}
	return DungeonLayout{}, fmt.Errorf("generate dungeon seed %d after %d attempts: %w: last attempt: %w",
		seed, p.RetryLimit+1, ErrNoLayout, lastErr)
}

/**
* roomCount is how many rooms seed's floor has, drawn uniformly from p.Rooms on
* a stream of its own, so every attempt keeps it. Redrawn per attempt, a count
* whose rooms fail to fit more often would be retried away, and the counts
* that survive would skew small (FS-KE075 §A.3).
**/
func roomCount(p DungeonParams, seed uint64) int {
	return pickIn(rand.New(rand.NewPCG(seed, splitmix64(seed))), p.Rooms)
}

/**
* buildDungeon runs one attempt for a floor of rooms rooms: place them, join
* them by the spanning tree's corridors, draw the start room, find the rooms
* that could stand behind a barrier, add the extra connections that leave
* those rooms alone, cut regions, derive doorways and shell walls, assign
* roles and bar the stairs and hidden rooms (FS-5FZ4J §A R2-R4, §F R36).
**/
func buildDungeon(p DungeonParams, rooms int, seed uint64) (DungeonLayout, error) {
	rng := rand.New(rand.NewPCG(seed, splitmix64(seed)))
	rects, err := placeRooms(p, rooms, rng)
	if err != nil {
		return DungeonLayout{}, err
	}
	tree, rest := connectionPairs(rects)
	edges := make([]Edge, 0, len(tree)+extraEdges(p, rooms))
	open := make([]bool, p.Cols*p.Rows)
	inRoom := make([]bool, len(open))
	for _, r := range rects {
		for _, c := range rectCells(p.Cols, r) {
			open[c], inRoom[c] = true, true
		}
	}
	for _, pr := range tree {
		e := drawEdge(p, rng, pr, false)
		carveEdge(p.Cols, open, rects, e)
		edges = append(edges, e)
	}
	start, err := drawStart(p, rng, rects)
	if err != nil {
		return DungeonLayout{}, err
	}
	barrable := barrableRooms(p.Cols, p.Rows, rects, edges, open, start)
	if edges, open, err = addExtraEdges(p, rng, rects, rest, edges, open, start, barrable); err != nil {
		return DungeonLayout{}, err
	}
	// the roles read the rooms whole, before any is shaped: a room's distance
	// is the walk over its rect (R73 leaves every corridor its way through)
	roles, err := assignRoles(p, rng, rects, open, start, barrable)
	if err != nil {
		return DungeonLayout{}, err
	}

	shapes := drawShapes(rng, rects, rectangularRooms(p, rng, rects, roles))
	floor, cut := roomFloors(p.Cols, p.Rows, rects, shapes, carvedCells(p.Cols, len(open), rects, edges))
	corridor := make([]bool, len(open))
	for c := range open {
		open[c] = open[c] && !cut[c]
		corridor[c] = open[c] && floor[c] == 0
	}
	l := DungeonLayout{
		CellSize: p.CellSize,
		Cols:     p.Cols,
		Rows:     p.Rows,
		Bounds:   Size{W: float64(p.Cols) * p.CellSize, H: float64(p.Rows) * p.CellSize},
		Edges:    edges,
		Regions:  buildRegions(p.Cols, p.Rows, len(rects), floor, corridor, p.SegmentMax),
		Walls:    mergeWalls(p.Cols, p.Rows, shellCells(p.Cols, p.Rows, open), p.CellSize),
	}
	l.Roles = roles.Roles
	grid := l.Grid()
	l.Stairs = withBarrierSegments(p.Cols, grid, roles.stairs)
	for _, h := range roles.hidden {
		l.Hidden = append(l.Hidden, withBarrierSegments(p.Cols, grid, h))
	}
	l.ChasmCapable = chasmCapable(rects[l.Stairs.Room], l.Stairs.Barrier)
	l.Rooms = make([]Room, len(rects))
	for i, r := range rects {
		l.Rooms[i] = Room{
			Rect:     r,
			Shape:    shapes[i],
			Region:   i + 1,
			Doorways: roomDoorways(p.Cols, p.Rows, r, floor, corridor),
			Distance: roles.dist[i],
		}
	}
	return l, nil
}

/**
* addExtraEdges adds the round(ExtraEdgeShare x rooms) extra connections
* (FS-KE075 §A.4, FS-5FZ4J §A R3): the shortest pairs not in the tree first,
* passing over a pair that joins a barrable room and one whose corridor would
* open a way into one, so every barrable room stays a dead end behind its
* barrier. Fewer pairs than that left is an invalid layout.
**/
func addExtraEdges(p DungeonParams, rng *rand.Rand, rects []CellRect, rest [][2]int, edges []Edge,
	open []bool, start int, barrable []BarredRoom) ([]Edge, []bool, error) {
	want := extraEdges(p, len(rects))
	isBarrable := make(map[int]bool, len(barrable))
	for _, b := range barrable {
		isBarrable[b.Room] = true
	}
	from := centreIndex(p.Cols, rects[start])
	added := 0
	for _, pr := range rest {
		if added == want {
			break
		}
		if isBarrable[pr[0]] || isBarrable[pr[1]] {
			continue
		}
		e := drawEdge(p, rng, pr, true)
		trial := slices.Clone(open)
		carveEdge(p.Cols, trial, rects, e)
		if !slices.ContainsFunc(barrable, func(b BarredRoom) bool {
			return !barredOff(p.Cols, p.Rows, trial, from, rects, []BarredRoom{b})
		}) {
			edges, open = append(edges, e), trial
			added++
		}
	}
	if added < want {
		return nil, nil, fmt.Errorf("%w: %d of %d extra connections leave the dead ends alone", errInvalidLayout, added, want)
	}
	return edges, open, nil
}

// drawEdge draws one connection's corridor width and leg order.
func drawEdge(p DungeonParams, rng *rand.Rand, pr [2]int, extra bool) Edge {
	return Edge{
		A:               pr[0],
		B:               pr[1],
		Width:           pickIn(rng, p.CorridorWidth),
		HorizontalFirst: rng.IntN(2) == 0,
		Extra:           extra,
	}
}

// carvedCells marks every cell the rooms' rects and the edges' corridors
// open: the floor before any room is shaped.
func carvedCells(cols, n int, rects []CellRect, edges []Edge) []bool {
	carved := make([]bool, n)
	for _, e := range edges {
		for _, c := range corridorCells(cols, rects[e.A], rects[e.B], e.Width, e.HorizontalFirst) {
			carved[c] = true
		}
	}
	return carved
}

// rectangularRooms is the rooms that keep the rectangle (R72): the start,
// stairs, switch and escape door rooms, every hidden room, and PlainRooms
// drawn from the rest at least PlainMin either way round that are not
// treasure rooms, so a puzzle that walks a rect finds one (a Weighted Plates
// seal, FS-5FZ4J §C R17).
func rectangularRooms(p DungeonParams, rng *rand.Rand, rects []CellRect, r roomRoles) map[int]bool {
	keep := map[int]bool{r.Start: true, r.Stairs: true}
	if r.HasEscapeDoor() {
		keep[r.Switch], keep[r.EscapeDoor] = true, true
	}
	for _, h := range r.hidden {
		keep[h.Room] = true
	}
	var large []int
	for i, rect := range rects {
		long, short := max(rect.W, rect.H), min(rect.W, rect.H)
		if !keep[i] && !slices.Contains(r.Treasure, i) && long >= max(p.PlainMin.W, p.PlainMin.H) && short >= min(p.PlainMin.W, p.PlainMin.H) {
			large = append(large, i)
		}
	}
	shuffle(rng, large)
	for _, i := range large[:min(p.PlainRooms, len(large))] {
		keep[i] = true
	}
	return keep
}

// carveEdge opens e's corridor cells on open. Corridors run between room
// centres, inside the edge margin, so they never leave the grid.
func carveEdge(cols int, open []bool, rects []CellRect, e Edge) {
	for _, c := range corridorCells(cols, rects[e.A], rects[e.B], e.Width, e.HorizontalFirst) {
		open[c] = true
	}
}

// pickIn draws a seeded value from r.
func pickIn(rng *rand.Rand, r IntRange) int { return r.Min + rng.IntN(r.Max-r.Min+1) }

/**
* placeRooms places n rooms. Every room's size is drawn first, once; then the
* rooms are placed largest first, each by rejection sampling: positions inside
* the edge margin are drawn until one is at least RoomGap cells from every room
* already placed. Only the position is retried: redrawing the size on each try
* would turn a large room away more often than a small one, and sizes would
* skew small (FS-KE075 §A.3). Largest first, a large room is not left to find
* a gap among the small ones, so a floor's full set of sizes fits more often;
* the order changes where rooms stand, never which sizes are drawn.
**/
func placeRooms(p DungeonParams, n int, rng *rand.Rand) ([]CellRect, error) {
	sizes := make([]CellRect, n)
	for i := range sizes {
		sizes[i] = CellRect{W: pickIn(rng, p.RoomWidth), H: pickIn(rng, p.RoomHeight)}
	}
	sort.SliceStable(sizes, func(a, b int) bool { return sizes[a].W*sizes[a].H > sizes[b].W*sizes[b].H })

	rooms := make([]CellRect, 0, n)
	for _, size := range sizes {
		placed := false
		for range p.PlaceTries {
			r := CellRect{
				X: p.EdgeMargin + rng.IntN(p.Cols-2*p.EdgeMargin-size.W+1),
				Y: p.EdgeMargin + rng.IntN(p.Rows-2*p.EdgeMargin-size.H+1),
				W: size.W,
				H: size.H,
			}
			if apartFromAll(r, rooms, p.RoomGap) {
				rooms = append(rooms, r)
				placed = true
				break
			}
		}
		if !placed {
			return nil, fmt.Errorf("%w: placed %d of %d rooms", errInvalidLayout, len(rooms), n)
		}
	}
	return rooms, nil
}

// apart reports whether at least gap cells lie between a and b on some axis.
func apart(a, b CellRect, gap int) bool {
	return a.X+a.W+gap <= b.X || b.X+b.W+gap <= a.X || a.Y+a.H+gap <= b.Y || b.Y+b.H+gap <= a.Y
}

func apartFromAll(r CellRect, rooms []CellRect, gap int) bool {
	for _, o := range rooms {
		if !apart(r, o, gap) {
			return false
		}
	}
	return true
}

// connectionPairs is the connection graph, with no randomness: a minimum
// spanning tree over room centres by straight distance (Prim's, from room 0),
// then every pair not in the tree, shortest first, the candidates for the
// extra connections. Ties go to the lower room index. Each pair is (lower,
// higher).
func connectionPairs(rooms []CellRect) (tree, rest [][2]int) {
	n := len(rooms)
	// Doubled centres keep distances exact integers.
	d2 := func(i, j int) int {
		a, b := rooms[i], rooms[j]
		dx := (2*a.X + a.W) - (2*b.X + b.W)
		dy := (2*a.Y + a.H) - (2*b.Y + b.H)
		return dx*dx + dy*dy
	}
	if n == 0 {
		return nil, nil
	}
	inTree := make([]bool, n)
	best, from := make([]int, n), make([]int, n)
	inTree[0] = true
	for j := 1; j < n; j++ {
		best[j] = d2(0, j)
	}
	linked := make(map[[2]int]bool, n)
	for range n - 1 {
		next := -1
		for j := range n {
			if !inTree[j] && (next < 0 || best[j] < best[next]) {
				next = j
			}
		}
		inTree[next] = true
		pr := [2]int{min(from[next], next), max(from[next], next)}
		tree = append(tree, pr)
		linked[pr] = true
		for j := range n {
			if d := d2(next, j); !inTree[j] && d < best[j] {
				best[j], from[j] = d, next
			}
		}
	}

	for i := range n {
		for j := i + 1; j < n; j++ {
			if !linked[[2]int{i, j}] {
				rest = append(rest, [2]int{i, j})
			}
		}
	}
	sort.SliceStable(rest, func(a, b int) bool {
		return d2(rest[a][0], rest[a][1]) < d2(rest[b][0], rest[b][1])
	})
	return tree, rest
}

// extraEdges is how many connections beyond the tree a floor of n rooms gets.
func extraEdges(p DungeonParams, n int) int {
	return int(math.Round(p.ExtraEdgeShare * float64(n)))
}

// corridorCells lists the cells an L-shaped corridor of the given width carves
// from a's centre cell to b's: a width x width brush stamped at every cell of
// the centre line, so the bend is filled. Cells may repeat.
func corridorCells(cols int, a, b CellRect, width int, horizontalFirst bool) []int {
	from, to := a.centre(), b.centre()
	bend := Cell{X: from.X, Y: to.Y}
	if horizontalFirst {
		bend = Cell{X: to.X, Y: from.Y}
	}
	lo, hi := -(width-1)/2, width/2
	var out []int
	stamp := func(c Cell) {
		for dy := lo; dy <= hi; dy++ {
			for dx := lo; dx <= hi; dx++ {
				out = append(out, (c.Y+dy)*cols+c.X+dx)
			}
		}
	}
	leg := func(s, e Cell) {
		dx, dy := sign(e.X-s.X), sign(e.Y-s.Y)
		for c := s; ; c = (Cell{X: c.X + dx, Y: c.Y + dy}) {
			stamp(c)
			if c == e {
				return
			}
		}
	}
	leg(from, bend)
	leg(bend, to)
	return out
}

func sign(v int) int {
	switch {
	case v > 0:
		return 1
	case v < 0:
		return -1
	}
	return 0
}

// rectCells lists the cell indices of r, row by row.
func rectCells(cols int, r CellRect) []int {
	out := make([]int, 0, r.W*r.H)
	for y := r.Y; y < r.Y+r.H; y++ {
		for x := r.X; x < r.X+r.W; x++ {
			out = append(out, y*cols+x)
		}
	}
	return out
}
