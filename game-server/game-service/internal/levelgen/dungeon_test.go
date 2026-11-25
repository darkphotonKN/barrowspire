package levelgen

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const dungeonGoldenSeed = 20261106

func generateDungeon(t *testing.T, seed uint64) DungeonLayout {
	t.Helper()
	l, err := GenerateDungeon(DungeonFloor1Params, seed)
	if err != nil {
		t.Fatalf("seed %d: GenerateDungeon() error = %v", seed, err)
	}
	return l
}

// openMask marks every cell some region covers.
func openMask(l DungeonLayout) []bool {
	open := make([]bool, l.Cols*l.Rows)
	for i, id := range l.Grid() {
		open[i] = id > 0
	}
	return open
}

/**
* shapedAsDrawn checks every room's floor against its shape, by its own reading
* of R69 and R73 (FS-KE075 §Change: Room variety) rather than the generator's:
* a rect cell off the room's floor is one the shape cuts, walled or left to a
* corridor that crossed it; a cell the shape cuts is never the room's unless a
* corridor carved it; a carved cell is never walled. It counts the shapes.
**/
func shapedAsDrawn(l DungeonLayout, shapes map[RoomShape]int) error {
	grid := l.Grid()
	rects := make([]CellRect, len(l.Rooms))
	for i, room := range l.Rooms {
		rects[i] = room.Rect
	}
	carved := map[int]bool{}
	for _, e := range l.Edges {
		for _, c := range corridorCells(l.Cols, rects[e.A], rects[e.B], e.Width, e.HorizontalFirst) {
			carved[c] = true
		}
	}
	for i, room := range l.Rooms {
		shapes[room.Shape]++
		r := room.Rect
		cuts := map[int]bool{}
		for _, c := range shapeCuts(room.Shape, r.W, r.H) {
			cuts[(r.Y+c.Y)*l.Cols+r.X+c.X] = true
		}
		for _, c := range rectCells(l.Cols, r) {
			switch id := grid[c]; {
			case id == room.Region && cuts[c] && !carved[c]:
				return fmt.Errorf("room %d (%s) keeps cut cell (%d, %d) on its floor", i, room.Shape, c%l.Cols, c/l.Cols)
			case id != room.Region && id != 0 && id <= len(l.Rooms):
				return fmt.Errorf("room %d's rect holds room %d's floor", i, id-1)
			case id == 0 && carved[c]:
				return fmt.Errorf("room %d (%s) walls cell (%d, %d), which a corridor carved", i, room.Shape, c%l.Cols, c/l.Cols)
			case id == 0 && !cuts[c]:
				// no shape leaves a pocket, so the pocket rule cuts nothing more
				return fmt.Errorf("room %d (%s) loses cell (%d, %d), which its shape does not cut", i, room.Shape, c%l.Cols, c/l.Cols)
			}
		}
	}
	return nil
}

// wholeMask is the floor as the roles read it, before any room was shaped
// (FS-KE075 §Change: Room variety R73): the walkable cells and every room's
// whole rect, since every cut cell lies in a rect.
func wholeMask(l DungeonLayout) []bool {
	open := openMask(l)
	for _, room := range l.Rooms {
		for _, c := range rectCells(l.Cols, room.Rect) {
			open[c] = true
		}
	}
	return open
}

// shellMask marks every non-walkable cell 8-adjacent to a walkable one,
// worked out here independently of the generator.
func shellMask(l DungeonLayout, open []bool) []bool {
	shell := make([]bool, len(open))
	for c := range open {
		if open[c] {
			continue
		}
		cx, cy := c%l.Cols, c/l.Cols
		for y := max(0, cy-1); y <= min(l.Rows-1, cy+1); y++ {
			for x := max(0, cx-1); x <= min(l.Cols-1, cx+1); x++ {
				if open[y*l.Cols+x] {
					shell[c] = true
				}
			}
		}
	}
	return shell
}

// wallCover counts how many wall rects cover each cell; a rect off the cell
// grid fails the test.
func wallCover(t *testing.T, l DungeonLayout) []int {
	t.Helper()
	cover := make([]int, l.Cols*l.Rows)
	for _, r := range l.Walls {
		x0, y0 := int(r.X/l.CellSize), int(r.Y/l.CellSize)
		x1, y1 := int((r.X+r.W)/l.CellSize), int((r.Y+r.H)/l.CellSize)
		if float64(x0)*l.CellSize != r.X || float64(y0)*l.CellSize != r.Y ||
			float64(x1)*l.CellSize != r.X+r.W || float64(y1)*l.CellSize != r.Y+r.H {
			t.Fatalf("wall %+v is off the cell grid", r)
		}
		for y := y0; y < y1; y++ {
			for x := x0; x < x1; x++ {
				cover[y*l.Cols+x]++
			}
		}
	}
	return cover
}

func roomCentre(l DungeonLayout, room int) int {
	r := l.Rooms[room].Rect
	return (r.Y+r.H/2)*l.Cols + r.X + r.W/2
}

// walkFrom is a 4-neighbour BFS over open cells: the walk in cells to every
// cell, -1 where unreachable.
func walkFrom(l DungeonLayout, open []bool, from int) []int {
	dist := make([]int, len(open))
	for i := range dist {
		dist[i] = -1
	}
	dist[from] = 0
	queue := []int{from}
	for i := 0; i < len(queue); i++ {
		c := queue[i]
		x, y := c%l.Cols, c/l.Cols
		for _, d := range [4][2]int{{0, -1}, {1, 0}, {0, 1}, {-1, 0}} {
			nx, ny := x+d[0], y+d[1]
			if nx < 0 || ny < 0 || nx >= l.Cols || ny >= l.Rows {
				continue
			}
			if n := ny*l.Cols + nx; open[n] && dist[n] < 0 {
				dist[n] = dist[c] + 1
				queue = append(queue, n)
			}
		}
	}
	return dist
}

// renderDungeonASCII draws a layout one character per cell: ' ' void, '#'
// shell wall, '.' room, '=' corridor, '+' doorway; role centres are 'S'
// start, 'W' switch, 'D' escape door, 'U' stairs, 'T' treasure.
func renderDungeonASCII(l DungeonLayout) string {
	open := openMask(l)
	shell := shellMask(l, open)
	grid := make([]byte, len(open))
	for c := range grid {
		grid[c] = ' '
		if shell[c] {
			grid[c] = '#'
		}
	}
	for _, reg := range l.Regions {
		ch := byte('=')
		if reg.Kind == RegionRoom {
			ch = '.'
		}
		for _, r := range reg.Cells {
			for y := r.Y; y < r.Y+r.H; y++ {
				for x := r.X; x < r.X+r.W; x++ {
					grid[y*l.Cols+x] = ch
				}
			}
		}
	}
	for _, room := range l.Rooms {
		for _, d := range room.Doorways {
			grid[d.Y*l.Cols+d.X] = '+'
		}
	}
	mark := func(room int, ch byte) {
		if room >= 0 && room < len(l.Rooms) {
			grid[roomCentre(l, room)] = ch
		}
	}
	for _, t := range l.Roles.Treasure {
		mark(t, 'T')
	}
	mark(l.Roles.Start, 'S')
	mark(l.Roles.Switch, 'W')
	mark(l.Roles.EscapeDoor, 'D')
	mark(l.Roles.Stairs, 'U')

	var sb strings.Builder
	for y := 0; y < l.Rows; y++ {
		sb.Write(grid[y*l.Cols : (y+1)*l.Cols])
		sb.WriteByte('\n')
	}
	return sb.String()
}

// longestExtraLoop is the most rooms on a loop that one extra edge closes
// through the spanning tree.
func longestExtraLoop(l DungeonLayout) int {
	adj := make([][]int, len(l.Rooms))
	for _, e := range l.Edges {
		if !e.Extra {
			adj[e.A] = append(adj[e.A], e.B)
			adj[e.B] = append(adj[e.B], e.A)
		}
	}
	best := 0
	for _, e := range l.Edges {
		if !e.Extra {
			continue
		}
		hops := make([]int, len(l.Rooms))
		for i := range hops {
			hops[i] = -1
		}
		hops[e.A] = 0
		queue := []int{e.A}
		for i := 0; i < len(queue); i++ {
			for _, n := range adj[queue[i]] {
				if hops[n] < 0 {
					hops[n] = hops[queue[i]] + 1
					queue = append(queue, n)
				}
			}
		}
		best = max(best, hops[e.B]+1) // rooms on the tree path, both ends included
	}
	return best
}

// FS-KE075 §A.7, §A.8: the issue's first RED test.
func TestGenerateDungeon_OneSeed_WalkableReachableAndNoWallOnVoid(t *testing.T) {
	l := generateDungeon(t, dungeonGoldenSeed)
	open := openMask(l)
	shell := shellMask(l, open)

	tests := []struct {
		name  string
		check func(t *testing.T)
	}{
		{"every walkable cell is reachable from the start room", func(t *testing.T) {
			dist := walkFrom(l, open, roomCentre(l, l.Roles.Start))
			for c := range open {
				if open[c] && dist[c] < 0 {
					t.Fatalf("walkable cell (%d, %d) is unreachable", c%l.Cols, c/l.Cols)
				}
			}
		}},
		{"no wall covers a void or walkable cell", func(t *testing.T) {
			for c, n := range wallCover(t, l) {
				if n > 0 && !shell[c] {
					t.Fatalf("a wall covers non-shell cell (%d, %d)", c%l.Cols, c/l.Cols)
				}
			}
		}},
		{"every shell cell is covered by exactly one wall", func(t *testing.T) {
			for c, n := range wallCover(t, l) {
				if shell[c] && n != 1 {
					t.Fatalf("shell cell (%d, %d) is covered %d times", c%l.Cols, c/l.Cols, n)
				}
			}
		}},
		{"no walkable cell lies on the edge ring", func(t *testing.T) {
			for c := range open {
				x, y := c%l.Cols, c/l.Cols
				if open[c] && (x == 0 || y == 0 || x == l.Cols-1 || y == l.Rows-1) {
					t.Fatalf("walkable cell (%d, %d) is on the edge ring", x, y)
				}
			}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, tt.check)
	}
	if t.Failed() {
		t.Log("\n" + renderDungeonASCII(l))
	}
}

// FS-KE075 §A acceptance and FS-5FZ4J §A R2-R8, §F R36: 1,000 seeds, every
// bound, on floor 1 and on floors 2+ with 0, 1 and 2 hidden rooms asked for.
func TestGenerateDungeon_Floor1Params_EverySeedValid(t *testing.T) {
	for _, floor := range sealedFloors() {
		t.Run(floor.name, func(t *testing.T) { everySeedValid(t, floor.p) })
	}
}

func everySeedValid(t *testing.T, p DungeonParams) {
	const seeds = 1000
	var (
		retried, maxAttempt, maxWalls, maxRegions int
		minRooms, maxRooms                        = math.MaxInt, 0
		halls, hallFloors, loop4                  int
		minSegment                                = math.MaxInt
	)
	chasm := 0
	shapes := map[RoomShape]int{}
	for seed := uint64(0); seed < seeds; seed++ {
		l, err := GenerateDungeon(p, seed)
		if err != nil {
			t.Fatalf("seed %d: GenerateDungeon() error = %v", seed, err)
		}
		if err := validateDungeon(p, l); err != nil {
			t.Fatalf("seed %d: %v\n%s", seed, err, renderDungeonASCII(l))
		}
		if err := checkSealed(p, l); err != nil {
			t.Fatalf("seed %d: %v\n%s", seed, err, renderDungeonASCII(l))
		}
		if l.ChasmCapable {
			chasm++
		}
		if err := shapedAsDrawn(l, shapes); err != nil {
			t.Fatalf("seed %d: %v\n%s", seed, err, renderDungeonASCII(l))
		}

		n := len(l.Rooms)
		if longestExtraLoop(l) >= 4 {
			loop4++
		}

		// a hall is at least 7 x 6 (FS-KE075 §Change: Room variety R66)
		hasHall := false
		for _, room := range l.Rooms {
			if room.Rect.W >= 7 && room.Rect.H >= 6 {
				halls++
				hasHall = true
			}
		}
		if hasHall {
			hallFloors++
		}
		for _, reg := range l.Regions {
			if reg.Kind != RegionCorridor {
				continue
			}
			cells := 0
			for _, r := range reg.Cells {
				cells += r.W * r.H
			}
			minSegment = min(minSegment, cells)
		}
		if l.Attempt > 0 {
			retried++
		}
		maxAttempt = max(maxAttempt, l.Attempt)
		maxWalls = max(maxWalls, len(l.Walls))
		maxRegions = max(maxRegions, len(l.Regions))
		minRooms, maxRooms = min(minRooms, n), max(maxRooms, n)
	}
	// R71, R76: every shape comes up, each L corner among them
	for _, shape := range allShapes() {
		if shapes[shape] == 0 {
			t.Errorf("no room in %d seeds is shaped %s", seeds, shape)
		}
	}
	t.Logf("shapes: %v", shapes)
	if loop4 == 0 {
		t.Fatalf("no layout in %d has a loop through four or more rooms", seeds)
	}
	if hallFloors*2 < seeds {
		t.Errorf("%d of %d floors have a hall (>= 7x6), want most", hallFloors, seeds)
	}
	t.Logf("%d seeds: rooms %d..%d, %d halls (>= 7x6) in all, max %d wall rects, max %d regions, "+
		"smallest corridor segment %d cells, %d with a loop of >= 4 rooms, %d needed a retry (max attempt %d of %d), "+
		"%d with a Chasm-capable stairs room",
		seeds, minRooms, maxRooms, halls, maxWalls, maxRegions, minSegment, loop4, retried, maxAttempt, p.RetryLimit, chasm)
}

// sizeShares checks that every value in r turns up in counts within tolerance
// of an even share of total: drawn uniformly.
func sizeShares(t *testing.T, what string, counts map[int]int, total int, r IntRange, tolerance float64) {
	t.Helper()
	even := float64(total) / float64(r.Max-r.Min+1)
	for v := r.Min; v <= r.Max; v++ {
		if share := float64(counts[v]) / even; math.Abs(share-1) > tolerance {
			t.Errorf("%s %d: %d of %d rooms, %.2f of an even share (tolerance %.2f)",
				what, v, counts[v], total, share, tolerance)
		}
	}
}

// FS-KE075 §A.3: a room's width and height are drawn uniformly. Each room's
// size is drawn once and only its position is retried, so a large room is
// turned away no more often than a small one.
func TestGenerateDungeon_RoomSizesDrawnUniformly(t *testing.T) {
	const seeds = 2000
	p := DungeonFloor1Params
	widths, heights := map[int]int{}, map[int]int{}
	rooms := 0
	for seed := uint64(0); seed < seeds; seed++ {
		for _, room := range generateDungeon(t, seed).Rooms {
			widths[room.Rect.W]++
			heights[room.Rect.H]++
			rooms++
		}
	}
	// about 6,500 rooms per width: sampling noise is near 1%
	sizeShares(t, "width", widths, rooms, p.RoomWidth, 0.1)
	sizeShares(t, "height", heights, rooms, p.RoomHeight, 0.1)
}

// FS-KE075 §A.3: the room count is drawn once per seed and kept across the
// retries, so it stays uniform. Starving placement makes seeds retry; it never
// changes how many rooms a seed's floor has.
func TestGenerateDungeon_RetriesKeepTheDrawnRoomCount(t *testing.T) {
	starved := DungeonFloor1Params
	starved.PlaceTries = 40
	starved.RetryLimit = 200

	retried := 0
	for seed := uint64(0); seed < 100; seed++ {
		roomy := generateDungeon(t, seed)
		tight, err := GenerateDungeon(starved, seed)
		if err != nil {
			t.Fatalf("seed %d: starved GenerateDungeon() error = %v", seed, err)
		}
		if tight.Attempt > 0 {
			retried++
		}
		if len(tight.Rooms) != len(roomy.Rooms) {
			t.Errorf("seed %d: %d rooms after %d retries, %d with placement to spare",
				seed, len(tight.Rooms), tight.Attempt, len(roomy.Rooms))
		}
	}
	if retried == 0 {
		t.Fatal("no seed in 0..99 retried; starve placement harder")
	}
}

// FS-KE075 §A.9: same seed, byte-identical layout, regions and roles.
func TestGenerateDungeon_SameSeed_ByteIdenticalJSON(t *testing.T) {
	for seed := uint64(0); seed < 20; seed++ {
		a, err := json.Marshal(generateDungeon(t, seed))
		if err != nil {
			t.Fatalf("seed %d: marshal: %v", seed, err)
		}
		b, err := json.Marshal(generateDungeon(t, seed))
		if err != nil {
			t.Fatalf("seed %d: marshal: %v", seed, err)
		}
		if !bytes.Equal(a, b) {
			t.Fatalf("seed %d: two calls give different JSON", seed)
		}
		if l := generateDungeon(t, seed); l.Seed != seed {
			t.Fatalf("seed %d: layout.Seed = %d", seed, l.Seed)
		}
	}
}

func TestGenerateDungeon_ConsecutiveSeeds_ReturnDifferentLayouts(t *testing.T) {
	const seeds = 10
	var distinct []DungeonLayout
	for seed := uint64(100); seed < 100+seeds; seed++ {
		l := generateDungeon(t, seed)
		l.Seed, l.Attempt = 0, 0 // compare shapes, not provenance
		seen := false
		for _, d := range distinct {
			if reflect.DeepEqual(d, l) {
				seen = true
				break
			}
		}
		if !seen {
			distinct = append(distinct, l)
		}
	}
	if len(distinct) < seeds {
		t.Fatalf("%d seeds gave %d distinct layouts, want %d", seeds, len(distinct), seeds)
	}
}

func TestGenerateDungeon_FirstAttemptFails_RetriesDeterministically(t *testing.T) {
	// Starve rejection sampling so first attempts fail, then show the retry
	// on a derived seed recovers the same way every time.
	p := DungeonFloor1Params
	p.PlaceTries = 40
	p.RetryLimit = 200
	for seed := uint64(0); seed < 100; seed++ {
		if _, err := buildDungeon(p, roomCount(p, seed), attemptSeed(seed, 0)); err == nil {
			continue
		}

		a, err := GenerateDungeon(p, seed)
		if err != nil {
			t.Fatalf("seed %d: GenerateDungeon() error = %v", seed, err)
		}
		if a.Attempt == 0 {
			t.Fatalf("seed %d: first attempt is invalid but Attempt = 0", seed)
		}
		if err := validateDungeon(p, a); err != nil {
			t.Fatalf("seed %d: retried layout invalid: %v", seed, err)
		}
		b, _ := GenerateDungeon(p, seed)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("seed %d: retried layouts differ between two calls", seed)
		}
		return
	}
	t.Fatal("no seed in 0..99 failed its first attempt; starve placement harder")
}

func TestGenerateDungeon_EveryAttemptFails_ReturnsErrNoLayout(t *testing.T) {
	p := DungeonFloor1Params
	p.Cols, p.Rows = 24, 16 // far too small for 18 rooms
	p.RetryLimit = 3

	_, err := GenerateDungeon(p, 7)

	if !errors.Is(err, ErrNoLayout) {
		t.Fatalf("GenerateDungeon() error = %v, want ErrNoLayout", err)
	}
}

func TestGenerateDungeon_InvalidParams_ReturnsErrInvalidParams(t *testing.T) {
	_, err := GenerateDungeon(DungeonParams{}, 1)

	if !errors.Is(err, ErrInvalidParams) {
		t.Fatalf("GenerateDungeon() error = %v, want ErrInvalidParams", err)
	}
}

// The golden pins the generator's output for one seed and is the source of the
// client's dungeon fixture (I-KE075-5). Run with -update to rewrite it.
func TestGenerateDungeon_GoldenJSON(t *testing.T) {
	l := generateDungeon(t, dungeonGoldenSeed)
	got, err := json.MarshalIndent(l, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got = append(got, '\n')
	path := filepath.Join("testdata", "dungeon_seed_20261106.golden.json")

	if *update {
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden (run with -update to create it): %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("layout for seed %d changed (run with -update if intended)\n%s",
			uint64(dungeonGoldenSeed), renderDungeonASCII(l))
	}
}

func TestDungeonFloor1Params_ApprovedNumbers(t *testing.T) {
	p := DungeonFloor1Params

	checks := []struct {
		name      string
		got, want any
	}{
		{"cell size", p.CellSize, 80.0},
		{"grid", [2]int{p.Cols, p.Rows}, [2]int{60, 40}},
		{"rooms", p.Rooms, IntRange{Min: 16, Max: 22}},
		{"room width", p.RoomWidth, IntRange{Min: 4, Max: 8}},
		{"room height", p.RoomHeight, IntRange{Min: 4, Max: 7}},
		{"room gap", p.RoomGap, 2},
		{"edge margin", p.EdgeMargin, 2},
		{"corridor width", p.CorridorWidth, IntRange{Min: 2, Max: 3}},
		{"extra edge share", p.ExtraEdgeShare, 0.1},
		{"segment max", p.SegmentMax, 12},
		{"start min", p.StartMin, 5},
		{"treasure rooms", p.TreasureRooms, IntRange{Min: 3, Max: 4}},
		{"escape door", p.EscapeDoor, false},
		{"hidden rooms", p.HiddenRooms, 0},
		{"plain rooms", [2]any{p.PlainRooms, p.PlainMin}, [2]any{2, Span{W: 6, H: 5}}},
	}
	for _, c := range checks {
		if !reflect.DeepEqual(c.got, c.want) {
			t.Errorf("%s = %v, want %v", c.name, c.got, c.want)
		}
	}
	if err := p.Validate(); err != nil {
		t.Fatalf("Validate() = %v, want nil", err)
	}
}

func TestDungeonParams_Validate_RejectsOutOfRange(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(p *DungeonParams)
	}{
		{"zero cell size", func(p *DungeonParams) { p.CellSize = 0 }},
		{"no grid", func(p *DungeonParams) { p.Cols = 0 }},
		{"room range reversed", func(p *DungeonParams) { p.Rooms = IntRange{Min: 20, Max: 19} }},
		{"too few rooms for the roles", func(p *DungeonParams) { p.Rooms = IntRange{Min: 7, Max: 28} }},
		{"room width range reversed", func(p *DungeonParams) { p.RoomWidth = IntRange{Min: 6, Max: 5} }},
		{"zero room height", func(p *DungeonParams) { p.RoomHeight = IntRange{Min: 0, Max: 8} }},
		{"room wider than the grid", func(p *DungeonParams) { p.RoomWidth = IntRange{Min: 4, Max: 69} }},
		{"zero room gap", func(p *DungeonParams) { p.RoomGap = 0 }},
		{"zero edge margin", func(p *DungeonParams) { p.EdgeMargin = 0 }},
		{"zero place tries", func(p *DungeonParams) { p.PlaceTries = 0 }},
		{"zero corridor width", func(p *DungeonParams) { p.CorridorWidth = IntRange{Min: 0, Max: 3} }},
		{"corridor as wide as the smallest room", func(p *DungeonParams) { p.CorridorWidth = IntRange{Min: 2, Max: 4} }},
		{"extra share above one", func(p *DungeonParams) { p.ExtraEdgeShare = 1.5 }},
		{"negative extra share", func(p *DungeonParams) { p.ExtraEdgeShare = -0.1 }},
		{"zero segment max", func(p *DungeonParams) { p.SegmentMax = 0 }},
		{"start bigger than any room", func(p *DungeonParams) { p.StartMin = 9 }},
		{"zero start min", func(p *DungeonParams) { p.StartMin = 0 }},
		{"treasure range reversed", func(p *DungeonParams) { p.TreasureRooms = IntRange{Min: 4, Max: 3} }},
		{"negative retry limit", func(p *DungeonParams) { p.RetryLimit = -1 }},
		{"negative hidden rooms", func(p *DungeonParams) { p.HiddenRooms = -1 }},
		{"too few rooms for the hidden rooms", func(p *DungeonParams) { p.HiddenRooms = 11 }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := DungeonFloor1Params
			tt.mutate(&p)

			if err := p.Validate(); !errors.Is(err, ErrInvalidParams) {
				t.Fatalf("Validate() = %v, want ErrInvalidParams", err)
			}
		})
	}
}

// The validator is the property test's gate, so it must reject broken layouts.
func TestValidateDungeon_BrokenLayout_ReturnsError(t *testing.T) {
	nearestOther := func(l DungeonLayout) int {
		best := -1
		for i, r := range l.Rooms {
			if i != l.Roles.Start && (best < 0 || r.Distance < l.Rooms[best].Distance) {
				best = i
			}
		}
		return best
	}
	tests := []struct {
		name   string
		mutate func(p *DungeonParams, l *DungeonLayout)
	}{
		{"bounds mismatch", func(_ *DungeonParams, l *DungeonLayout) { l.Bounds.W++ }},
		{"too many rooms for the range", func(p *DungeonParams, l *DungeonLayout) { p.Rooms.Max = len(l.Rooms) - 1 }},
		{"rooms closer than the gap", func(p *DungeonParams, _ *DungeonLayout) { p.RoomGap = 30 }},
		{"room inside the edge margin", func(p *DungeonParams, _ *DungeonLayout) { p.EdgeMargin = 20 }},
		{"room smaller than allowed", func(p *DungeonParams, _ *DungeonLayout) { p.RoomWidth.Min = 11 }},
		{"missing wall rect", func(_ *DungeonParams, l *DungeonLayout) { l.Walls = l.Walls[1:] }},
		{"overlapping wall rects", func(_ *DungeonParams, l *DungeonLayout) { l.Walls = append(l.Walls, l.Walls[0]) }},
		{"wall on void", func(_ *DungeonParams, l *DungeonLayout) {
			l.Walls = append(l.Walls, Rect{X: 0, Y: 0, W: 80, H: 80})
		}},
		{"region missing", func(_ *DungeonParams, l *DungeonLayout) { l.Regions = l.Regions[:len(l.Regions)-1] }},
		{"region ids not from 1", func(_ *DungeonParams, l *DungeonLayout) { l.Regions[0].ID = 99 }},
		{"regions overlap", func(_ *DungeonParams, l *DungeonLayout) {
			last := &l.Regions[len(l.Regions)-1]
			last.Cells = append(last.Cells, l.Rooms[0].Rect)
		}},
		{"room region is not its rect", func(_ *DungeonParams, l *DungeonLayout) {
			l.Regions[0].Cells = []CellRect{{X: l.Rooms[0].Rect.X, Y: l.Rooms[0].Rect.Y, W: 1, H: 1}}
		}},
		{"corridor segment longer than allowed", func(p *DungeonParams, _ *DungeonLayout) { p.SegmentMax = 1 }},
		{"two segments joined into one region", func(_ *DungeonParams, l *DungeonLayout) {
			n := len(l.Regions)
			l.Regions[n-2].Cells = append(l.Regions[n-2].Cells, l.Regions[n-1].Cells...)
			l.Regions = l.Regions[:n-1]
		}},
		{"walkable cell off the corridors", func(_ *DungeonParams, l *DungeonLayout) {
			l.Regions = append(l.Regions, Region{
				ID: len(l.Regions) + 1, Kind: RegionCorridor, Cells: []CellRect{{X: 1, Y: 1, W: 1, H: 1}},
			})
		}},
		{"corridor too wide", func(_ *DungeonParams, l *DungeonLayout) { l.Edges[0].Width = 4 }},
		{"extra edge missing", func(_ *DungeonParams, l *DungeonLayout) { l.Edges = l.Edges[:len(l.Edges)-1] }},
		{"edge between the wrong rooms", func(_ *DungeonParams, l *DungeonLayout) {
			e := &l.Edges[0]
			e.A, e.B = e.B, e.A
		}},
		{"doorway missing", func(_ *DungeonParams, l *DungeonLayout) { l.Rooms[0].Doorways = nil }},
		{"room linked to the wrong region", func(_ *DungeonParams, l *DungeonLayout) { l.Rooms[0].Region = 2 }},
		{"distance wrong", func(_ *DungeonParams, l *DungeonLayout) { l.Rooms[1].Distance++ }},
		{"start room too small", func(p *DungeonParams, _ *DungeonLayout) { p.StartMin = 11 }},
		{"switch and escape door share a room", func(_ *DungeonParams, l *DungeonLayout) {
			l.Roles.EscapeDoor = l.Roles.Switch
		}},
		{"escape door not the far room farthest from the stairs", func(_ *DungeonParams, l *DungeonLayout) {
			l.Roles.EscapeDoor, l.Roles.Switch = l.Roles.Switch, l.Roles.EscapeDoor
		}},
		{"a switch on floor 1", func(p *DungeonParams, l *DungeonLayout) {
			p.EscapeDoor = false
			l.Roles.EscapeDoor = noRoom
		}},
		{"no switch on floor 2+", func(_ *DungeonParams, l *DungeonLayout) {
			l.Roles.Switch, l.Roles.EscapeDoor = noRoom, noRoom
		}},
		{"stairs barred in another room", func(_ *DungeonParams, l *DungeonLayout) { l.Stairs.Room = l.Hidden[0].Room }},
		{"stairs not the farthest dead end", func(_ *DungeonParams, l *DungeonLayout) {
			l.Roles.Stairs, l.Stairs = l.Hidden[0].Room, l.Hidden[0]
		}},
		{"gate a cell short", func(_ *DungeonParams, l *DungeonLayout) {
			if l.Stairs.Barrier.W > 1 {
				l.Stairs.Barrier.W--
			} else {
				l.Stairs.Barrier.H--
			}
		}},
		{"gate segments missing", func(_ *DungeonParams, l *DungeonLayout) { l.Stairs.BarrierSegments = nil }},
		{"secret door moved", func(_ *DungeonParams, l *DungeonLayout) { l.Hidden[0].Barrier.X++ }},
		{"hidden room missing", func(_ *DungeonParams, l *DungeonLayout) { l.Hidden = nil }},
		{"hidden room asked for not there", func(p *DungeonParams, _ *DungeonLayout) { p.HiddenRooms = 2 }},
		{"hidden room holds treasure", func(_ *DungeonParams, l *DungeonLayout) { l.Roles.Treasure[0] = l.Hidden[0].Room }},
		{"chasm flag wrong", func(_ *DungeonParams, l *DungeonLayout) { l.ChasmCapable = !l.ChasmCapable }},
		{"stairs in a near room", func(_ *DungeonParams, l *DungeonLayout) { l.Roles.Stairs = nearestOther(*l) }},
		{"switch in the start room", func(_ *DungeonParams, l *DungeonLayout) { l.Roles.Switch = l.Roles.Start }},
		{"too few treasure rooms", func(_ *DungeonParams, l *DungeonLayout) { l.Roles.Treasure = l.Roles.Treasure[:2] }},
		{"treasure in the stairs room", func(_ *DungeonParams, l *DungeonLayout) { l.Roles.Treasure[0] = l.Roles.Stairs }},
		{"role room out of range", func(_ *DungeonParams, l *DungeonLayout) { l.Roles.Start = len(l.Rooms) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := DungeonFloor1Params
			p.EscapeDoor, p.HiddenRooms = true, 1
			l, err := GenerateDungeon(p, 42)
			if err != nil {
				t.Fatalf("GenerateDungeon() error = %v", err)
			}
			if err := validateDungeon(p, l); err != nil {
				t.Fatalf("unmutated layout invalid: %v", err)
			}

			tt.mutate(&p, &l)

			if err := validateDungeon(p, l); err == nil {
				t.Fatal("validateDungeon() = nil, want an error")
			}
		})
	}
}
