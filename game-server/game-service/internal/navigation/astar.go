package navigation

import (
	"math"
	"slices"
)

/*
A* over the grid's walkable cells (FS-KE075 §D R21–22, ADR-0062 Decision 2):
8-connected, a diagonal step only when both orthogonal cells it passes are
walkable (PathFinding.js's DiagonalMovement.OnlyWhenNoObstacles,
https://github.com/qiao/PathFinding.js), steps costing 1 straight and √2
diagonal, and the octile distance as the heuristic. Octile distance is
admissible and consistent for exactly these costs (Amit Patel, "Heuristics",
https://theory.stanford.edu/~amitp/GameProgramming/Heuristics.html#diagonal-distance),
so the first time the goal is taken off the open list its path is a shortest
one, and a cell once closed is never reopened.

Ties are broken deterministically: the open list orders by f, then by h (the
cell nearer the goal first), then by cell number, and neighbours are pushed in
a fixed order. The same query on the same grid always gives the same path.
*/

// step is one of the eight moves from a cell, and what it costs.
type step struct {
	dx, dy int
	cost   float64
}

// steps is the order neighbours are tried in: straight, then diagonal.
var steps = [...]step{
	{1, 0, 1}, {0, 1, 1}, {-1, 0, 1}, {0, -1, 1},
	{1, 1, math.Sqrt2}, {-1, 1, math.Sqrt2}, {-1, -1, math.Sqrt2}, {1, -1, math.Sqrt2},
}

// search is one search's scratch, kept between searches so a search does not
// allocate. A cell's cost and parent hold for this search only while its seen
// stamp is the current generation.
type search struct {
	gen    uint32
	seen   []uint32
	closed []uint32
	cost   []float64
	parent []int32
	open   []node
}

func newSearch(cells int) search {
	return search{
		seen:   make([]uint32, cells),
		closed: make([]uint32, cells),
		cost:   make([]float64, cells),
		parent: make([]int32, cells),
	}
}

// node is a cell on the open list: f = cost so far + h.
type node struct {
	f, h float64
	cell int32
}

// before is the open list's order.
func (a node) before(b node) bool {
	if a.f != b.f {
		return a.f < b.f
	}
	if a.h != b.h {
		return a.h < b.h
	}
	return a.cell < b.cell
}

/*
Path appends to dst a shortest path of cells from from to to, both ends
included, and reports whether there is one. With none (either end on rock or
off the grid, or the two walled apart) dst comes back as it was. A valid floor
is connected (FS-KE075 §A.8), so a search between two walkable cells of one
never fails.
*/
func (g *Grid) Path(dst []int, from, to int) ([]int, bool) {
	if !g.valid(from) || !g.valid(to) {
		return dst, false
	}
	s := &g.search
	s.begin()

	tx, ty := to%g.cols, to/g.cols
	s.reach(from, 0, -1)
	s.push(node{f: g.octile(from, tx, ty), h: g.octile(from, tx, ty), cell: int32(from)})

	for len(s.open) > 0 {
		n := s.pop()
		c := int(n.cell)
		if s.closed[c] == s.gen {
			continue // a stale entry: c was pushed again cheaper and closed
		}
		s.closed[c] = s.gen
		if c == to {
			return s.trace(dst, to), true
		}

		cx, cy := c%g.cols, c/g.cols
		for _, st := range steps {
			nx, ny := cx+st.dx, cy+st.dy
			if !g.ground(nx, ny) {
				continue
			}
			// no corner cutting: a diagonal passes both orthogonal cells
			if st.dx != 0 && st.dy != 0 && (!g.ground(cx+st.dx, cy) || !g.ground(cx, cy+st.dy)) {
				continue
			}
			next := ny*g.cols + nx
			if s.closed[next] == s.gen {
				continue
			}
			cost := s.cost[c] + st.cost
			if s.seen[next] == s.gen && cost >= s.cost[next] {
				continue
			}
			s.reach(next, cost, c)
			h := g.octile(next, tx, ty)
			s.push(node{f: cost + h, h: h, cell: int32(next)})
		}
	}
	return dst, false
}

// octile is the octile distance from cell to column tx, row ty: the cheapest
// path on open ground (Patel).
func (g *Grid) octile(cell, tx, ty int) float64 {
	dx, dy := math.Abs(float64(cell%g.cols-tx)), math.Abs(float64(cell/g.cols-ty))
	return max(dx, dy) + (math.Sqrt2-1)*min(dx, dy)
}

// begin starts a search: a new generation, so every stamp from the last one
// is stale, and an empty open list.
func (s *search) begin() {
	s.gen++
	if s.gen == 0 {
		// wrapped: stamps from 2^32 searches ago would read as current
		clear(s.seen)
		clear(s.closed)
		s.gen = 1
	}
	s.open = s.open[:0]
}

// reach records the cheapest way to cell found so far.
func (s *search) reach(cell int, cost float64, parent int) {
	s.seen[cell] = s.gen
	s.cost[cell] = cost
	s.parent[cell] = int32(parent)
}

// trace appends the path ending at to, start first, by its parents.
func (s *search) trace(dst []int, to int) []int {
	n := 0
	for c := to; c >= 0; c = int(s.parent[c]) {
		n++
	}
	dst = slices.Grow(dst, n)
	dst = dst[:len(dst)+n]
	i := len(dst) - 1
	for c := to; c >= 0; c = int(s.parent[c]) {
		dst[i] = c
		i--
	}
	return dst
}

// push adds n to the open list, a binary min-heap by before.
func (s *search) push(n node) {
	s.open = append(s.open, n)
	i := len(s.open) - 1
	for i > 0 {
		parent := (i - 1) / 2
		if !s.open[i].before(s.open[parent]) {
			break
		}
		s.open[i], s.open[parent] = s.open[parent], s.open[i]
		i = parent
	}
}

// pop takes the first node off the open list.
func (s *search) pop() node {
	top := s.open[0]
	last := len(s.open) - 1
	s.open[0] = s.open[last]
	s.open = s.open[:last]
	i := 0
	for {
		l, r, least := 2*i+1, 2*i+2, i
		if l < last && s.open[l].before(s.open[least]) {
			least = l
		}
		if r < last && s.open[r].before(s.open[least]) {
			least = r
		}
		if least == i {
			return top
		}
		s.open[i], s.open[least] = s.open[least], s.open[i]
		i = least
	}
}
