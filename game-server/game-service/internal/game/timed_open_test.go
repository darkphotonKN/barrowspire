package game

import (
	"context"
	"encoding/json"
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// FS-MQYEX §Requirements 1–5, 18–20. I-MQYEX-1.

// timedOpenTicks is the ticks a timed open takes after the reach's own.
func timedOpenTicks() int {
	return int(math.Round(TimedOpenDuration * float64(constants.GameFrameRate)))
}

// timedOpenOf is the delver's timed open, nil when they have none.
func timedOpenOf(delver *ecs.Entity) *components.TimedOpenComponent {
	oc, ok := delver.GetComponent(ecs.ComponentTypeTimedOpen)
	if !ok {
		return nil
	}
	return oc.(*components.TimedOpenComponent)
}

/**
* openThrough reaches for a run's shut container and counts the delver's timed
* open through to its end, nothing else in the world moving: the reach's own
* tick, then the ticks the timed open takes. A refused reach returns its error
* and counts nothing.
**/
func openThrough(t *testing.T, s *Session, playerID, containerID uuid.UUID) error {
	t.Helper()
	if err := s.handleInteract(playerID, containerID); err != nil {
		return err
	}
	require.NotNil(t, timedOpenOf(delverEntity(t, s, playerID)), "the reach starts a timed open")
	for range timedOpenTicks() + 1 {
		s.advanceTimedOpens(1.0/float64(constants.GameFrameRate), s.EntityManager.GetAllEntities())
	}
	return nil
}

// playerHeld is whether the delver is under their own interact hold.
func playerHeld(s *Session, playerID uuid.UUID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, held := s.playerInteractedCache[s.playerIDToEntitiesID[playerID]]
	return held
}

// worldWithShutChest is an unstarted world of the bounds given with a delver
// beside a shut chest and an item pool to roll it from.
func worldWithShutChest(t *testing.T, bounds WorldBounds) (s *Session, player uuid.UUID, chest *ecs.Entity) {
	t.Helper()
	client := &mockItemsClient{rarities: pbRarities()}
	client.On("ListItemTemplates", mock.Anything).Return(lootTemplates(true), nil)

	em := ecs.NewEntityManager()
	s = newSession(&mockSessionCloser{}, createMockSender(), serializer.NewStateSerializer(em, nil), em, &mockEventEmitter{}, client, bounds)
	require.NoError(t, s.InitializeItems(context.Background()))

	player, _ = placeDelver(t, s, "warrior", 500, 500)
	chest, _ = s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	return s, player, chest
}

// frameOf is the state one recipient is sent this tick, as the JSON the client
// reads.
func frameOf(t *testing.T, s *Session, worldType types.WorldType, recipient uuid.UUID) map[string]any {
	t.Helper()
	ss := serializer.NewStateSerializer(s.EntityManager, nil)
	state, err := ss.SerializeBackendState(context.Background(), s.ID, worldType, s.EntityManager.GetAllEntities())
	require.NoError(t, err)
	raw, err := json.Marshal(ss.FormatStateToClientState(state, recipient))
	require.NoError(t, err)
	var frame map[string]any
	require.NoError(t, json.Unmarshal(raw, &frame))
	return frame
}

// In a run a reach for a shut chest or sack, in reach with no guard, leaves it
// shut and unrolled and starts the delver's timed open. The tick counts it:
// the container is still shut 44 ticks after the tick that applied the reach,
// and open and rolled on the 45th. Nothing is sent for the start or the end,
// the container is not held, and the delver's own hold is taken as an open
// takes it. R2, R4, R5, R20, D12.
func TestTimedOpen_AShutRunContainerOpensOnThe45thTickAfterTheReach(t *testing.T) {
	require.Equal(t, 30, constants.GameFrameRate, "the tick counts below assume 30 ticks a second")
	require.Equal(t, 45, timedOpenTicks())

	for _, kind := range []components.ContainerKind{components.ContainerKindChest, components.ContainerKindSack} {
		t.Run(string(kind), func(t *testing.T) {
			s, player := containerSession(t, 500, 500)
			s.chestRand = fixedRand{f: SackEmptyChance}
			sent := &recordingSender{}
			s.sender = sent
			container, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, kind))
			delver := delverEntity(t, s, player)

			var reachErr error
			s.queueIntent(func() { reachErr = s.handleInteract(player, container.ID) })
			tick(s)

			require.NoError(t, reachErr)
			open := timedOpenOf(delver)
			require.NotNil(t, open, "the reach starts a timed open")
			assert.Equal(t, container.ID, open.ContainerID)
			assert.Equal(t, TimedOpenDuration, open.Duration)
			assert.Equal(t, [2]float64{500, 500}, [2]float64{open.FromX, open.FromY}, "where the body stood")
			assert.False(t, openable(t, container).IsOpen, "the reach leaves it shut")
			assert.False(t, openable(t, container).HasBeenOpened, "and unrolled")
			assert.Zero(t, itemCount(s))
			assert.False(t, targetReserved(s, container.ID), "the start holds the container for nobody")
			assert.True(t, playerHeld(s, player), "the delver's own hold is taken")

			ticks(s, timedOpenTicks()-1)
			require.NotNil(t, timedOpenOf(delver), "still counting on the 44th tick")
			assert.False(t, openable(t, container).IsOpen, "shut on the 44th tick")
			assert.False(t, openable(t, container).HasBeenOpened)
			assert.Zero(t, itemCount(s), "nothing is rolled before it opens")

			tick(s)
			assert.True(t, openable(t, container).IsOpen, "open on the 45th tick")
			assert.True(t, openable(t, container).HasBeenOpened)
			assert.NotEmpty(t, chestHolds(t, container), "rolled on the 45th tick")
			assert.Len(t, chestHolds(t, container), itemCount(s), "rolled once")
			assert.Nil(t, timedOpenOf(delver), "the timed open is gone once it opens")
			assert.Empty(t, sent.to(player), "no reply for the start or the end")
		})
	}
}

// A drop pile and a container that is already open have no timed open: the
// reach behaves as it always has. R1, L4.
func TestTimedOpen_NoneForADropPileOrAnOpenContainer(t *testing.T) {
	t.Run("drop pile", func(t *testing.T) {
		s, player := containerSession(t, 500, 500)
		pile := CreateDropPileEntity(s.EntityManager, 505, 500, []uuid.UUID{s.AddItem(pickupBread)})
		held := chestHolds(t, pile)

		require.NoError(t, s.handleInteract(player, pile.ID))

		assert.Nil(t, timedOpenOf(delverEntity(t, s, player)))
		assert.True(t, openable(t, pile).IsOpen)
		assert.Equal(t, held, chestHolds(t, pile), "a pile is never rolled")
		assert.True(t, targetReserved(s, pile.ID), "an open holds the container briefly, as before")
	})
	t.Run("open chest", func(t *testing.T) {
		s, player := containerSession(t, 500, 500)
		chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
		require.NoError(t, openThrough(t, s, player, chest.ID))
		held := chestHolds(t, chest)
		releaseInteraction(s, chest.ID, player)

		require.NoError(t, s.handleInteract(player, chest.ID))

		assert.Nil(t, timedOpenOf(delverEntity(t, s, player)))
		assert.True(t, openable(t, chest).IsOpen, "a chest never closes")
		assert.Equal(t, held, chestHolds(t, chest), "rolled once")
		assert.True(t, targetReserved(s, chest.ID), "an open holds the container briefly, as before")
	})
}

// In the hub and in a field a shut container opens on the reach, as it always
// has: no timed open is started and the state carries none. R1, R18, L5.
func TestTimedOpen_HubAndFieldContainersOpenOnTheReach(t *testing.T) {
	t.Run("hub", func(t *testing.T) {
		s, player, chest := worldWithShutChest(t, HubBounds())

		require.NoError(t, s.handleInteract(player, chest.ID))

		assert.True(t, openable(t, chest).IsOpen)
		assert.True(t, openable(t, chest).HasBeenOpened)
		assert.NotEmpty(t, chestHolds(t, chest))
		assert.Nil(t, timedOpenOf(delverEntity(t, s, player)))
		assert.NotContains(t, frameOf(t, s, types.WorldTypeHub, player)["current_player"], "timed_open")

		tick(s)
		assert.Nil(t, timedOpenOf(delverEntity(t, s, player)))
	})
	t.Run("field", func(t *testing.T) {
		forest, _, _ := builtForest(t, forestSeed)
		pool := dropSession()
		forest.itemPool, forest.lootRarities = pool.itemPool, pool.lootRarities
		// draws: the level's band pick, then every keep roll kept
		forest.chestRand = fixedRand{f: 0}
		chest, player := firstChest(t, forest)

		require.NoError(t, forest.handleInteract(player, chest.ID))

		assert.True(t, openable(t, chest).IsOpen)
		assert.True(t, openable(t, chest).HasBeenOpened)
		assert.Nil(t, timedOpenOf(delverEntity(t, forest, player)))
		assert.NotContains(t, frameOf(t, forest, types.WorldTypeField, player)["current_player"], "timed_open")
	})
}

// The owner's own state carries their timed open, its elapsed time rising tick
// to tick against the 1.5 s it takes; nobody else's state carries it, the
// container's entry says nothing of it, and it is gone from the state that
// shows the container open. R18–R19.
func TestTimedOpen_RidesTheOwnersStateAlone(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	other, _ := placeDelver(t, s, "mage", 560, 500)
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	dt := 1.0 / float64(constants.GameFrameRate)

	me := func() map[string]any {
		return frameOf(t, s, types.WorldTypeRun, player)["current_player"].(map[string]any)
	}
	containerEntry := func() map[string]any {
		entries := frameOf(t, s, types.WorldTypeRun, player)["containers"].([]any)
		require.Len(t, entries, 1)
		return entries[0].(map[string]any)
	}
	keysOf := func(entry map[string]any) []string {
		var keys []string
		for k := range entry {
			keys = append(keys, k)
		}
		return keys
	}

	require.NotContains(t, me(), "timed_open", "absent with none")
	before := keysOf(containerEntry())

	s.queueIntent(func() { _ = s.handleInteract(player, chest.ID) })
	for n := 1; n <= 3; n++ {
		tick(s)

		timedOpen, ok := me()["timed_open"].(map[string]any)
		require.True(t, ok, "tick %d: the owner is told their timed open", n)
		assert.Len(t, timedOpen, 3)
		assert.Equal(t, chest.ID.String(), timedOpen["entity_id"])
		assert.InDelta(t, float64(n)*dt, timedOpen["elapsed"], 1e-9, "tick %d: elapsed rises with the tick", n)
		assert.Equal(t, 1.5, timedOpen["duration"])
	}

	theirs := frameOf(t, s, types.WorldTypeRun, other)
	assert.NotContains(t, theirs["current_player"], "timed_open", "another delver has none of their own")
	others := theirs["other_players"].([]any)
	require.Len(t, others, 1)
	assert.NotContains(t, others[0], "timed_open", "nobody is told another's timed open")
	assert.ElementsMatch(t, before, keysOf(containerEntry()), "the container's entry gains nothing")
	assert.Equal(t, false, containerEntry()["is_open"])

	ticks(s, timedOpenTicks()-2)
	assert.Equal(t, true, containerEntry()["is_open"])
	assert.NotContains(t, me(), "timed_open", "gone once the container opens")
}
