package levelgen

import (
	"fmt"
	"math"
	"math/rand/v2"
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
	// spanning tree, the shortest pairs first, so the floor has loops.
	ExtraEdgeShare float64
	// SegmentMax is the longest side of a corridor segment's bounding box.
	SegmentMax int
	// StartMin is the smallest side of the start room.
	StartMin int
	// TreasureRooms is how many treasure rooms a floor has, drawn uniformly.
	TreasureRooms IntRange
	// RetryLimit is how many retries follow a failed first attempt.
	RetryLimit int
}

// DungeonFloor1Params is floor 1's parameter set (FS-KE075 §A.2–6): 72 x 48
// cells of 80 px (5 760 x 3 840 px), 18–28 rooms from 4x4 to 10x8, corridors
// 2–3 wide in segments of at most 16 cells, round(0.2 x rooms) extra
// connections, a start room of at least 5x5 and 3–4 treasure rooms. The
// 1 000-seed property test is the gate for any change.
var DungeonFloor1Params = DungeonParams{
	CellSize:       80,
	Cols:           72,
	Rows:           48,
	Rooms:          IntRange{Min: 18, Max: 28},
	RoomWidth:      IntRange{Min: 4, Max: 10},
	RoomHeight:     IntRange{Min: 4, Max: 8},
	RoomGap:        2,
	EdgeMargin:     2,
	PlaceTries:     400,
	CorridorWidth:  IntRange{Min: 2, Max: 3},
	ExtraEdgeShare: 0.2,
	SegmentMax:     16,
	StartMin:       5,
	TreasureRooms:  IntRange{Min: 3, Max: 4},
	RetryLimit:     32,
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
	case !rangeOK(p.Rooms, fixedRoles+p.TreasureRooms.Max):
		return invalid("rooms %d..%d must be at least %d (the roles) with min <= max",
			p.Rooms.Min, p.Rooms.Max, fixedRoles+p.TreasureRooms.Max)
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

// Room is one rectangular chamber.
type Room struct {
	Rect CellRect `json:"rect"`
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
// Server-only: never on the wire (FS-KE075 §B.12).
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
}

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

// GenerateDungeon returns the dungeon layout for p and seed. It tries the seed
// itself first, then seeds derived from it (attempt 1..p.RetryLimit), as
// Generate does, and returns the first layout that passes validation, so the
// same seed always yields the same layout. Exhausting the retries returns an
// error wrapping ErrNoLayout.
func GenerateDungeon(p DungeonParams, seed uint64) (DungeonLayout, error) {
	if err := p.Validate(); err != nil {
		return DungeonLayout{}, fmt.Errorf("generate dungeon: %w", err)
	}
	var lastErr error
	for attempt := 0; attempt <= p.RetryLimit; attempt++ {
		l, err := buildDungeon(p, attemptSeed(seed, attempt))
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

// buildDungeon runs one attempt: place rooms, connect them, carve corridors,
// cut regions, derive doorways and shell walls, assign roles.
func buildDungeon(p DungeonParams, seed uint64) (DungeonLayout, error) {
	rng := rand.New(rand.NewPCG(seed, splitmix64(seed)))
	rects, err := placeRooms(p, rng)
	if err != nil {
		return DungeonLayout{}, err
	}
	edges := connectRooms(p, rng, rects)

	open := make([]bool, p.Cols*p.Rows)
	inRoom := make([]bool, len(open))
	for _, r := range rects {
		for _, c := range rectCells(p.Cols, r) {
			open[c], inRoom[c] = true, true
		}
	}
	for _, e := range edges {
		for _, c := range corridorCells(p.Cols, rects[e.A], rects[e.B], e.Width, e.HorizontalFirst) {
			open[c] = true
		}
	}
	corridor := make([]bool, len(open))
	for c := range open {
		corridor[c] = open[c] && !inRoom[c]
	}

	l := DungeonLayout{
		CellSize: p.CellSize,
		Cols:     p.Cols,
		Rows:     p.Rows,
		Bounds:   Size{W: float64(p.Cols) * p.CellSize, H: float64(p.Rows) * p.CellSize},
		Edges:    edges,
		Regions:  buildRegions(p.Cols, p.Rows, rects, corridor, p.SegmentMax),
		Walls:    mergeWalls(p.Cols, p.Rows, shellCells(p.Cols, p.Rows, open), p.CellSize),
	}
	roles, dist, err := assignRoles(p, rng, rects, open)
	if err != nil {
		return DungeonLayout{}, err
	}
	l.Roles = roles
	l.Rooms = make([]Room, len(rects))
	for i, r := range rects {
		l.Rooms[i] = Room{
			Rect:     r,
			Region:   i + 1,
			Doorways: roomDoorways(p.Cols, p.Rows, r, corridor),
			Distance: dist[i],
		}
	}
	return l, nil
}

// pickIn draws a seeded value from r.
func pickIn(rng *rand.Rand, r IntRange) int { return r.Min + rng.IntN(r.Max-r.Min+1) }

// placeRooms draws the room count, then places each room by rejection
// sampling: a drawn size at a drawn position inside the edge margin, kept when
// it is at least RoomGap cells from every room already placed.
func placeRooms(p DungeonParams, rng *rand.Rand) ([]CellRect, error) {
	n := pickIn(rng, p.Rooms)
	rooms := make([]CellRect, 0, n)
	for len(rooms) < n {
		placed := false
		for range p.PlaceTries {
			w, h := pickIn(rng, p.RoomWidth), pickIn(rng, p.RoomHeight)
			r := CellRect{
				X: p.EdgeMargin + rng.IntN(p.Cols-2*p.EdgeMargin-w+1),
				Y: p.EdgeMargin + rng.IntN(p.Rows-2*p.EdgeMargin-h+1),
				W: w,
				H: h,
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

// connectRooms draws each connection's corridor width and leg order.
func connectRooms(p DungeonParams, rng *rand.Rand, rooms []CellRect) []Edge {
	tree, extra := connectionPairs(p, rooms)
	edges := make([]Edge, 0, len(tree)+len(extra))
	add := func(pairs [][2]int, isExtra bool) {
		for _, pr := range pairs {
			edges = append(edges, Edge{
				A:               pr[0],
				B:               pr[1],
				Width:           pickIn(rng, p.CorridorWidth),
				HorizontalFirst: rng.IntN(2) == 0,
				Extra:           isExtra,
			})
		}
	}
	add(tree, false)
	add(extra, true)
	return edges
}

// connectionPairs is the connection graph, with no randomness: a minimum
// spanning tree over room centres by straight distance (Prim's, from room 0),
// then the round(ExtraEdgeShare x rooms) shortest pairs not in the tree. Ties
// go to the lower room index. Each pair is (lower, higher).
func connectionPairs(p DungeonParams, rooms []CellRect) (tree, extra [][2]int) {
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

	var rest [][2]int
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
	k := min(len(rest), extraEdges(p, n))
	return tree, rest[:k]
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
