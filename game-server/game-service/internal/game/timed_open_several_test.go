package game

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-MQYEX §Requirements 14–17. I-MQYEX-3.

// twoAtOneChest is a run with two delvers standing either side of one shut
// chest, both in reach of it and clear of each other's body.
func twoAtOneChest(t *testing.T) (s *Session, first, second uuid.UUID, chest *ecs.Entity) {
	t.Helper()
	s, first = containerSession(t, 500, 500)
	second, _ = placeDelver(t, s, "mage", 560, 500)
	chest, _ = s.EntityManager.GetEntity(s.AddContainer(530, 500, components.ContainerKindChest))
	return s, first, second, chest
}

// holdContainer puts the per-container interact hold on the container, as an
// interact that took it would.
func holdContainer(s *Session, containerID uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.containerInteractedCache[containerID] = true
}

// Two delvers reaching for one shut container each start a timed open of their
// own, whether the two reaches are applied on the same tick or 50 ms apart:
// nobody is refused because another is opening it, and the container is held
// for nobody. R14–R15, L7–L8.
func TestTimedOpen_TwoReachingForOneContainerBothStart(t *testing.T) {
	gaps := map[string]func(s *Session, reachFirst, reachSecond func()){
		"on the same tick": func(s *Session, reachFirst, reachSecond func()) {
			s.queueIntent(reachFirst)
			s.queueIntent(reachSecond)
			tick(s)
		},
		"50 ms apart": func(s *Session, reachFirst, reachSecond func()) {
			s.queueIntent(reachFirst)
			tick(s)
			time.Sleep(50 * time.Millisecond)
			s.queueIntent(reachSecond)
			tick(s)
		},
	}
	for name, apply := range gaps {
		t.Run(name, func(t *testing.T) {
			s, first, second, chest := twoAtOneChest(t)
			sent := &recordingSender{}
			s.sender = sent

			var firstErr, secondErr error
			apply(s,
				func() { firstErr = s.handleInteract(first, chest.ID) },
				func() { secondErr = s.handleInteract(second, chest.ID) })

			require.NoError(t, firstErr)
			require.NoError(t, secondErr, "the second reach is not dropped")
			for _, player := range []uuid.UUID{first, second} {
				open := timedOpenOf(delverEntity(t, s, player))
				require.NotNil(t, open, "each has a timed open of their own")
				assert.Equal(t, chest.ID, open.ContainerID)
				assert.Empty(t, sent.to(player), "nobody is refused")
			}
			assert.False(t, targetReserved(s, chest.ID), "the container is held for nobody")
			assertShutAndUnrolled(t, chest)
		})
	}
}

// A reach for a run's shut container neither checks nor takes the
// per-container interact hold: with the hold on the container the reach still
// starts a timed open, and leaves the hold as it found it. R15, L8.
func TestTimedOpen_AStartNeitherChecksNorTakesTheContainerHold(t *testing.T) {
	for _, kind := range []components.ContainerKind{components.ContainerKindChest, components.ContainerKindSack} {
		t.Run(string(kind), func(t *testing.T) {
			s, player := containerSession(t, 500, 500)
			container, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, kind))
			holdContainer(s, container.ID)

			require.NoError(t, s.handleInteract(player, container.ID), "the hold is not checked")

			require.NotNil(t, timedOpenOf(delverEntity(t, s, player)))
			assert.True(t, targetReserved(s, container.ID), "nor taken, nor released: it is as the reach found it")
			assert.True(t, playerHeld(s, player), "the delver's own hold is taken as ever (D12)")
		})
	}
}

// The delver's own 100 ms hold is unchanged: a second reach inside it starts
// nothing, on the container another delver is opening as on any. D12.
func TestTimedOpen_ADelversOwnHoldStillDropsTheirReach(t *testing.T) {
	s, first, second, chest := twoAtOneChest(t)
	door := s.AddDoor(540, 510, 20, 20)
	require.NoError(t, s.handleInteract(first, chest.ID))
	require.NoError(t, s.handleInteract(second, door))

	require.Error(t, s.handleInteract(second, chest.ID), "the delver is still on their own hold")

	assert.Nil(t, timedOpenOf(delverEntity(t, s, second)))
	assert.NotNil(t, timedOpenOf(delverEntity(t, s, first)))
}

// A guarded chest refuses each of two delvers while a guard stands, starting
// a timed open for neither; once the guard is down both reaches start one.
// FS-KE075 §J R58–R60; FS-MQYEX §Requirements 3, 15.
func TestTimedOpen_AGuardedChestRefusesEachOfTwoReaches(t *testing.T) {
	s, first, chest, guards, sent := guardedChest(t, 1)
	second, _ := placeDelver(t, s, "mage", 505, 555)

	for _, player := range []uuid.UUID{first, second} {
		require.ErrorIs(t, s.handleInteract(player, chest.ID), ErrContainerGuarded)
		assert.Nil(t, timedOpenOf(delverEntity(t, s, player)), "a refusal starts no timed open")
		assert.Equal(t, []string{RefusalContainerGuarded}, refusalsTo(sent, player), "each is told, by reason")
	}
	assertShutAndUnrolled(t, chest)

	layDead(t, guards[0])
	require.NoError(t, s.handleInteract(first, chest.ID))
	require.NoError(t, s.handleInteract(second, chest.ID))
	assert.NotNil(t, timedOpenOf(delverEntity(t, s, first)))
	assert.NotNil(t, timedOpenOf(delverEntity(t, s, second)))
}

// A cancel is the cancelled delver's alone: with two at one container, the one
// who steps away has no timed open and the other's runs on, opening the
// container on the 45th tick after their own reach. R14.
func TestTimedOpen_ACancelOfOneLeavesTheOtherRunningToCompletion(t *testing.T) {
	s, leaver, stayer, chest := twoAtOneChest(t)
	s.queueIntent(func() { _ = s.handleInteract(leaver, chest.ID) })
	s.queueIntent(func() { _ = s.handleInteract(stayer, chest.ID) })
	tick(s)
	ticks(s, 10)
	require.NotNil(t, timedOpenOf(delverEntity(t, s, leaver)))
	require.NotNil(t, timedOpenOf(delverEntity(t, s, stayer)))

	require.NoError(t, s.handleMove(leaver, 0, 1))
	tick(s)
	require.NoError(t, s.handleMove(leaver, 0, 0))

	require.Nil(t, timedOpenOf(delverEntity(t, s, leaver)), "the one who moved is cancelled")
	require.NotNil(t, timedOpenOf(delverEntity(t, s, stayer)), "the other's is untouched")
	assertShutAndUnrolled(t, chest)

	ticks(s, timedOpenTicks()-12)
	require.NotNil(t, timedOpenOf(delverEntity(t, s, stayer)), "still counting on the 44th tick")
	assert.False(t, openable(t, chest).IsOpen)
	tick(s)
	assert.True(t, openable(t, chest).IsOpen, "open on the 45th tick after the other's reach")
	assert.NotEmpty(t, chestHolds(t, chest))
}

// The first of two timed opens to complete opens the container, rolled once.
// On that tick the other delver's timed open is gone too, and both delvers'
// states show the container open with its items and no timed open. The
// container is never rolled again. R16–R17.
func TestTimedOpen_TheFirstToFinishOpensItForAll(t *testing.T) {
	s, first, second, chest := twoAtOneChest(t)
	reach(t, s, first, chest.ID)
	ticks(s, 10)
	reach(t, s, second, chest.ID) // the 11th tick after the first reach's

	ticks(s, timedOpenTicks()-12)
	require.NotNil(t, timedOpenOf(delverEntity(t, s, first)), "the first is still counting on its 44th tick")
	require.NotNil(t, timedOpenOf(delverEntity(t, s, second)))
	assertShutAndUnrolled(t, chest)

	tick(s)

	require.True(t, openable(t, chest).IsOpen, "the first to finish opens it")
	held := append([]uuid.UUID(nil), chestHolds(t, chest)...)
	require.NotEmpty(t, held)
	assert.Len(t, held, itemCount(s), "rolled once")
	for name, player := range map[string]uuid.UUID{"the first": first, "the second": second} {
		assert.Nil(t, timedOpenOf(delverEntity(t, s, player)), "%s has no timed open on that tick", name)

		frame := frameOf(t, s, types.WorldTypeRun, player)
		assert.NotContains(t, frame["current_player"], "timed_open", "%s's state carries none", name)
		entries := frame["containers"].([]any)
		require.Len(t, entries, 1)
		entry := entries[0].(map[string]any)
		assert.Equal(t, true, entry["is_open"], "%s sees it open", name)
		assert.Len(t, entry["items"], len(held), "%s sees its items", name)
	}

	// the ticks on which the second's own time would have passed
	ticks(s, 15)
	assert.Equal(t, held, chestHolds(t, chest), "never rolled again")
	assert.Len(t, held, itemCount(s))
}

// Two timed opens on one container that complete on the same tick open it
// once, with one roll, and both are gone. R16, edge state "two players finish
// on the same tick".
func TestTimedOpen_TwoCompletingOnTheSameTickRollOnce(t *testing.T) {
	s, first, second, chest := twoAtOneChest(t)
	s.queueIntent(func() { _ = s.handleInteract(first, chest.ID) })
	s.queueIntent(func() { _ = s.handleInteract(second, chest.ID) })
	tick(s)

	ticks(s, timedOpenTicks()-1)
	require.NotNil(t, timedOpenOf(delverEntity(t, s, first)), "both still counting on the 44th tick")
	require.NotNil(t, timedOpenOf(delverEntity(t, s, second)))
	assertShutAndUnrolled(t, chest)

	tick(s)

	require.True(t, openable(t, chest).IsOpen)
	assert.NotEmpty(t, chestHolds(t, chest))
	assert.Len(t, chestHolds(t, chest), itemCount(s), "rolled once")
	assert.Nil(t, timedOpenOf(delverEntity(t, s, first)))
	assert.Nil(t, timedOpenOf(delverEntity(t, s, second)))
}
