package passivetree

import (
	"errors"
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-8RZ51 §Change: Tree v2 V10–V11. The tree's math, computed from the
// definition by walking requires, never from constants, so a shape change
// that breaks it fails here.

// cheapestPath is the fewest points that make target takeable and then take
// it, and the nodes they buy in spend order: a shortest walk over requires
// with one point per node (a link needs rank 1 only), through nodes allowed
// only. It ignores sides, so it is a lower bound; legalPath replays it
// through the rule to prove it is also a spend order.
func cheapestPath(nodes []Node, allowed func(Node) bool, target string) (int, []string) {
	const unreached = 1 << 30
	cost := map[string]int{}
	via := map[string]string{}
	for _, n := range nodes {
		cost[n.ID] = unreached
	}
	for changed := true; changed; {
		changed = false
		for _, n := range nodes {
			if !allowed(n) {
				continue
			}
			best, from := unreached, ""
			if len(n.Requires) == 0 {
				best = 1
			}
			for _, r := range n.Requires {
				if c, ok := cost[r]; ok && c < unreached && c+1 < best {
					best, from = c+1, r
				}
			}
			if best < cost[n.ID] {
				cost[n.ID], via[n.ID] = best, from
				changed = true
			}
		}
	}
	if cost[target] == unreached {
		return 0, nil
	}
	var path []string
	for id := target; id != ""; id = via[id] {
		path = append(path, id)
	}
	slices.Reverse(path)
	return cost[target], path
}

// legalPath spends path in order at level and fails unless every spend is
// Allowed; it answers the ranks held after.
func legalPath(t *testing.T, tr *tree, level int32, path []string) Ranks {
	t.Helper()
	held := Ranks{}
	for _, id := range path {
		verdict, err := tr.checkSpend(level, held, id, held[id]+1)
		require.NoError(t, err, "spend %s along %v", id, path)
		require.Equal(t, Allowed, verdict, id)
		held[id]++
	}
	return held
}

// choice is one side picked in each exclusive group.
type choice map[string]string

// choices is every way to pick one side of each of nodes' groups.
func choices(nodes []Node) []choice {
	sides := map[string][]string{}
	var groups []string
	for _, n := range nodes {
		if n.Exclusive == nil {
			continue
		}
		g := n.Exclusive.Group
		if _, seen := sides[g]; !seen {
			groups = append(groups, g)
		}
		if !slices.Contains(sides[g], n.Exclusive.Side) {
			sides[g] = append(sides[g], n.Exclusive.Side)
		}
	}
	out := []choice{{}}
	for _, g := range groups {
		var next []choice
		for _, c := range out {
			for _, s := range sides[g] {
				picked := choice{g: s}
				for k, v := range c {
					picked[k] = v
				}
				next = append(next, picked)
			}
		}
		out = next
	}
	return out
}

func (c choice) admits(n Node) bool {
	return n.Exclusive == nil || c[n.Exclusive.Group] == n.Exclusive.Side
}

// holdable is every node a character on choice can ever hold: on no side or
// a chosen one, and linked from the root through such nodes.
func holdable(nodes []Node, c choice) map[string]Node {
	held := map[string]Node{}
	for grew := true; grew; {
		grew = false
		for _, n := range nodes {
			if _, in := held[n.ID]; in || !c.admits(n) {
				continue
			}
			ok := len(n.Requires) == 0
			for _, r := range n.Requires {
				if _, in := held[r]; in {
					ok = true
				}
			}
			if ok {
				held[n.ID] = n
				grew = true
			}
		}
	}
	return held
}

func ranksOf(nodes map[string]Node) int {
	total := 0
	for _, n := range nodes {
		total += n.MaxRank
	}
	return total
}

func ofKind(nodes []Node, kind Kind) []Node {
	var out []Node
	for _, n := range nodes {
		if n.Kind == kind {
			out = append(out, n)
		}
	}
	return out
}

// firstNodes is each side's way in to group: its nodes linked from outside
// it (la1 and lb1 for the lower fork).
func firstNodes(nodes []Node, group string) []string {
	inGroup := map[string]bool{}
	for _, n := range nodes {
		if n.Exclusive != nil && n.Exclusive.Group == group {
			inGroup[n.ID] = true
		}
	}
	var out []string
	for _, n := range nodes {
		if !inGroup[n.ID] {
			continue
		}
		outside := true
		for _, r := range n.Requires {
			if inGroup[r] {
				outside = false
			}
		}
		if outside {
			out = append(out, n.ID)
		}
	}
	return out
}

// levelFor is the first level at which points have been earned.
func levelFor(points int) int32 {
	for level := int32(1); level <= 20; level++ {
		if Earned(level) >= points {
			return level
		}
	}
	return 0
}

// V10, per class: the shape, the cheapest paths, what the chosen sides hold
// and what the unchosen ones never can.
func TestGraph_TheMathPerClass(t *testing.T) {
	everything := func(Node) bool { return true }
	earned := Earned(20)

	for _, class := range classes {
		t.Run(class, func(t *testing.T) {
			tr := trees[class]
			nodes := tr.nodes
			total := 0
			for _, n := range nodes {
				total += n.MaxRank
			}
			assert.Len(t, nodes, 31, "nodes")
			assert.Equal(t, 39, total, "ranks")

			// the ability: a path of 6, held by level 7, but it waits for 10
			ability := ofKind(nodes, KindAbility)
			require.Len(t, ability, 1)
			cost, path := cheapestPath(nodes, everything, ability[0].ID)
			assert.Equal(t, 6, cost, "the ability's path %v", path)
			assert.Equal(t, int32(7), levelFor(cost), "the ability's path is earned by")
			assert.Equal(t, int32(10), ability[0].MinLevel)
			legalPath(t, tr, 20, path)

			// either specialization: a path of 10, leaving 10
			specs := ofKind(nodes, KindSpecialization)
			require.Len(t, specs, 2)
			for _, spec := range specs {
				cost, path := cheapestPath(nodes, everything, spec.ID)
				assert.Equal(t, 10, cost, "%s's path %v", spec.ID, path)
				assert.Equal(t, 10, earned-cost, "left after %s", spec.ID)
				legalPath(t, tr, 20, path)
			}

			cs := choices(nodes)
			assert.Len(t, cs, 8, "upper, lower and spec, two sides each")
			for _, c := range cs {
				mine := holdable(nodes, c)
				spec := ""
				for _, s := range specs {
					if c.admits(s) {
						spec = s.ID
					}
				}
				cost, path := cheapestPath(nodes, c.admits, spec)
				require.Equal(t, 10, cost, "%v: path %v", c, path)

				// the chosen sides hold 13 more, more than the 10 left
				assert.Equal(t, 13, ranksOf(mine)-cost, "%v: ranks past the path", c)
				assert.Greater(t, ranksOf(mine)-cost, earned-cost, "%v: never filled", c)

				// the unchosen sides (15) and the other spec (1) never
				unchosenSides, otherSpec := 0, 0
				for _, n := range nodes {
					if _, in := mine[n.ID]; in {
						continue
					}
					if n.Kind == KindSpecialization {
						otherSpec += n.MaxRank
					} else {
						unchosenSides += n.MaxRank
					}
				}
				assert.Equal(t, 15, unchosenSides, "%v: unchosen sides' ranks", c)
				assert.Equal(t, 1, otherSpec, "%v: the other specialization", c)

				// from the path taken and from every holdable node at max,
				// each unchosen node is refused side taken
				full := Ranks{}
				for id, n := range mine {
					full[id] = n.MaxRank
				}
				for _, held := range []Ranks{legalPath(t, tr, 20, path), full} {
					for _, n := range nodes {
						if _, in := mine[n.ID]; in {
							continue
						}
						_, err := tr.checkSpend(20, held, n.ID, 1)
						assert.ErrorIs(t, err, ErrSideTaken, "%v: %s", c, n.ID)
					}
				}
			}
		})
	}
}

// key is a held state as a comparable value: each node's rank in definition
// order.
type key [64]int8

func keyOf(nodes []Node, held Ranks) key {
	var k key
	for i, n := range nodes {
		k[i] = int8(held[n.ID])
	}
	return k
}

// reachableStates is every held state a character of level can spend into
// from nothing, through the rule.
func reachableStates(tr *tree, level int32) []Ranks {
	seen := map[key]bool{}
	var out []Ranks
	var walk func(held Ranks)
	walk = func(held Ranks) {
		k := keyOf(tr.nodes, held)
		if seen[k] {
			return
		}
		seen[k] = true
		out = append(out, held)
		for _, n := range tr.nodes {
			if v, err := tr.checkSpend(level, held, n.ID, held[n.ID]+1); err == nil && v == Allowed {
				next := make(Ranks, len(held)+1)
				for id, r := range held {
					next[id] = r
				}
				next[n.ID]++
				walk(next)
			}
		}
	}
	walk(Ranks{})
	return out
}

func spent(held Ranks) int {
	total := 0
	for _, r := range held {
		total += r
	}
	return total
}

// V10's no-trap guarantee, per class, by enumerating every state a level-19
// character can spend into: at most 13 ranks fit without a lower side's first
// node, so every state with 18 spent holds one, and from each, at level 20,
// the 2 new points reach a specialization.
func TestGraph_NoTrapAtLevelNineteen(t *testing.T) {
	for _, class := range classes {
		t.Run(class, func(t *testing.T) {
			tr := trees[class]
			require.LessOrEqual(t, len(tr.nodes), len(key{}))
			lowerFirst := firstNodes(tr.nodes, GroupLower)
			require.Len(t, lowerFirst, 2)
			specs := ofKind(tr.nodes, KindSpecialization)

			holdsLower := func(held Ranks) bool {
				return slices.ContainsFunc(lowerFirst, func(id string) bool { return held[id] > 0 })
			}

			mostWithoutLower, eighteens := 0, 0
			for _, held := range reachableStates(tr, 19) {
				if !holdsLower(held) {
					mostWithoutLower = max(mostWithoutLower, spent(held))
				}
				if spent(held) != Earned(19) {
					continue
				}
				eighteens++
				assert.True(t, holdsLower(held), "18 spent without %v: %v", lowerFirst, held)
				assert.True(t, twoPointsReachASpec(tr, held, specs), "at level 20, 2 points from %v", held)
			}
			assert.Equal(t, 13, mostWithoutLower, "the most ranks without %v", lowerFirst)
			assert.Positive(t, eighteens, "states with 18 spent")
		})
	}
}

// twoPointsReachASpec is whether some two spends at level 20 from held leave
// a specialization held.
func twoPointsReachASpec(tr *tree, held Ranks, specs []Node) bool {
	holdsSpec := func(h Ranks) bool {
		return slices.ContainsFunc(specs, func(n Node) bool { return h[n.ID] > 0 })
	}
	frontier := []Ranks{held}
	for step := 0; step < 2; step++ {
		var next []Ranks
		for _, h := range frontier {
			for _, n := range tr.nodes {
				if v, err := tr.checkSpend(20, h, n.ID, h[n.ID]+1); err != nil || v != Allowed {
					continue
				}
				after := Higher(h, Ranks{n.ID: h[n.ID] + 1})
				if holdsSpec(after) {
					return true
				}
				next = append(next, after)
			}
		}
		frontier = next
	}
	return false
}

// V11: a tree with nodes past a specialization and a three-sided group under
// it is ruled on by the same code. Nothing in the rule names a slot.
func TestGraph_AFixtureTreeNeedsNoCode(t *testing.T) {
	side := func(group, s string) *Exclusive { return &Exclusive{Group: group, Side: s} }
	n := func(id string, minLevel int32, ex *Exclusive, requires ...string) Node {
		return Node{ID: id, Class: "fx", Slot: id, Kind: KindTraversal, MaxRank: 1, Requires: requires, MinLevel: minLevel, Exclusive: ex}
	}
	nodes := []Node{
		n("fx.root", 0, nil),
		n("fx.specA", 5, side("spec", "a"), "fx.root"),
		n("fx.specB", 5, side("spec", "b"), "fx.root"),
		n("fx.past", 0, nil, "fx.specA"),
		n("fx.x", 0, side("sub", "a"), "fx.past"),
		n("fx.y", 0, side("sub", "b"), "fx.past"),
		n("fx.z", 0, side("sub", "c"), "fx.past"),
		n("fx.z2", 15, side("sub", "c"), "fx.z"),
		n("fx.end", 0, nil, "fx.x", "fx.y", "fx.z2"),
	}
	tr := newTree(nodes)
	held := func(ids ...string) Ranks {
		h := Ranks{}
		for _, id := range ids {
			h[id] = 1
		}
		return h
	}
	toPast := []string{"fx.root", "fx.specA", "fx.past"}

	tests := []struct {
		name    string
		level   int32
		held    Ranks
		node    string
		wantErr error
	}{
		{"the root", 2, held(), "fx.root", nil},
		{"a spec below its level", 4, held("fx.root"), "fx.specA", ErrLevelTooLow},
		{"a spec at its level", 5, held("fx.root"), "fx.specA", nil},
		{"the other spec", 20, held("fx.root", "fx.specA"), "fx.specB", ErrSideTaken},
		{"past the spec, unlinked", 20, held("fx.root"), "fx.past", ErrNotLinked},
		{"past the spec", 20, held("fx.root", "fx.specA"), "fx.past", nil},
		{"each of three sides is open", 20, held(toPast...), "fx.y", nil},
		{"a taken side locks the second", 20, held(append(toPast, "fx.x")...), "fx.y", ErrSideTaken},
		{"a taken side locks the third", 20, held(append(toPast, "fx.x")...), "fx.z", ErrSideTaken},
		{"and deeper on it", 20, held(append(toPast, "fx.x")...), "fx.z2", ErrSideTaken},
		{"its own side goes on", 14, held(append(toPast, "fx.z")...), "fx.z2", ErrLevelTooLow},
		{"its own side at level", 15, held(append(toPast, "fx.z")...), "fx.z2", nil},
		{"the third side locks the first", 20, held(append(toPast, "fx.z")...), "fx.x", ErrSideTaken},
		{"the end by any link", 20, held(append(toPast, "fx.z", "fx.z2")...), "fx.end", nil},
		{"the end, not by a link", 20, held(append(toPast, "fx.z")...), "fx.end", ErrNotLinked},
		{"no points", 4, held(toPast...), "fx.x", ErrNoPoints},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			verdict, err := tr.checkSpend(tt.level, tt.held, tt.node, 1)
			if tt.wantErr != nil {
				assert.True(t, errors.Is(err, tt.wantErr), "err = %v, want %v", err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, Allowed, verdict)
		})
	}

	got, ok := tr.sideTaken(held(append(toPast, "fx.z")...), "sub")
	assert.True(t, ok)
	assert.Equal(t, "c", got)

	// the math walk is as generic as the rule
	cost, path := cheapestPath(nodes, func(Node) bool { return true }, "fx.end")
	assert.Equal(t, 5, cost, "%v", path)
	assert.Len(t, choices(nodes), 6, "two spec sides by three sub sides")
}
