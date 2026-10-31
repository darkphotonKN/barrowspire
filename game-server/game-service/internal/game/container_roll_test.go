package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-1D6BX §Requirements 4–6, D1. I-1D6BX-1.

// countingRand is a fixed Float64 roll that counts how many it was asked for.
type countingRand struct {
	f      float64
	floats int
}

func (r *countingRand) Float64() float64 { r.floats++; return r.f }
func (r *countingRand) IntN(int) int     { return 0 }

// A container rolls by its kind: the kind's empty chance first, then a count in
// the kind's range. A chest never rolls empty and never draws for it.
func TestRollContainer_ByKind(t *testing.T) {
	tests := []struct {
		name               string
		kind               components.ContainerKind
		f                  float64
		minItems, maxItems int
		emptyDraws         int
	}{
		{"a sack under its empty chance rolls empty", components.ContainerKindSack, SackEmptyChance - 1e-9, 0, 0, 1},
		{"a sack at its empty chance rolls exactly one item", components.ContainerKindSack, SackEmptyChance, 1, 1, 1},
		{"a chest rolls 2 to 4 items and draws no empty roll", components.ContainerKindChest, 0, ChestMinItems, ChestMaxItems, 0},
		{"an unknown kind rolls as a chest", components.ContainerKind("crate"), 0, ChestMinItems, ChestMaxItems, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := dropSession()
			r := &countingRand{f: tt.f}

			ids, err := s.rollContainer(r, tt.kind, chestDropAt(1))

			require.NoError(t, err)
			assert.NotNil(t, ids, "an empty roll is an empty list")
			assert.GreaterOrEqual(t, len(ids), tt.minItems)
			assert.LessOrEqual(t, len(ids), tt.maxItems)
			assert.Equal(t, len(ids), itemCount(s), "every rolled item is in the world")
			assert.Equal(t, tt.emptyDraws, r.floats)
		})
	}
}

// The chest's roll is today's: 2, 3 or 4 items, each count turning up.
func TestRollContainer_ChestRollsTwoToFourItems(t *testing.T) {
	s := dropSession()
	seen := map[int]bool{}
	for range 300 {
		ids, err := s.rollContainer(seeded(), components.ContainerKindChest, chestDropAt(1))
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(ids), 2)
		require.LessOrEqual(t, len(ids), 4)
		seen[len(ids)] = true
	}
	assert.Equal(t, map[int]bool{2: true, 3: true, 4: true}, seen)
}

// A sack's item splits weapon / armor / consumable 0.2 / 0.3 / 0.5, as a
// chest's does, and its empty share is its empty chance.
func TestRollContainer_SackKeepsTheTypeSplitAndEmptyChance(t *testing.T) {
	s := dropSession()
	r := seeded()
	const rolls = 6000
	empty := 0
	byType := map[types.ItemType]int{}
	for range rolls {
		ids, err := s.rollContainer(r, components.ContainerKindSack, chestDropAt(1))
		require.NoError(t, err)
		if len(ids) == 0 {
			empty++
			continue
		}
		require.Len(t, ids, 1)
		byType[itemsByID(s, ids)[0].ItemType]++
	}

	assert.InDelta(t, SackEmptyChance, float64(empty)/rolls, 0.02)
	full := float64(rolls - empty)
	assert.InDelta(t, weaponDropRate, float64(byType[types.ItemTypeWeapon])/full, 0.04)
	assert.InDelta(t, armorDropRate, float64(byType[types.ItemTypeArmor])/full, 0.04)
	assert.InDelta(t, consumableDropRate, float64(byType[types.ItemTypeConsumable])/full, 0.04)
}

// The chest's values are today's: never empty, 2 to 4 items. R5.
func TestContainerRolls_ChestIsUnchanged(t *testing.T) {
	assert.Equal(t, ContainerRoll{EmptyChance: 0, MinItems: 2, MaxItems: 4}, containerRollFor(components.ContainerKindChest))
}

// Whatever the numbers, a sack is expected to hold fewer items than a chest. R6.
func TestContainerRolls_SackExpectsFewerItemsThanAChest(t *testing.T) {
	expected := func(roll ContainerRoll) float64 {
		return (1 - roll.EmptyChance) * float64(roll.MinItems+roll.MaxItems) / 2
	}
	sack := containerRollFor(components.ContainerKindSack)
	chest := containerRollFor(components.ContainerKindChest)
	assert.Less(t, expected(sack), expected(chest))
}

// chestsOnly never hits the sack share: every chest point holds a chest.
var chestsOnly = fixedRand{f: 1}

// kindOf is the container's kind.
func kindOf(t *testing.T, container *ecs.Entity) components.ContainerKind {
	t.Helper()
	cc, ok := container.GetComponent(ecs.ComponentTypeContainer)
	require.True(t, ok)
	return cc.(*components.ContainerComponent).Kind
}

// A chest spawn point holds a sack on a draw under SackShare, else a chest,
// and over many draws a sack about SackShare of the time. R3.
func TestSpawnedContainerKind_SackAtTheShare(t *testing.T) {
	assert.Equal(t, components.ContainerKindSack, spawnedContainerKind(fixedRand{f: SackShare - 1e-9}))
	assert.Equal(t, components.ContainerKindChest, spawnedContainerKind(fixedRand{f: SackShare}))

	r := seeded()
	const draws = 10000
	sacks := 0
	for range draws {
		if spawnedContainerKind(r) == components.ContainerKindSack {
			sacks++
		}
	}
	assert.InDelta(t, SackShare, float64(sacks)/draws, 0.02)
}

// runWithKindRand is a run built as the server builds one, its chest point's
// sack-share draw taken from r.
func runWithKindRand(t *testing.T, r lootRand) *Session {
	t.Helper()
	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.containerKindRand = r
	s.InitialMapObjects(nil)
	return s
}

// A run floor's one container is a sack on a share hit, else a chest, closed
// and unopened either way. R3, D6.
func TestBuildFloor_ChestPointHoldsASackAtTheShare(t *testing.T) {
	tests := []struct {
		name string
		f    float64
		want components.ContainerKind
	}{
		{"a share hit places a sack", SackShare - 1e-9, components.ContainerKindSack},
		{"a share miss places a chest", SackShare, components.ContainerKindChest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := runWithKindRand(t, fixedRand{f: tt.f})
			found := containers(s)
			require.Len(t, found, 1)
			assert.Equal(t, tt.want, kindOf(t, found[0]))
			assert.False(t, openable(t, found[0]).HasBeenOpened)
			assert.False(t, openable(t, found[0]).IsOpen)
		})
	}
}

// Every Forest clearing chest point, the guaranteed one included, holds a sack
// on a share hit and a chest otherwise, at the chest's spot. R3, D6.
func TestForlornForest_EachChestPointHoldsASackAtTheShare(t *testing.T) {
	tests := []struct {
		name string
		f    float64
		want components.ContainerKind
	}{
		{"share hits place sacks", SackShare - 1e-9, components.ContainerKindSack},
		{"share misses place chests", SackShare, components.ContainerKindChest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, seed := range []uint64{forestSeed, 1, 7} {
				forest, _, generated := builtForestWith(t, seed, fixedRand{f: tt.f})
				var want, got []FieldPoint
				for _, deadEnd := range assignForestClearings(generated).Chests {
					want = append(want, FieldPoint{X: deadEnd.Center.X, Y: deadEnd.Center.Y})
				}
				for _, container := range containers(forest) {
					assert.Equal(t, tt.want, kindOf(t, container))
					at := transformOf(t, container)
					got = append(got, FieldPoint{X: at.X, Y: at.Y})
				}
				assert.ElementsMatch(t, want, got, "seed %d: one container per chest clearing", seed)
			}
		})
	}
}

// sackForest is a built Forest whose every chest point holds a sack, with a
// tier I pool to drop from and its container rolls drawn from r.
func sackForest(t *testing.T, r lootRand) *Session {
	t.Helper()
	forest, _, _ := builtForestWith(t, forestSeed, fixedRand{f: 0})
	pool := dropSession()
	forest.itemPool, forest.lootRarities = pool.itemPool, pool.lootRarities
	forest.chestRand = r
	return forest
}

// A field sack's one item is kept at the place's drop factor: a keep roll
// under it keeps the item, one at it leaves the world. R7.
func TestForestSack_KeepsItsItemAtTheDropFactor(t *testing.T) {
	tests := []struct {
		name string
		keep float64
		want int
	}{
		{"a keep roll under the factor keeps it", ForestDropFactor - 1e-9, 1},
		{"a keep roll at the factor drops it", ForestDropFactor, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// draws: the level, the empty roll (not empty), the keep roll
			forest := sackForest(t, &drawQueue{floats: []float64{SackEmptyChance, tt.keep}})
			sack, player := firstChest(t, forest)
			require.Equal(t, components.ContainerKindSack, kindOf(t, sack))

			require.NoError(t, forest.handleInteract(player, sack.ID))

			assert.Len(t, chestHolds(t, sack), tt.want)
			assert.Equal(t, tt.want, itemCount(forest), "what is not kept leaves the world")
		})
	}
}

// An empty roll still opens: the sack is open, opened, and holds nothing, in a
// run and in a field. R9, D9.
func TestOpenSack_EmptyRollLeavesItOpenedAndEmpty(t *testing.T) {
	t.Run("run", func(t *testing.T) {
		s, player := containerSession(t, 500, 500)
		s.chestRand = fixedRand{f: 0}
		sackID := s.AddContainer(505, 500, components.ContainerKindSack)
		sack, _ := s.EntityManager.GetEntity(sackID)

		require.NoError(t, s.handleInteract(player, sackID))

		assert.True(t, openable(t, sack).IsOpen)
		assert.True(t, openable(t, sack).HasBeenOpened)
		assert.Empty(t, chestHolds(t, sack))
		assert.Zero(t, itemCount(s))
	})
	t.Run("field", func(t *testing.T) {
		forest := sackForest(t, fixedRand{f: 0})
		sack, player := firstChest(t, forest)

		require.NoError(t, forest.handleInteract(player, sack.ID))

		assert.True(t, openable(t, sack).IsOpen)
		assert.True(t, openable(t, sack).HasBeenOpened)
		assert.Empty(t, chestHolds(t, sack))
	})
}

// A run's sack past its empty chance rolls exactly one item, once. R4, R9.
func TestOpenSack_RunRollsOneItemOnce(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	s.chestRand = fixedRand{f: SackEmptyChance}
	sackID := s.AddContainer(505, 500, components.ContainerKindSack)
	sack, _ := s.EntityManager.GetEntity(sackID)

	require.NoError(t, s.handleInteract(player, sackID))
	held := chestHolds(t, sack)
	require.Len(t, held, 1)

	releaseInteraction(s, sackID, player)
	require.NoError(t, s.handleInteract(player, sackID))
	assert.Equal(t, held, chestHolds(t, sack), "rolled once")
}

// A field sack restocks on the field chest's delay, as a chest does. R10, D5.
func TestForestSack_RestocksAfterTheDelay(t *testing.T) {
	forest := sackForest(t, fixedRand{f: SackEmptyChance})
	sack, player := firstChest(t, forest)
	require.NoError(t, forest.handleInteract(player, sack.ID))

	ageChests(forest, ForestChestRestockDelay-0.1)
	assert.True(t, openable(t, sack).IsOpen, "still open just before the mark")

	ageChests(forest, 0.1)
	assert.False(t, openable(t, sack).IsOpen, "closed at the mark")
	assert.False(t, openable(t, sack).HasBeenOpened, "the next open rolls again")
	assert.Empty(t, chestHolds(t, sack))
}

// A run's sack never restocks. R10.
func TestRunSack_NeverRestocks(t *testing.T) {
	run := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, RunBounds())
	sack := CreateContainerEntity(run.EntityManager, ContainerConfig{X: 100, Y: 100, Kind: components.ContainerKindSack}, []uuid.UUID{uuid.New()})
	open := openable(t, sack)
	open.IsOpen, open.HasBeenOpened = true, true

	ageChests(run, 10*ForestChestRestockDelay)
	assert.True(t, open.IsOpen)
	assert.True(t, open.HasBeenOpened)
	assert.Len(t, chestHolds(t, sack), 1)
}
