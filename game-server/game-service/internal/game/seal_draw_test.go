package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// drawNothingForced has this test draw seals by the table, not a forced kind.
func drawNothingForced(t testing.TB) { forceSeal(t, "") }

// FS-5FZ4J §B R9: floors 1-3 draw one seal from Lever Order, Weighted Plates
// and the Hidden Key; floors 4-7 one from all five; floors 8-10 chain two
// different kinds, the first never a Chasm. Every kind of a band's set rolls.
func TestSealKindsFor_ByFloorBand(t *testing.T) {
	drawNothingForced(t)
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
					kinds := sealKindsFor(seededSpawns(seed), depth, 1)
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
	drawNothingForced(t)
	for seed := uint64(1); seed <= 50; seed++ {
		assert.Equal(t, sealKindsFor(seededSpawns(seed), 9, 2), sealKindsFor(seededSpawns(seed), 9, 2))
	}
}

// FS-5FZ4J §Requirements: a forced kind is every floor's one seal, the
// chained floors' included.
func TestSealKindsFor_ForcedKindOnEveryFloor(t *testing.T) {
	forceSeal(t, components.SealChasm)
	for depth := 1; depth <= 10; depth++ {
		assert.Equal(t, []components.SealKind{components.SealChasm}, sealKindsFor(seededSpawns(1), depth, 1), "floor %d", depth)
	}
}

// FS-5FZ4J §B R10, ADR-0092: a kind marked two-body never rolls with one
// delver alive at the floor's build, in any band or chain place, and rolls as
// ever with two. No v1 kind is two-body; the guard is proved by marking one.
func TestSealKindsFor_TwoBodyKindNeverRollsSolo(t *testing.T) {
	drawNothingForced(t)
	assert.Empty(t, twoBodyKinds, "no v1 kind needs two bodies")
	for _, kind := range []components.SealKind{components.SealLeverOrder, components.SealBraziers, components.SealChasm} {
		t.Run(string(kind), func(t *testing.T) {
			twoBodyKinds = map[components.SealKind]bool{kind: true}
			t.Cleanup(func() { twoBodyKinds = map[components.SealKind]bool{} })
			rolledInPair := false
			for depth := 1; depth <= 10; depth++ {
				for seed := uint64(1); seed <= 200; seed++ {
					assert.NotContains(t, sealKindsFor(seededSpawns(seed), depth, 1), kind, "floor %d seed %d solo", depth, seed)
					if slices.Contains(sealKindsFor(seededSpawns(seed), depth, 2), kind) {
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
	drawNothingForced(t)
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
* FS-5FZ4J §B R9, §E R33, §H R45: over 1 000 seeds, every floor band's draw
* yields a placeable seal: the floor is a dungeon, sealed by its band's count
* of seals, every piece of each planned, a Chasm only on a stairs room that
* holds one, with the stairs and bridge lever past it.
**/
func TestSealDraw_EveryBand_PlaceableOnEverySeed(t *testing.T) {
	if testing.Short() {
		t.Skip("the 1 000-seed sweep")
	}
	drawNothingForced(t)
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
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
}
