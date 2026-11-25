package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R53, R54 (and "Reconciled at wave 2"). I-X2CMM-18.

// hardenedWarrior is a level-9 warrior at (500, 500) who has cast Hardened.
func hardenedWarrior(t *testing.T, em *ecs.EntityManager) *ecs.Entity {
	t.Helper()
	warrior := bookDelver(em, "warrior", 9, 500, 500, components.PageHardened)
	require.NoError(t, NewBookSystem(em).Cast(hardenedCast(warrior)))
	require.True(t, Hardened(warrior))
	return warrior
}

// runHardenedOut ticks the books past hardened's 10 s.
func runHardenedOut(em *ecs.EntityManager) {
	books := NewBookSystem(em)
	for range 10*30 + 1 {
		books.Update(poisonTick, em.GetAllEntities(), BookGround{})
	}
}

// Hardened is the warrior's hardened state, on while it runs and off once its
// 10 s are up. R30, R53.
func TestHardened_WhileTheStateRuns(t *testing.T) {
	em := ecs.NewEntityManager()
	assert.False(t, Hardened(bookDelver(em, "warrior", 9, 0, 0, components.PageHardened)), "not cast")
	assert.False(t, Hardened(bodyAt(em, 0, 0)), "no book")
	assert.False(t, Hardened(nil))

	warrior := hardenedWarrior(t, em)
	runHardenedOut(em)
	assert.False(t, Hardened(warrior), "its 10 s are up")
}

// A poisoning does not take hold on a hardened warrior. R53.
func TestPoison_DoesNotTakeHoldOnAHardenedWarrior(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := hardenedWarrior(t, em)

	Poison(warrior, poisonFor)

	_, poisoned := PoisonedFor(warrior)
	assert.False(t, poisoned)
	assert.False(t, warrior.HasComponent(ecs.ComponentTypePoison))
}

// A poison already running when the warrior hardens runs on: it keeps its
// time and its bite, and a poisoning while hardened does not refresh it.
// R53, "Reconciled at wave 2".
func TestPoison_AlreadyRunningRunsOnThroughHardened(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := bookDelver(em, "warrior", 9, 500, 500, components.PageHardened)
	healthT(t, warrior).MaxHealth, healthT(t, warrior).CurrentHealth = 200, 200
	Poison(warrior, poisonFor)
	tickPoison(em, 10)
	require.NoError(t, NewBookSystem(em).Cast(hardenedCast(warrior)))
	health := healthT(t, warrior).CurrentHealth

	Poison(warrior, poisonFor)
	left, poisoned := PoisonedFor(warrior)
	require.True(t, poisoned, "it runs on")
	assert.InDelta(t, 50, left, 1e-6, "not refreshed")

	tickPoison(em, 1)
	assert.Equal(t, health-2, healthT(t, warrior).CurrentHealth, "still 1% a second")
}

// Once hardened ends, a poisoning takes hold again. R53.
func TestPoison_TakesHoldOnceHardenedEnds(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := hardenedWarrior(t, em)
	runHardenedOut(em)

	Poison(warrior, poisonFor)

	left, poisoned := PoisonedFor(warrior)
	require.True(t, poisoned)
	assert.Equal(t, poisonFor, left)
}

// Drinking a draught cures the drinker's poison at once, as well as starting
// its heal. R54.
func TestBookSystemDrinkDraught_CuresPoison(t *testing.T) {
	em := ecs.NewEntityManager()
	_, draught := brewedDraught(t, em)
	mate := bookDelver(em, "warrior", 1, 520, 500)
	healthT(t, mate).MaxHealth, healthT(t, mate).CurrentHealth = 200, 100
	Poison(mate, poisonFor)
	books := NewBookSystem(em)

	require.NoError(t, books.DrinkDraught(mate, draught))

	_, poisoned := PoisonedFor(mate)
	assert.False(t, poisoned, "cured")
	assert.False(t, mate.HasComponent(ecs.ComponentTypePoison))
	assert.Equal(t, 6.0, bookOfT(t, mate).States[components.BookStateDraught], "and healing")
}

// A drink refused leaves the poison running. R54.
func TestBookSystemDrinkDraught_ARefusedDrinkCuresNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	_, draught := brewedDraught(t, em)
	far := bookDelver(em, "warrior", 1, 561, 500)
	Poison(far, poisonFor)

	require.ErrorIs(t, NewBookSystem(em).DrinkDraught(far, draught), ErrDraughtOutOfReach)

	left, poisoned := PoisonedFor(far)
	assert.True(t, poisoned)
	assert.Equal(t, poisonFor, left)
}
