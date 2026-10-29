package levelgen

import (
	"errors"
	"fmt"
	"math/rand/v2"
)

// ErrNoLayout is returned, wrapped, when every attempt for a seed failed.
var ErrNoLayout = errors.New("levelgen: no valid layout")

// branchTries is how many roots and headings one branch tries before it is dropped.
const branchTries = 8

// Generate returns the layout for p and seed. It tries the seed itself first,
// then seeds derived from it (attempt 1..p.RetryLimit), and returns the first
// layout that passes validation, so the same seed always yields the same layout.
func Generate(p Params, seed uint64) (Layout, error) {
	if err := p.Validate(); err != nil {
		return Layout{}, fmt.Errorf("generate: %w", err)
	}
	var lastErr error
	for attempt := 0; attempt <= p.RetryLimit; attempt++ {
		layout := newBuilder(p, attemptSeed(seed, attempt)).build()
		layout.Seed, layout.Attempt = seed, attempt
		if lastErr = validate(p, layout); lastErr == nil {
			return layout, nil
		}
	}
	return Layout{}, fmt.Errorf("generate seed %d after %d attempts: %w: last attempt: %w",
		seed, p.RetryLimit+1, ErrNoLayout, lastErr)
}

// attemptSeed derives attempt n's seed from the original; attempt 0 mixes the
// seed itself, so nearby seeds still give unrelated walks.
func attemptSeed(seed uint64, attempt int) uint64 {
	return splitmix64(seed + uint64(attempt)*0x9E3779B97F4A7C15)
}

func splitmix64(x uint64) uint64 {
	x += 0x9E3779B97F4A7C15
	x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9
	x = (x ^ (x >> 27)) * 0x94D049BB133111EB
	return x ^ (x >> 31)
}

// dir is a step on the trail lattice.
type dir struct{ dx, dy int }

var (
	north = dir{0, -1}
	east  = dir{1, 0}
	south = dir{0, 1}
	west  = dir{-1, 0}
)

func (d dir) sideways() [2]dir { return [2]dir{{d.dy, d.dx}, {-d.dy, -d.dx}} }

// inward is the direction away from side s.
func (s Side) inward() dir {
	switch s {
	case SideNorth:
		return south
	case SideSouth:
		return north
	case SideWest:
		return east
	default:
		return west
	}
}

// span is a cell rect [x0, x1) x [y0, y1).
type span struct{ x0, y0, x1, y1 int }

// node is one trail step: a TrailWidth-square block on the lattice.
type node struct {
	lx, ly int
	// parent is the node this one was walked from; -1 for the mouth node.
	parent int
}

type trailState struct {
	nodes []int // node ids in walk order
	// parent is the trail this one sprouted from; -1 for the main trail.
	parent int
	depth  int
	// roots are the indices in nodes that a branch sprouted from.
	roots []int
}

// builder runs one attempt. Trails walk a lattice whose pitch is TrailWidth+Gap
// cells, so blocks of lattice neighbours that are not joined always keep Gap
// cells of wall between them and a tree of steps carves a tree of trails.
// Clearings bulge off the lattice, so every carve also checks an owner grid:
// nothing may come within Gap cells of a node more than two steps away, nor of
// any clearing's bulge.
type builder struct {
	p   Params
	rng *rand.Rand

	pitch, ox, oy, nx, ny int

	owner   []int  // per cell: the node id that carved it, or -1
	bulge   []bool // per cell: carved by a clearing, off the lattice
	lattice []int  // per lattice point: the node id on it, or -1
	nodes   []node
	trails  []trailState
}

func newBuilder(p Params, seed uint64) *builder {
	b := &builder{
		p:     p,
		rng:   rand.New(rand.NewPCG(seed, splitmix64(seed))),
		pitch: p.TrailWidth + p.Gap,
	}
	b.nx, b.ox = b.fit(p.Cols)
	b.ny, b.oy = b.fit(p.Rows)
	b.owner = make([]int, p.Cols*p.Rows)
	b.bulge = make([]bool, p.Cols*p.Rows)
	for i := range b.owner {
		b.owner[i] = -1
	}
	b.lattice = make([]int, b.nx*b.ny)
	for i := range b.lattice {
		b.lattice[i] = -1
	}
	return b
}

// fit returns how many lattice points fit across n cells inside the border and
// the cell offset that centres them.
func (b *builder) fit(n int) (count, offset int) {
	inner := n - 2*b.p.Border + b.p.Gap
	count = inner / b.pitch
	return count, b.p.Border + (inner-count*b.pitch)/2
}

func (b *builder) build() Layout {
	if !b.growMain() {
		return b.layout()
	}
	for range b.pick(b.p.Branches) {
		for range branchTries {
			if b.growBranch() {
				break
			}
		}
	}
	return b.layout()
}

// growMain places the mouth node, walks the main trail until it covers the
// span share (or boxes in) and opens its clearing.
func (b *builder) growMain() bool {
	lx, ly := b.mouthLattice()
	id := b.addNode(lx, ly, -1)
	b.claim(b.block(lx, ly), id)
	b.claim(b.mouthCut(lx, ly), id)
	b.trails = append(b.trails, trailState{nodes: []int{id}, parent: -1})

	covered := func() bool {
		return mainCoverage(b.p, b.trailPoints(0)) >= b.p.SpanShare
	}
	b.walk(0, b.p.Entrance.inward(), -1, covered)
	return b.openClearing(0)
}

// growBranch sprouts one branch from a seeded root and heading, walks it and
// opens its clearing. It leaves no trace when it fails.
func (b *builder) growBranch() bool {
	type root struct{ trail, index int }
	var roots []root
	for t, tr := range b.trails {
		if tr.depth >= b.p.MaxBranchDepth {
			continue
		}
		for i := 1; i < len(tr.nodes)-1; i++ {
			if !tr.nearRoot(i) {
				roots = append(roots, root{t, i})
			}
		}
	}
	if len(roots) == 0 {
		return false
	}
	r := roots[b.rng.IntN(len(roots))]
	rootID := b.trails[r.trail].nodes[r.index]

	heads := [4]dir{north, east, south, west}
	b.rng.Shuffle(len(heads), func(i, j int) { heads[i], heads[j] = heads[j], heads[i] })
	for _, heading := range heads {
		first, ok := b.step(rootID, heading)
		if !ok {
			continue
		}
		t := len(b.trails)
		b.trails = append(b.trails, trailState{
			nodes:  []int{first},
			parent: r.trail,
			depth:  b.trails[r.trail].depth + 1,
		})
		b.walk(t, heading, b.pick(b.p.BranchSteps)-1, nil)
		if !b.openClearing(t) {
			b.trails = b.trails[:t]
			return false
		}
		parent := &b.trails[r.trail]
		parent.roots = append(parent.roots, r.index)
		return true
	}
	return false
}

// pick draws a seeded value from r.
func (b *builder) pick(r IntRange) int { return r.Min + b.rng.IntN(r.Max-r.Min+1) }

// nearRoot reports whether index i is a root or next to one on this trail.
func (tr trailState) nearRoot(i int) bool {
	for _, r := range tr.roots {
		if i >= r-1 && i <= r+1 {
			return true
		}
	}
	return false
}

// walk extends trail t up to steps more steps (-1: unbounded), forward-biased
// along heading, never stepping back against it. It stops early when done
// reports true or when every way on is blocked.
func (b *builder) walk(t int, heading dir, steps int, done func() bool) {
	for n := 0; steps < 0 || n < steps; n++ {
		if done != nil && done() {
			return
		}
		side := heading.sideways()
		if b.rng.IntN(2) == 1 {
			side[0], side[1] = side[1], side[0]
		}
		order := [3]dir{heading, side[0], side[1]}
		if b.rng.Float64() < b.p.TurnChance {
			order = [3]dir{side[0], side[1], heading}
		}
		head := b.trails[t].nodes[len(b.trails[t].nodes)-1]
		placed := false
		for _, d := range order {
			if id, ok := b.step(head, d); ok {
				b.trails[t].nodes = append(b.trails[t].nodes, id)
				placed = true
				break
			}
		}
		if !placed {
			return
		}
	}
}

// step carves a new node one lattice point from node `from` in direction d,
// with the edge joining them, if it keeps its distance from everything else.
func (b *builder) step(from int, d dir) (int, bool) {
	f := b.nodes[from]
	lx, ly := f.lx+d.dx, f.ly+d.dy
	if lx < 0 || ly < 0 || lx >= b.nx || ly >= b.ny || b.lattice[ly*b.nx+lx] >= 0 {
		return -1, false
	}
	block, edge := b.block(lx, ly), b.edge(f.lx, f.ly, lx, ly)
	allowed := b.near(from, 1)
	if !b.clear(b.cells(block), allowed) || !b.clear(b.cells(edge), allowed) {
		return -1, false
	}
	id := b.addNode(lx, ly, from)
	b.claim(block, id)
	b.claim(edge, id)
	return id, true
}

// openClearing carves the clearing at trail t's end. A clearing that would
// crowd another trail pops the end node and tries one step back; a branch
// popped to nothing (or a main trail popped to its mouth) fails.
func (b *builder) openClearing(t int) bool {
	tr := &b.trails[t]
	for len(tr.nodes) > 0 {
		end := tr.nodes[len(tr.nodes)-1]
		cells := clearingCells(b.p, b.center(end))
		if b.clear(cells, b.near(end, 2)) {
			for _, c := range cells {
				if b.owner[c] < 0 {
					b.owner[c] = end
					b.bulge[c] = true
				}
			}
			return true
		}
		if t == 0 && len(tr.nodes) == 1 {
			return false
		}
		// trails grow one at a time, so a trail's end is the newest node; were
		// it not, the clearing fails rather than unpick another trail
		if !b.popNode(end) {
			return false
		}
		tr.nodes = tr.nodes[:len(tr.nodes)-1]
	}
	return false
}

// near returns node id and every node within hops tree steps of it.
func (b *builder) near(id, hops int) []int {
	set := []int{id}
	for frontier := []int{id}; hops > 0; hops-- {
		var next []int
		for _, n := range frontier {
			if p := b.nodes[n].parent; p >= 0 && !contains(set, p) {
				next = append(next, p)
				set = append(set, p)
			}
			for c, cn := range b.nodes {
				if cn.parent == n && !contains(set, c) {
					next = append(next, c)
					set = append(set, c)
				}
			}
		}
		frontier = next
	}
	return set
}

// clear reports whether every cell within Gap of cells is uncarved or carved
// on the lattice by one of the allowed nodes.
func (b *builder) clear(cells []int, allowed []int) bool {
	g, cols, rows := b.p.Gap, b.p.Cols, b.p.Rows
	for _, c := range cells {
		cx, cy := c%cols, c/cols
		for y := max(0, cy-g); y <= min(rows-1, cy+g); y++ {
			for x := max(0, cx-g); x <= min(cols-1, cx+g); x++ {
				i := y*cols + x
				if o := b.owner[i]; o >= 0 && (b.bulge[i] || !contains(allowed, o)) {
					return false
				}
			}
		}
	}
	return true
}

func (b *builder) addNode(lx, ly, parent int) int {
	id := len(b.nodes)
	b.nodes = append(b.nodes, node{lx: lx, ly: ly, parent: parent})
	b.lattice[ly*b.nx+lx] = id
	return id
}

// popNode removes the most recently added node and everything it carved. Any
// other id is refused, changing nothing: the node list is truncated at id, so
// popping an older node would drop every node added after it.
func (b *builder) popNode(id int) bool {
	if id != len(b.nodes)-1 {
		return false
	}
	for i, o := range b.owner {
		if o == id {
			b.owner[i] = -1
			b.bulge[i] = false
		}
	}
	n := b.nodes[id]
	b.lattice[n.ly*b.nx+n.lx] = -1
	b.nodes = b.nodes[:id]
	return true
}

func (b *builder) claim(s span, id int) {
	for _, c := range b.cells(s) {
		if b.owner[c] < 0 {
			b.owner[c] = id
		}
	}
}

// block is the cell span of the lattice point (lx, ly).
func (b *builder) block(lx, ly int) span {
	x, y := b.ox+lx*b.pitch, b.oy+ly*b.pitch
	return span{x, y, x + b.p.TrailWidth, y + b.p.TrailWidth}
}

// edge is the gap span joining two neighbouring lattice points.
func (b *builder) edge(ax, ay, bx, by int) span {
	a, c := b.block(ax, ay), b.block(bx, by)
	if ay == by {
		return span{min(a.x1, c.x1), a.y0, max(a.x0, c.x0), a.y1}
	}
	return span{a.x0, min(a.y1, c.y1), a.x1, max(a.y0, c.y0)}
}

// mouthLattice picks the mouth's lattice point on the entrance side, at a
// seeded position away from the corners when the side is long enough.
//
// On a side of three or more points it draws twice and keeps the second draw.
// The first is wasted, but it is part of the seeded stream: dropping it shifts
// every later draw and changes the layout every seed generates (the golden
// layout fails), so it stays until a deliberate layout change re-pins it.
func (b *builder) mouthLattice() (int, int) {
	along := b.ny
	if b.p.Entrance == SideNorth || b.p.Entrance == SideSouth {
		along = b.nx
	}
	pos := b.rng.IntN(along)
	if along >= 3 {
		pos = 1 + b.rng.IntN(along-2)
	}
	switch b.p.Entrance {
	case SideNorth:
		return pos, 0
	case SideSouth:
		return pos, b.ny - 1
	case SideWest:
		return 0, pos
	default:
		return b.nx - 1, pos
	}
}

// mouthCut is the span from the mouth node's block through the border.
func (b *builder) mouthCut(lx, ly int) span {
	s := b.block(lx, ly)
	switch b.p.Entrance {
	case SideNorth:
		return span{s.x0, 0, s.x1, s.y0}
	case SideSouth:
		return span{s.x0, s.y1, s.x1, b.p.Rows}
	case SideWest:
		return span{0, s.y0, s.x0, s.y1}
	default:
		return span{s.x1, s.y0, b.p.Cols, s.y1}
	}
}

// center is the centre of node id's block in px.
func (b *builder) center(id int) Point {
	s := b.block(b.nodes[id].lx, b.nodes[id].ly)
	half := float64(b.p.TrailWidth) / 2
	return Point{
		X: (float64(s.x0) + half) * b.p.CellSize,
		Y: (float64(s.y0) + half) * b.p.CellSize,
	}
}

func (b *builder) trailPoints(t int) []Point {
	ids := b.trails[t].nodes
	pts := make([]Point, len(ids))
	for i, id := range ids {
		pts[i] = b.center(id)
	}
	return pts
}

func (b *builder) layout() Layout {
	p := b.p
	l := Layout{Bounds: Size{W: float64(p.Cols) * p.CellSize, H: float64(p.Rows) * p.CellSize}}

	wall := make([]bool, len(b.owner))
	for i, o := range b.owner {
		wall[i] = o < 0
		if o >= 0 {
			l.Open = append(l.Open, cellCenter(p, i))
		}
	}
	l.Walls = mergeWalls(p.Cols, p.Rows, wall, p.CellSize)

	if len(b.trails) == 0 {
		return l
	}
	mouth := b.mouthCut(b.nodes[0].lx, b.nodes[0].ly)
	l.Entrance = Entrance{Side: p.Entrance, At: b.mouthPoint(mouth)}
	for t, tr := range b.trails {
		pts := b.trailPoints(t)
		l.Trails = append(l.Trails, Trail{Points: pts, Parent: tr.parent})
		l.DeadEnds = append(l.DeadEnds, DeadEnd{
			Center: pts[len(pts)-1],
			Radius: float64(p.ClearingRadius) * p.CellSize,
			Trail:  t,
			Main:   t == 0,
		})
	}
	return l
}

// mouthPoint is the centre of the mouth's opening across the border band.
func (b *builder) mouthPoint(cut span) Point {
	p := b.p
	cx := float64(cut.x0+cut.x1) / 2
	cy := float64(cut.y0+cut.y1) / 2
	half := float64(p.Border) / 2
	switch p.Entrance {
	case SideNorth:
		cy = half
	case SideSouth:
		cy = float64(p.Rows) - half
	case SideWest:
		cx = half
	default:
		cx = float64(p.Cols) - half
	}
	return Point{X: cx * p.CellSize, Y: cy * p.CellSize}
}

// cells lists the cell indices of s, row by row.
func (b *builder) cells(s span) []int {
	out := make([]int, 0, (s.x1-s.x0)*(s.y1-s.y0))
	for y := s.y0; y < s.y1; y++ {
		for x := s.x0; x < s.x1; x++ {
			out = append(out, y*b.p.Cols+x)
		}
	}
	return out
}

func contains(s []int, v int) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
