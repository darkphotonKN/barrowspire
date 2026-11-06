package navigation_test

import (
	"container/heap"
	"math"
	"math/rand/v2"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/navigation"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const cell = 80.0

// gridOf reads a hand-made grid: '.' is walkable, '#' is rock. Every row is
// the same length.
func gridOf(t testing.TB, rows ...string) (*navigation.Grid, int) {
	t.Helper()
	cols := len(rows[0])
	walkable := make([]bool, 0, cols*len(rows))
	for _, row := range rows {
		require.Len(t, row, cols)
		for _, c := range row {
			walkable = append(walkable, c == '.')
		}
	}
	return navigation.NewGrid(cols, len(rows), cell, walkable), cols
}

// at is the index of the cell at column x, row y.
func at(cols, x, y int) int { return y*cols + x }

// cost is what a path costs: 1 a straight step, √2 a diagonal one.
func cost(cols int, path []int) float64 {
	total := 0.0
	for i := 1; i < len(path); i++ {
		dx := path[i]%cols - path[i-1]%cols
		dy := path[i]/cols - path[i-1]/cols
		if dx != 0 && dy != 0 {
			total += math.Sqrt2
		} else {
			total++
		}
	}
	return total
}

// legal fails unless every step of path is one the step rule allows: to an
// 8-neighbour, diagonal only when both orthogonal cells are walkable.
func legal(t *testing.T, g *navigation.Grid, path []int) {
	t.Helper()
	for i := 1; i < len(path); i++ {
		assert.True(t, g.Near(path[i-1], path[i]), "step %d: %d -> %d breaks the step rule", i, path[i-1], path[i])
		assert.NotEqual(t, path[i-1], path[i], "step %d stands still", i)
	}
}

// A diagonal step past a rock corner is never taken: the path goes round by
// the orthogonal cell. FS-KE075 §D R22 (PathFinding.js OnlyWhenNoObstacles).
func TestPath_BlockedCorner_NoDiagonalThroughIt(t *testing.T) {
	g, cols := gridOf(t,
		".#.",
		"...",
		"...",
	)

	path, ok := g.Path(nil, at(cols, 0, 0), at(cols, 1, 1))

	require.True(t, ok)
	assert.Equal(t, []int{at(cols, 0, 0), at(cols, 0, 1), at(cols, 1, 1)}, path)
}

// With both orthogonal cells walkable the diagonal is one step of √2.
func TestPath_OpenCorner_StepsDiagonally(t *testing.T) {
	g, cols := gridOf(t,
		"..",
		"..",
	)

	path, ok := g.Path(nil, at(cols, 0, 0), at(cols, 1, 1))

	require.True(t, ok)
	assert.Equal(t, []int{at(cols, 0, 0), at(cols, 1, 1)}, path)
}

// Round a wall the path is the shortest one: here the gap at the bottom.
func TestPath_AroundAWall_IsShortest(t *testing.T) {
	g, cols := gridOf(t,
		"..#..",
		"..#..",
		"..#..",
		".....",
	)

	path, ok := g.Path(nil, at(cols, 0, 0), at(cols, 4, 0))

	require.True(t, ok)
	legal(t, g, path)
	assert.Equal(t, at(cols, 0, 0), path[0])
	assert.Equal(t, at(cols, 4, 0), path[len(path)-1])
	// down to the gap and back up: 2+√2 each way, and 2 through the gap
	assert.InDelta(t, 6+2*math.Sqrt2, cost(cols, path), 1e-9)
}

// On open ground a path costs exactly the octile distance: the heuristic is
// exact there, as an admissible one must be at most (Patel, "Heuristics").
func TestPath_OpenGround_CostsTheOctileDistance(t *testing.T) {
	g, cols := gridOf(t,
		"........",
		"........",
		"........",
		"........",
		"........",
	)
	for _, to := range [][2]int{{7, 4}, {3, 0}, {0, 4}, {5, 2}, {7, 0}} {
		path, ok := g.Path(nil, at(cols, 0, 0), at(cols, to[0], to[1]))
		require.True(t, ok)
		legal(t, g, path)
		dx, dy := float64(to[0]), float64(to[1])
		octile := max(dx, dy) + (math.Sqrt2-1)*min(dx, dy)
		assert.InDelta(t, octile, cost(cols, path), 1e-9, "to %v", to)
	}
}

// The same query always gives the same path, ties included: on open ground
// many paths cost the same, and the one returned is pinned.
func TestPath_Ties_AreBrokenDeterministically(t *testing.T) {
	g, cols := gridOf(t,
		"....",
		"....",
		"....",
	)
	from, to := at(cols, 0, 0), at(cols, 3, 1)

	first, ok := g.Path(nil, from, to)
	require.True(t, ok)
	for range 20 {
		again, _ := g.Path(nil, from, to)
		assert.Equal(t, first, again)
	}
	assert.Equal(t, []int{at(cols, 0, 0), at(cols, 1, 1), at(cols, 2, 1), at(cols, 3, 1)}, first)
}

// Start and goal in one cell: the path is that cell.
func TestPath_SameCell_IsThatCell(t *testing.T) {
	g, cols := gridOf(t, "...")

	path, ok := g.Path(nil, at(cols, 1, 0), at(cols, 1, 0))

	require.True(t, ok)
	assert.Equal(t, []int{at(cols, 1, 0)}, path)
}

// No path: walled off, from rock or to rock, or off the grid. dst comes back
// as it was given. FS-KE075 §D R27.
func TestPath_NoPath_ReportsFalse(t *testing.T) {
	g, cols := gridOf(t,
		"..#..",
		"..#..",
	)
	tests := []struct {
		name     string
		from, to int
	}{
		{"walled off", at(cols, 0, 0), at(cols, 4, 0)},
		{"to rock", at(cols, 0, 0), at(cols, 2, 0)},
		{"from rock", at(cols, 2, 1), at(cols, 0, 0)},
		{"off the grid", at(cols, 0, 0), 99},
		{"negative", -1, at(cols, 0, 0)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dst := []int{7}
			path, ok := g.Path(dst, tt.from, tt.to)
			assert.False(t, ok)
			assert.Equal(t, []int{7}, path)
		})
	}
}

// The path is appended to dst, so a caller reuses its buffer.
func TestPath_AppendsToDst(t *testing.T) {
	g, cols := gridOf(t, "...")

	path, ok := g.Path(make([]int, 0, 8)[:0], at(cols, 0, 0), at(cols, 2, 0))

	require.True(t, ok)
	assert.Equal(t, []int{0, 1, 2}, path)
}

// On random grids every path A* returns is legal and costs what a plain
// Dijkstra over the same step rule finds, and A* finds a path exactly when
// Dijkstra does.
func TestPath_RandomGrids_MatchDijkstra(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	const cols, rows = 14, 10
	for trial := range 200 {
		walkable := make([]bool, cols*rows)
		for c := range walkable {
			walkable[c] = rng.Float64() > 0.3
		}
		g := navigation.NewGrid(cols, rows, cell, walkable)
		from, to := rng.IntN(cols*rows), rng.IntN(cols*rows)

		path, ok := g.Path(nil, from, to)
		want, reachable := dijkstra(cols, rows, walkable, from, to)

		require.Equal(t, reachable, ok, "trial %d: from %d to %d", trial, from, to)
		if !ok {
			continue
		}
		legal(t, g, path)
		assert.Equal(t, from, path[0])
		assert.Equal(t, to, path[len(path)-1])
		assert.InDelta(t, want, cost(cols, path), 1e-9, "trial %d", trial)
	}
}

// dijkstra is the cost of the cheapest path from from to to under the step
// rule, by plain Dijkstra: the reference A* is held to.
func dijkstra(cols, rows int, walkable []bool, from, to int) (float64, bool) {
	if !walkable[from] || !walkable[to] {
		return 0, false
	}
	open := func(x, y int) bool { return x >= 0 && y >= 0 && x < cols && y < rows && walkable[y*cols+x] }
	dist := make([]float64, cols*rows)
	for i := range dist {
		dist[i] = math.Inf(1)
	}
	dist[from] = 0
	q := &queue{{from, 0}}
	for q.Len() > 0 {
		n := heap.Pop(q).(item)
		if n.d > dist[n.cell] {
			continue
		}
		x, y := n.cell%cols, n.cell/cols
		for dy := -1; dy <= 1; dy++ {
			for dx := -1; dx <= 1; dx++ {
				if (dx == 0 && dy == 0) || !open(x+dx, y+dy) {
					continue
				}
				step := 1.0
				if dx != 0 && dy != 0 {
					if !open(x+dx, y) || !open(x, y+dy) {
						continue
					}
					step = math.Sqrt2
				}
				next := (y+dy)*cols + x + dx
				if d := n.d + step; d < dist[next]-1e-12 {
					dist[next] = d
					heap.Push(q, item{next, d})
				}
			}
		}
	}
	return dist[to], !math.IsInf(dist[to], 1)
}

type item struct {
	cell int
	d    float64
}

type queue []item

func (q queue) Len() int           { return len(q) }
func (q queue) Less(i, j int) bool { return q[i].d < q[j].d }
func (q queue) Swap(i, j int)      { q[i], q[j] = q[j], q[i] }
func (q *queue) Push(x any)        { *q = append(*q, x.(item)) }
func (q *queue) Pop() any {
	old := *q
	n := old[len(old)-1]
	*q = old[:len(old)-1]
	return n
}

// Cell is the walkable cell holding a point; rock and off the grid are not.
func TestCell(t *testing.T) {
	g, cols := gridOf(t,
		".#",
		"..",
	)
	tests := []struct {
		name   string
		x, y   float64
		want   int
		wantOK bool
	}{
		{"walkable", 40, 40, at(cols, 0, 0), true},
		{"walkable, far corner", 159.9, 159.9, at(cols, 1, 1), true},
		{"on the shared edge, the right cell", 80, 120, at(cols, 1, 1), true},
		{"rock", 120, 40, 0, false},
		{"off the grid", 200, 40, 0, false},
		{"negative", -1, 40, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := g.Cell(tt.x, tt.y)
			assert.Equal(t, tt.wantOK, ok)
			if tt.wantOK {
				assert.Equal(t, tt.want, got)
			}
		})
	}
}

func TestCentre(t *testing.T) {
	g, cols := gridOf(t, "...", "...")

	x, y := g.Centre(at(cols, 2, 1))

	assert.Equal(t, 200.0, x)
	assert.Equal(t, 120.0, y)
}

// Near is the step rule: the same cell, or a walkable 8-neighbour reached
// without cutting a corner. FS-KE075 §D R23.
func TestNear(t *testing.T) {
	g, cols := gridOf(t,
		".#..",
		"....",
		"...#",
	)
	tests := []struct {
		name string
		a, b int
		want bool
	}{
		{"same cell", at(cols, 0, 0), at(cols, 0, 0), true},
		{"orthogonal", at(cols, 0, 1), at(cols, 1, 1), true},
		{"open diagonal", at(cols, 0, 1), at(cols, 1, 2), true},
		{"diagonal past a rock corner", at(cols, 0, 0), at(cols, 1, 1), false},
		{"diagonal past the other rock corner", at(cols, 2, 2), at(cols, 3, 1), false},
		{"to rock", at(cols, 0, 0), at(cols, 1, 0), false},
		{"two apart", at(cols, 0, 1), at(cols, 2, 1), false},
		{"wraps a row end", at(cols, 3, 0), at(cols, 0, 1), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, g.Near(tt.a, tt.b))
			assert.Equal(t, tt.want, g.Near(tt.b, tt.a), "symmetric")
		})
	}
}

// Clear is whether a body of half-size 20 moving straight from a to b only
// ever overlaps walkable cells: the test a corner cut has to pass.
func TestClear(t *testing.T) {
	g, _ := gridOf(t,
		"#..",
		"...",
		"...",
	)
	const half = 20.0
	tests := []struct {
		name           string
		ax, ay, bx, by float64
		want           bool
	}{
		{"centre to orthogonal centre", 120, 120, 200, 120, true},
		{"centre to open diagonal centre", 120, 120, 200, 200, true},
		{"centre to diagonal centre past the rock corner", 120, 120, 40, 40, false},
		{"across the room, clear of the rock", 200, 40, 40, 200, true},
		{"long and open", 120, 40, 200, 200, true},
		// in the middle cell, overlapping the cell above it, heading for the
		// centre left: the body's top-left corner would clip the rock
		{"hugging the rock corner", 130, 85, 40, 120, false},
		{"from there to its own cell's centre first", 130, 85, 120, 120, true},
		{"standing still, clear", 120, 120, 120, 120, true},
		{"into rock", 120, 40, 40, 40, false},
		{"off the grid", 200, 200, 260, 200, false},
		{"just touching the rock's edge is not overlapping it", 100, 40, 100, 40, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, g.Clear(tt.ax, tt.ay, tt.bx, tt.by, half))
		})
	}
}

// Within is the walkable cells whose centres lie within radius of a point, row
// by row: where a monster may wander to. FS-KE075 §D R25.
func TestWithin(t *testing.T) {
	g, cols := gridOf(t,
		".....",
		"..#..",
		".....",
	)

	// from the centre of (2,1), 100 px: the four orthogonal centres are 80 away,
	// the diagonals 113
	got := g.Within(nil, 200, 120, 100)

	assert.Equal(t, []int{at(cols, 2, 0), at(cols, 1, 1), at(cols, 3, 1), at(cols, 2, 2)}, got)
}

// Within keeps nothing on rock or off the grid, and appends to dst.
func TestWithin_EdgeOfTheGrid(t *testing.T) {
	g, cols := gridOf(t,
		"#.",
		"..",
	)

	got := g.Within([]int{9}, 0, 0, 180)

	assert.Equal(t, []int{9, at(cols, 1, 0), at(cols, 0, 1), at(cols, 1, 1)}, got)
}

// floor1Grid is a generated floor 1's navigation grid: its walkable cells.
func floor1Grid(tb testing.TB, seed uint64) (*navigation.Grid, []int) {
	tb.Helper()
	l, err := levelgen.GenerateDungeon(levelgen.DungeonFloor1Params, seed)
	require.NoError(tb, err)
	regions := l.Grid()
	walkable := make([]bool, len(regions))
	var open []int
	for c, r := range regions {
		walkable[c] = r != 0
		if walkable[c] {
			open = append(open, c)
		}
	}
	return navigation.NewGrid(l.Cols, l.Rows, l.CellSize, walkable), open
}

// Every walkable cell of a generated floor 1 reaches every other (§A.8), so a
// search between any two never fails.
func TestPath_Floor1_EveryPairReachable(t *testing.T) {
	for seed := range uint64(5) {
		g, open := floor1Grid(t, seed)
		rng := rand.New(rand.NewPCG(seed, 9))
		for range 200 {
			from, to := open[rng.IntN(len(open))], open[rng.IntN(len(open))]
			_, ok := g.Path(nil, from, to)
			require.True(t, ok, "seed %d: %d -> %d", seed, from, to)
		}
	}
}

// One search on floor 1's 72x48 grid between random walkable cells, as the
// monster AI makes them: FS-KE075 §D cost per call.
func BenchmarkPath_Floor1_Random(b *testing.B) {
	g, open := floor1Grid(b, 3)
	rng := rand.New(rand.NewPCG(3, 4))
	pairs := make([][2]int, 1024)
	for i := range pairs {
		pairs[i] = [2]int{open[rng.IntN(len(open))], open[rng.IntN(len(open))]}
	}
	buf := make([]int, 0, 256)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		p := pairs[i%len(pairs)]
		buf, _ = g.Path(buf[:0], p[0], p[1])
	}
}

// The worst search on floor 1: between the two walkable cells farthest apart
// by path, which expands nearly the whole floor.
func BenchmarkPath_Floor1_Farthest(b *testing.B) {
	g, open := floor1Grid(b, 3)
	from, to := open[0], open[len(open)-1]
	buf := make([]int, 0, 256)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		buf, _ = g.Path(buf[:0], from, to)
	}
}
