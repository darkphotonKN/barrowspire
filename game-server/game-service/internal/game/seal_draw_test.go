package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-5FZ4J §B R9: floors 1-3 draw one seal from Lever Order, Weighted Plates
// and the Hidden Key; floors 4-7 one from all five; floors 8-10 chain two
// different kinds, the first never a Chasm. Every kind of a band's set rolls.
func TestSealKindsFor_ByFloorBand(t *testing.T) {
	draw := defaultFloorTuning()
	low := []components.SealKind{components.SealLeverOrder, components.SealWeightedPlates, components.SealHiddenKey}
	all := append(slices.Clone(low), components.SealChasm, components.SealBraziers)
	tests := []struct {
		name          string
		depths        []int
		stages        int
		first, second []components.SealKind
	}{
		{"floors 1-3", []int{1, 2, 3}, 1, low, nil},
		{"floors 4-7", []int{4, 5, 6, 7}, 1, all, nil},
		{"floors 8-10", []int{8, 9, 10}, 2, append(slices.Clone(low), components.SealBraziers), all},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			firsts, seconds := map[components.SealKind]bool{}, map[components.SealKind]bool{}
			for _, depth := range tt.depths {
				for seed := uint64(1); seed <= 300; seed++ {
					kinds := draw.sealKindsFor(seededSpawns(seed), depth, 1)
					require.Len(t, kinds, tt.stages, "floor %d seed %d", depth, seed)
					assert.Contains(t, tt.first, kinds[0], "floor %d seed %d", depth, seed)
					firsts[kinds[0]] = true
					if tt.stages == 2 {
						assert.Contains(t, tt.second, kinds[1], "floor %d seed %d", depth, seed)
						assert.NotEqual(t, kinds[0], kinds[1], "floor %d seed %d: two different kinds", depth, seed)
						seconds[kinds[1]] = true
					}
				}
			}
			assert.Len(t, firsts, len(tt.first), "every kind of the set rolls first")
			if tt.stages == 2 {
				assert.Len(t, seconds, len(tt.second), "every kind rolls second")
			}
		})
	}
}

// FS-5FZ4J §B R9: the draw comes from the spawn source: one seed, one draw.
func TestSealKindsFor_SeededDrawRepeats(t *testing.T) {
	draw := defaultFloorTuning()
	for seed := uint64(1); seed <= 50; seed++ {
		assert.Equal(t, draw.sealKindsFor(seededSpawns(seed), 9, 2), draw.sealKindsFor(seededSpawns(seed), 9, 2))
	}
}

// FS-5FZ4J §Requirements: a forced kind is every floor's one seal, the
// chained floors' included.
func TestSealKindsFor_ForcedKindOnEveryFloor(t *testing.T) {
	forced := defaultFloorTuning()
	forced.forcedSealKind = components.SealChasm
	for depth := 1; depth <= 10; depth++ {
		assert.Equal(t, []components.SealKind{components.SealChasm}, forced.sealKindsFor(seededSpawns(1), depth, 1), "floor %d", depth)
	}
}

// FS-5FZ4J §B R10, ADR-0092: a kind marked two-body never rolls with one
// delver alive at the floor's build, in any band or chain place, and rolls as
// ever with two. No v1 kind is two-body; the guard is proved by marking one.
func TestSealKindsFor_TwoBodyKindNeverRollsSolo(t *testing.T) {
	assert.Empty(t, defaultFloorTuning().twoBodyKinds, "no v1 kind needs two bodies")
	for _, kind := range []components.SealKind{components.SealLeverOrder, components.SealBraziers, components.SealChasm} {
		t.Run(string(kind), func(t *testing.T) {
			draw := defaultFloorTuning()
			draw.twoBodyKinds = map[components.SealKind]bool{kind: true}
			rolledInPair := false
			for depth := 1; depth <= 10; depth++ {
				for seed := uint64(1); seed <= 200; seed++ {
					assert.NotContains(t, draw.sealKindsFor(seededSpawns(seed), depth, 1), kind, "floor %d seed %d solo", depth, seed)
					if slices.Contains(draw.sealKindsFor(seededSpawns(seed), depth, 2), kind) {
						rolledInPair = true
					}
				}
			}
			assert.True(t, rolledInPair, "a pair still rolls it")
		})
	}
}

// FS-5FZ4J §E R33, §B R9: a Chasm drawn on a stairs room too small for one is
// drawn again from all five but the Chasm and the floor's other seal's kind;
// a Hidden Key drawn in its place brings its key's hidden room.
func TestRedrawChasm_NeverAChasm_TheKeyBringsItsRoom(t *testing.T) {
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	keys := 0
	for seed := uint64(1); seed <= 300; seed++ {
		s.spawnRand = seededSpawns(seed)
		single := s.redrawChasm(1, floorDraw{seals: []components.SealKind{components.SealChasm}, hidden: []hiddenUse{hiddenChest}})
		require.Len(t, single.seals, 1)
		assert.NotEqual(t, components.SealChasm, single.seals[0], "seed %d", seed)
		if single.seals[0] == components.SealHiddenKey {
			keys++
			assert.ElementsMatch(t, []hiddenUse{hiddenChest, hiddenStairKey}, single.hidden, "seed %d: the key's room joins", seed)
		} else {
			assert.Equal(t, []hiddenUse{hiddenChest}, single.hidden, "seed %d", seed)
		}

		chained := s.redrawChasm(1, floorDraw{seals: []components.SealKind{components.SealLeverOrder, components.SealChasm}})
		assert.Equal(t, components.SealLeverOrder, chained.seals[0])
		assert.NotContains(t, []components.SealKind{components.SealLeverOrder, components.SealChasm}, chained.seals[1], "seed %d", seed)
	}
	assert.Positive(t, keys, "the Hidden Key is among the redraws")
}

/**
* FS-5FZ4J §B R9, §E R33-R34, §H R45, ADR-0092: over 1 000 seeds, every floor
* band's draw yields a placeable seal: the floor is a dungeon, sealed by its
* band's count of seals, every piece of each planned, a Chasm only on a stairs
* room that holds one, with the stairs and bridge lever past it, and a
* Braziers whose three braziers one delver walks inside the solo window.
**/
func TestSealDraw_EveryBand_PlaceableOnEverySeed(t *testing.T) {
	if testing.Short() {
		t.Skip("the 1 000-seed sweep")
	}
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	slowest := 0.0
	for _, band := range []struct{ depth, stages int }{{1, 1}, {3, 1}, {6, 1}, {9, 2}} {
		kinds := map[components.SealKind]int{}
		for seed := uint64(1); seed <= 1000; seed++ {
			s.spawnRand = seededSpawns(seed)
			s.objectOccupiedPlaceAreas = nil

			d, fixtures := s.generateDungeonFloor(band.depth, 1)

			require.NotNil(t, d, "floor %d seed %d: a sealed dungeon floor", band.depth, seed)
			require.Len(t, fixtures.seals, band.stages, "floor %d seed %d", band.depth, seed)
			for _, plan := range fixtures.seals {
				kinds[plan.kind]++
				assert.NotEmpty(t, plan.pieces, "floor %d seed %d: %s has its pieces", band.depth, seed, plan.kind)
				if plan.kind == components.SealBraziers {
					walk := brazierRouteSeconds(t, d, plan.pieces)
					slowest = max(slowest, walk)
					assert.LessOrEqual(t, walk, BrazierWindowSolo, "floor %d seed %d: one delver walks the three braziers inside the solo window", band.depth, seed)
				}
				if plan.kind == components.SealChasm {
					require.True(t, d.layout.ChasmCapable, "floor %d seed %d: a Chasm only where one fits", band.depth, seed)
					require.NotNil(t, d.chasm)
					f := chasmFrameOf(d.layout.Rooms[d.layout.Stairs.Room].Rect, d.layout.Stairs.Barrier)
					far := max(deepOf(f, components.Cell{X: d.chasm.band.X, Y: d.chasm.band.Y}),
						deepOf(f, components.Cell{X: d.chasm.band.X + d.chasm.band.W - 1, Y: d.chasm.band.Y + d.chasm.band.H - 1}))
					for _, at := range []point{fixtures.stairs, plan.pieces[0].at} {
						assert.Greater(t, deepOf(f, d.cellOf(at)), far, "floor %d seed %d: past the chasm", band.depth, seed)
					}
				}
			}
		}
		t.Logf("floor %d: %v", band.depth, kinds)
	}
	t.Logf("slowest solo brazier walk: %.1f s of %.0f", slowest, BrazierWindowSolo)
}

/**
* brazierRouteSeconds is how long one delver takes to walk the shortest route
* that visits the three braziers, from whichever is lit first: a 4-neighbour
* walk over the floor's ground, cell centre to cell centre, at the default walk
* speed, a diagonal counted as two steps (FS-5FZ4J §E R34, ADR-0092: the solo
* window is the only way one delver lights all three).
**/
func brazierRouteSeconds(t *testing.T, d *dungeonFloor, pieces []plannedPiece) float64 {
	t.Helper()
	var at []int
	for _, p := range pieces {
		if p.kind == components.SealPieceBrazier {
			c := d.cellOf(p.at)
			at = append(at, c.Y*d.layout.Cols+c.X)
		}
	}
	require.Len(t, at, BrazierCount)
	steps := make([][]int, len(at))
	for i, from := range at {
		steps[i] = walkSteps(d, from)
	}
	best := -1
	for _, order := range [][3]int{{0, 1, 2}, {0, 2, 1}, {1, 0, 2}, {1, 2, 0}, {2, 0, 1}, {2, 1, 0}} {
		a, b := steps[order[0]][at[order[1]]], steps[order[1]][at[order[2]]]
		require.True(t, a >= 0 && b >= 0, "every brazier is walkable from every other")
		if best < 0 || a+b < best {
			best = a + b
		}
	}
	return float64(best) * d.layout.CellSize / constants.DefaultSpeed
}

// walkSteps is the 4-neighbour steps from cell from to every cell of d's
// ground, -1 where it does not reach: breadth first over every region.
func walkSteps(d *dungeonFloor, from int) []int {
	cols, rows := d.layout.Cols, d.layout.Rows
	steps := make([]int, cols*rows)
	for i := range steps {
		steps[i] = -1
	}
	steps[from] = 0
	queue := []int{from}
	for len(queue) > 0 {
		at := queue[0]
		queue = queue[1:]
		x, y := at%cols, at/cols
		for _, n := range [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			nx, ny := x+n[0], y+n[1]
			if nx < 0 || ny < 0 || nx >= cols || ny >= rows {
				continue
			}
			if next := ny*cols + nx; d.region[next] != 0 && steps[next] < 0 {
				steps[next] = steps[at] + 1
				queue = append(queue, next)
			}
		}
	}
	return steps
}
