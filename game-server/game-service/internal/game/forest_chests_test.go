package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-3QHQZ §B Requirements 13, 15, 19; Acceptance Criteria "Forest world (§B)"
// chest item; Edge States "Two players open a chest at once", "A chest is
// mid-restock while someone stands at it". I-3QHQZ-4.

// containers is every container entity standing in the world.
func containers(s *Session) []*ecs.Entity {
	var found []*ecs.Entity
	for _, entity := range s.EntityManager.GetAllEntities() {
		if entity.HasComponent(ecs.ComponentTypeContainer) {
			found = append(found, entity)
		}
	}
	return found
}

// Every chest clearing holds exactly one chest, at its centre, and nothing else
// in the Forest is a container; each is recorded as occupied. R13, R15, R19.
func TestForlornForest_OneChestAtEachChestClearing(t *testing.T) {
	for _, seed := range []uint64{forestSeed, 1, 7, 42, 99} {
		forest, _, generated := builtForest(t, seed)
		clearings := assignForestClearings(generated)
		require.NotEmpty(t, clearings.Chests, "seed %d: the forest has a chest clearing", seed)

		var want, got []FieldPoint
		for _, deadEnd := range clearings.Chests {
			want = append(want, FieldPoint{X: deadEnd.Center.X, Y: deadEnd.Center.Y})
		}
		for _, chest := range containers(forest) {
			cc, _ := chest.GetComponent(ecs.ComponentTypeContainer)
			assert.Equal(t, components.ContainerKindChest, cc.(*components.ContainerComponent).Kind)
			oc, _ := chest.GetComponent(ecs.ComponentTypeOpenable)
			assert.False(t, oc.(*components.OpenableComponent).HasBeenOpened, "a chest starts unopened")
			at := transformOf(t, chest)
			got = append(got, FieldPoint{X: at.X, Y: at.Y})
		}
		assert.ElementsMatch(t, want, got, "seed %d: one chest per chest clearing, at its centre", seed)

		for _, at := range want {
			assert.True(t, forest.IsAreaOccupied(PlaceArea{X: at.X, Y: at.Y, W: 1, H: 1}), "seed %d: chest at %+v is not occupied", seed, at)
			assert.True(t, forest.IsAreaOccupied(PlaceArea{X: at.X + constants.ContainerWidthRadius - 1, Y: at.Y, W: 1, H: 1}), "seed %d: chest footprint is not occupied", seed)
		}
	}
}

// The Meadows has no chest: R19 is the Forest's alone.
func TestGentleMeadows_HasNoChest(t *testing.T) {
	assert.Empty(t, containers(builtField(t)))
}

// chestRoll is a recorded chest roll source: Float64 is f every time, IntN(n)
// is pick(n), and every IntN asked of it is kept.
type chestRoll struct {
	f     float64
	pick  func(n int) int
	asked []int
}

func (r *chestRoll) Float64() float64 { return r.f }
func (r *chestRoll) IntN(n int) int {
	r.asked = append(r.asked, n)
	if r.pick == nil {
		return 0
	}
	return r.pick(n)
}

// lootedForest is a built Forest, not started, with a tier I pool of every type
// to drop from, its chest rolls drawn from r.
func lootedForest(t *testing.T, r lootRand) *Session {
	t.Helper()
	forest, _, _ := builtForest(t, forestSeed)
	pool := dropSession()
	forest.itemPool, forest.lootRarities = pool.itemPool, pool.lootRarities
	forest.chestRand = r
	return forest
}

// firstChest is one of the Forest's chests, and a player seated beside it.
func firstChest(t *testing.T, forest *Session) (*ecs.Entity, uuid.UUID) {
	t.Helper()
	chests := containers(forest)
	require.NotEmpty(t, chests)
	at := transformOf(t, chests[0])
	return chests[0], seatAt(forest, FieldPoint{X: at.X, Y: at.Y})
}

func chestHolds(t *testing.T, chest *ecs.Entity) []uuid.UUID {
	t.Helper()
	lc, ok := chest.GetComponent(ecs.ComponentTypeItemIDList)
	require.True(t, ok)
	return lc.(*components.ItemIDListComponent).ItemIDs
}

func openable(t *testing.T, chest *ecs.Entity) *components.OpenableComponent {
	t.Helper()
	oc, ok := chest.GetComponent(ecs.ComponentTypeOpenable)
	require.True(t, ok)
	return oc.(*components.OpenableComponent)
}

// itemCount is how many item entities stand in the world.
func itemCount(s *Session) int {
	n := 0
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeItem) {
			n++
		}
	}
	return n
}

// A first open draws the item level uniformly from the Forest band, one draw
// over the band's six levels, and every item it holds is at that level. R19.
func TestForestChest_FirstOpenRollsAtABandItemLevel(t *testing.T) {
	tests := []struct {
		name  string
		pick  func(n int) int
		level int
	}{
		{"the band's floor", func(int) int { return 0 }, ForestMinLevel},
		{"the band's ceiling", func(n int) int { return n - 1 }, ForestMaxLevel},
		{"inside the band", func(int) int { return 2 }, ForestMinLevel + 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := &chestRoll{f: 0, pick: tt.pick}
			forest := lootedForest(t, r)
			chest, player := firstChest(t, forest)

			require.NoError(t, forest.handleInteract(player, chest.ID))

			assert.Equal(t, []int{ForestMaxLevel - ForestMinLevel + 1}, r.asked, "one level draw over the band")
			held := chestHolds(t, chest)
			assert.GreaterOrEqual(t, len(held), 2, "a whole chest roll at a keep roll under the factor")
			assert.LessOrEqual(t, len(held), 4)
			for _, item := range itemsByID(forest, held) {
				assert.Equal(t, tt.level, item.ItemLevel)
			}
			assert.True(t, openable(t, chest).IsOpen)
			assert.True(t, openable(t, chest).HasBeenOpened)
		})
	}
}

// The chest roll keeps each item at the Forest's drop factor, the container
// rule FS-X2F2H applies (R32): a keep roll under the factor keeps it, one at
// the factor leaves the world. R19.
func TestForestChest_FirstOpenAppliesTheForestDropFactor(t *testing.T) {
	t.Run("under the factor keeps every item", func(t *testing.T) {
		forest := lootedForest(t, &chestRoll{f: ForestDropFactor - 1e-9})
		chest, player := firstChest(t, forest)

		require.NoError(t, forest.handleInteract(player, chest.ID))
		assert.NotEmpty(t, chestHolds(t, chest))
		assert.Equal(t, len(chestHolds(t, chest)), itemCount(forest))
	})
	t.Run("at the factor keeps nothing and leaves nothing behind", func(t *testing.T) {
		forest := lootedForest(t, &chestRoll{f: ForestDropFactor})
		chest, player := firstChest(t, forest)

		require.NoError(t, forest.handleInteract(player, chest.ID))
		assert.Empty(t, chestHolds(t, chest))
		assert.Zero(t, itemCount(forest))
		assert.True(t, openable(t, chest).HasBeenOpened, "an empty roll is still the first open")
	})
}

// Two players opening one chest on the same tick roll it once: the first open
// the tick applies rolls it, the second finds it open. Edge "Two players open a
// chest at once".
func TestForestChest_TwoOpensInOneTickRollOnce(t *testing.T) {
	r := &chestRoll{f: 0}
	forest := lootedForest(t, r)
	chest, first := firstChest(t, forest)
	at := transformOf(t, chest)
	second := seatAt(forest, FieldPoint{X: at.X, Y: at.Y})

	for _, player := range []uuid.UUID{first, second} {
		forest.queueIntent(func() { _ = forest.handleInteract(player, chest.ID) })
	}
	tick(forest)

	assert.Len(t, r.asked, 1, "one roll")
	held := chestHolds(t, chest)
	assert.NotEmpty(t, held)
	assert.Equal(t, len(held), itemCount(forest), "no second roll's items anywhere")
}

// A chest opened again after its first open rolls nothing new.
func TestForestChest_ReopenRollsNothing(t *testing.T) {
	r := &chestRoll{f: 0}
	forest := lootedForest(t, r)
	chest, player := firstChest(t, forest)

	require.NoError(t, forest.handleInteract(player, chest.ID))
	held := chestHolds(t, chest)
	releaseInteraction(forest, chest.ID, player)
	require.NoError(t, forest.handleInteract(player, chest.ID))

	assert.Len(t, r.asked, 1, "one roll")
	assert.Equal(t, held, chestHolds(t, chest))
}

// ageChests advances a world's field chests by seconds, as its tick would over
// that long.
func ageChests(s *Session, seconds float64) {
	s.restockFieldChests(seconds, s.EntityManager.GetAllEntities())
}

// ForestChestRestockDelay is the FS's 5 minutes. R19, D20.
func TestForestChestRestockDelay_IsFiveMinutes(t *testing.T) {
	assert.Equal(t, 300.0, ForestChestRestockDelay)
	assert.Equal(t, ForestChestRestockDelay, ForlornForest(forestLayoutFor(t, forestSeed)).ChestRestockDelay)
}

// 5 minutes after its first open a chest is closed and empty, what it still
// held gone from the world; the next open rolls afresh. R19, AC chest item.
func TestForestChest_RestocksFiveMinutesAfterFirstOpen(t *testing.T) {
	r := &chestRoll{f: 0}
	forest := lootedForest(t, r)
	chest, player := firstChest(t, forest)

	require.NoError(t, forest.handleInteract(player, chest.ID))
	held := chestHolds(t, chest)
	require.NotEmpty(t, held)

	ageChests(forest, ForestChestRestockDelay-0.1)
	assert.True(t, openable(t, chest).IsOpen, "still open just before the mark")
	assert.Equal(t, held, chestHolds(t, chest), "still holding just before the mark")

	ageChests(forest, 0.1)
	assert.False(t, openable(t, chest).IsOpen, "closed at the mark")
	assert.False(t, openable(t, chest).HasBeenOpened, "the next open rolls again")
	assert.Empty(t, chestHolds(t, chest), "empty at the mark")
	assert.Zero(t, itemCount(forest), "what it held is gone from the world")

	releaseInteraction(forest, chest.ID, player)
	require.NoError(t, forest.handleInteract(player, chest.ID))
	assert.Len(t, r.asked, 2, "the next open rolls afresh")
	assert.NotEmpty(t, chestHolds(t, chest))
}

// The 5 minutes run from the first open, not from the build: a chest left
// unopened does not age. R19.
func TestForestChest_RestockCountsFromTheFirstOpen(t *testing.T) {
	forest := lootedForest(t, &chestRoll{f: 0})
	chest, player := firstChest(t, forest)

	ageChests(forest, 2*ForestChestRestockDelay)
	assert.False(t, openable(t, chest).IsOpen)

	require.NoError(t, forest.handleInteract(player, chest.ID))
	ageChests(forest, ForestChestRestockDelay-0.1)
	assert.True(t, openable(t, chest).IsOpen, "a fresh 5 minutes from the first open")
	assert.NotEmpty(t, chestHolds(t, chest))
}

// A chest's time since its first open is its own clock, never a pile's age:
// it runs from the first open and is back to zero as the chest restocks. R19.
func TestForestChest_TimeOpenIsKeptApartFromPileAge(t *testing.T) {
	forest := lootedForest(t, &chestRoll{f: 0})
	chest, player := firstChest(t, forest)
	require.NoError(t, forest.handleInteract(player, chest.ID))

	ageChests(forest, 10)
	container := pileOf(t, chest)
	assert.InDelta(t, 10.0, container.OpenedFor, 1e-9, "open for 10 s")
	assert.Zero(t, container.Age, "a chest has no pile age")

	ageChests(forest, ForestChestRestockDelay)
	assert.Zero(t, container.OpenedFor, "back to zero as it restocks")
}

// An item already taken when the chest restocks is the taker's; only what is
// still inside vanishes. Edge "A chest is mid-restock while someone stands at it".
func TestForestChest_RestockLeavesTakenItemsWithTheTaker(t *testing.T) {
	forest := lootedForest(t, &chestRoll{f: 0})
	chest, player := firstChest(t, forest)
	require.NoError(t, forest.handleInteract(player, chest.ID))
	held := chestHolds(t, chest)
	require.GreaterOrEqual(t, len(held), 2)

	taken := held[0]
	require.NoError(t, pickUp(t, forest, player, taken), "anyone may take from a chest at once")

	ageChests(forest, ForestChestRestockDelay)
	assert.Contains(t, inventory(t, forest, delverEntity(t, forest, player).ID).ItemIDs, taken)
	_, stillThere := forest.EntityManager.GetEntity(taken)
	assert.True(t, stillThere, "the taken item stays in the world")
	assert.Equal(t, 1, itemCount(forest), "only the taken item is left")
}

// The restock runs on the field's tick.
func TestForestChest_RestockRunsOnTheTick(t *testing.T) {
	forest := lootedForest(t, &chestRoll{f: 0})
	chest, player := firstChest(t, forest)
	require.NoError(t, forest.handleInteract(player, chest.ID))

	ageChests(forest, ForestChestRestockDelay-1.0/float64(constants.GameFrameRate)/2)
	require.True(t, openable(t, chest).IsOpen)
	tick(forest)
	assert.False(t, openable(t, chest).IsOpen, "a tick past the mark closes it")
}

// A run's chest never restocks: the Spire's chests are unchanged.
func TestRunChest_NeverRestocks(t *testing.T) {
	run := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, RunBounds())
	chest := CreateContainerEntity(run.EntityManager, ContainerConfig{X: 100, Y: 100}, []uuid.UUID{uuid.New()})
	open := openable(t, chest)
	open.IsOpen, open.HasBeenOpened = true, true

	ageChests(run, 10*ForestChestRestockDelay)
	assert.True(t, open.IsOpen)
	assert.True(t, open.HasBeenOpened)
	assert.Len(t, chestHolds(t, chest), 1)
}

// releaseInteraction ends the short interaction cooldown on the chest and the
// player's body now, as its timers would a moment later.
func releaseInteraction(s *Session, chestID, playerID uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.containerInteractedCache, chestID)
	delete(s.playerInteractedCache, s.playerIDToEntitiesID[playerID])
}
