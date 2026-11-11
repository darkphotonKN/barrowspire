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

// FS-MQYEX §Requirements 6–13. I-MQYEX-2.

// reach applies the delver's interact on the next tick, as a client's arrives,
// and fails the test if it is refused.
func reach(t *testing.T, s *Session, playerID, containerID uuid.UUID) {
	t.Helper()
	var reachErr error
	s.queueIntent(func() { reachErr = s.handleInteract(playerID, containerID) })
	tick(s)
	require.NoError(t, reachErr)
}

// assertShutAndUnrolled is a container a cancelled timed open left alone.
func assertShutAndUnrolled(t *testing.T, container *ecs.Entity) {
	t.Helper()
	assert.False(t, openable(t, container).IsOpen, "a cancel opens nothing")
	assert.False(t, openable(t, container).HasBeenOpened, "and rolls nothing")
	assert.Empty(t, chestHolds(t, container))
}

// A delver whose body moves during a timed open has none afterwards, and the
// container stays shut and unrolled however long they then wait: walking, and
// the warrior's dash. R6, R11, D3.
func TestTimedOpen_MovingCancels(t *testing.T) {
	moves := map[string]func(t *testing.T, s *Session, player uuid.UUID){
		"walking": func(t *testing.T, s *Session, player uuid.UUID) {
			require.NoError(t, s.handleMove(player, 0, 1))
			tick(s)
			require.NoError(t, s.handleMove(player, 0, 0))
		},
		"a dash": func(t *testing.T, s *Session, player uuid.UUID) {
			require.NoError(t, s.handleCastSkill(player, "dash", 500, 900))
			// the cast lands on one tick and carries the body from the next
			ticks(s, 2)
		},
	}
	for name, move := range moves {
		t.Run(name, func(t *testing.T) {
			s, player := containerSession(t, 500, 500)
			chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
			delver := delverEntity(t, s, player)
			reach(t, s, player, chest.ID)
			ticks(s, 10)
			require.NotNil(t, timedOpenOf(delver))

			move(t, s, player)

			require.NotEqual(t, components.TransformComponent{X: 500, Y: 500}, *transformOf(t, delver), "the body moved")
			assert.Nil(t, timedOpenOf(delver), "moving cancels the timed open")
			ticks(s, timedOpenTicks()+1)
			assertShutAndUnrolled(t, chest)
		})
	}
}

// A move that moves nothing cancels nothing: one of no velocity, and one into
// a wall the body already stands against. The timed open completes on its
// 45th tick all the same. R6, D3.
func TestTimedOpen_AMoveThatMovesNothingDoesNotCancel(t *testing.T) {
	t.Run("zero velocity", func(t *testing.T) {
		s, player := containerSession(t, 500, 500)
		chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
		reach(t, s, player, chest.ID)

		s.queueIntent(func() { _ = s.handleMove(player, 0, 0) })
		ticks(s, timedOpenTicks()-1)
		require.NotNil(t, timedOpenOf(delverEntity(t, s, player)), "still counting on the 44th tick")
		assert.False(t, openable(t, chest).IsOpen)

		tick(s)
		assert.True(t, openable(t, chest).IsOpen, "open on the 45th tick")
	})
	t.Run("a wall in the way", func(t *testing.T) {
		s, player := containerSession(t, 500, 500)
		delver := delverEntity(t, s, player)
		CreateWallEntity(s.EntityManager, WallConfig{X: 540, Y: 0, Width: 20, Height: constants.MapHeight}, uuid.New())
		// walk into the wall until it stops the body
		require.NoError(t, s.handleMove(player, 1, 0))
		ticks(s, 30)
		at := *transformOf(t, delver)
		tick(s)
		require.Equal(t, at, *transformOf(t, delver), "the wall holds the body")
		chest, _ := s.EntityManager.GetEntity(s.AddContainer(at.X, at.Y+5, components.ContainerKindChest))

		reach(t, s, player, chest.ID)
		ticks(s, timedOpenTicks()-1)
		require.Equal(t, at, *transformOf(t, delver), "still pushing at the wall, going nowhere")
		require.NotNil(t, timedOpenOf(delver), "still counting on the 44th tick")
		assert.False(t, openable(t, chest).IsOpen)

		tick(s)
		assert.True(t, openable(t, chest).IsOpen, "open on the 45th tick")
	})
}

// strikeFrom stands a ghoul beside the delver and has it strike them on the
// next tick.
func strikeFrom(t *testing.T, s *Session, delver *ecs.Entity) {
	t.Helper()
	at := transformOf(t, delver)
	ghoul := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: at.X + 40, Y: at.Y})
	ic, _ := ghoul.GetComponent(ecs.ComponentTypeAttackIntent)
	ic.(*components.AttackIntentComponent).Pending = []components.AttackIntent{{Kind: components.AttackMonsterStrike, TargetEntityID: delver.ID}}
}

// A hit that costs the delver health cancels their timed open: the container
// stays shut and unrolled. R7, R11, D4.
func TestTimedOpen_AHitThatCostsHealthCancels(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	delver := delverEntity(t, s, player)
	reach(t, s, player, chest.ID)
	ticks(s, 10)
	before := currentHealth(delver)

	strikeFrom(t, s, delver)
	tick(s)

	require.Less(t, currentHealth(delver), before, "the strike cost health")
	assert.Nil(t, timedOpenOf(delver), "a hit cancels the timed open")
	assertShutAndUnrolled(t, chest)
}

// A strike the mercenary parries costs no health and cancels nothing. R7, D4.
func TestTimedOpen_AParriedStrikeDoesNotCancel(t *testing.T) {
	s, _ := containerSession(t, 100, 100)
	merc, delver := placeDelver(t, s, "mercenary", 500, 500)
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	reach(t, s, merc, chest.ID)
	before := currentHealth(delver)

	require.NoError(t, s.handleCastSkill(merc, "parry", 0, 0))
	strikeFrom(t, s, delver)
	tick(s)

	require.Equal(t, 1, parryChargesOf(t, delver).Current, "the strike was parried")
	require.Equal(t, before, currentHealth(delver), "and cost nothing")
	assert.NotNil(t, timedOpenOf(delver), "a parried strike cancels nothing")
}

// A heal cancels nothing, and nor does the drink that gave it: the timed open
// completes on its 45th tick. R7, R13, D4, D9.
func TestTimedOpen_AHealDoesNotCancel(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	delver := delverEntity(t, s, player)
	tick(s) // the gear is seated
	hurt(t, delver, 40, 150)
	inConsumableSlot(t, s, delver, 1, lootedHealthPotion(30))
	reach(t, s, player, chest.ID)

	s.Drink(player)
	ticks(s, timedOpenTicks()-1)

	require.Equal(t, 70, currentHealth(delver), "the drink healed")
	require.NotNil(t, timedOpenOf(delver), "still counting on the 44th tick")
	tick(s)
	assert.True(t, openable(t, chest).IsOpen, "open on the 45th tick")
}

// A hit on the tick the timed open would complete cancels it: the container
// stays shut. R10, D6.
func TestTimedOpen_AHitOnTheLastTickCancels(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	delver := delverEntity(t, s, player)
	reach(t, s, player, chest.ID)
	ticks(s, timedOpenTicks()-1)
	require.NotNil(t, timedOpenOf(delver), "still counting on the 44th tick")
	before := currentHealth(delver)

	strikeFrom(t, s, delver)
	tick(s)

	require.Less(t, currentHealth(delver), before, "the strike cost health")
	assert.Nil(t, timedOpenOf(delver))
	assertShutAndUnrolled(t, chest)
}

// A hit cancels even when the same tick's kill heals the delver for more than
// the hit cost: the hit is read from the combat, not from the health the tick
// ends on. R7, D4.
func TestTimedOpen_AHitCancelsThoughAKillsHealOutweighsIt(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	delver := delverEntity(t, s, player)
	wearing(t, s, delver, inHeadSlot, hollowCrown())
	tick(s) // the gear seats
	hurt(t, delver, 500, 1000)
	reach(t, s, player, chest.ID)

	require.NoError(t, s.handleAttack(player, frailGhoul(s, 500, 545).ID))
	strikeFrom(t, s, delver)
	tick(s)

	require.Greater(t, currentHealth(delver), 500, "the kill healed more than the hit cost")
	require.Less(t, currentHealth(delver), 540, "and the hit cost health")
	assert.Nil(t, timedOpenOf(delver), "the hit cancels the timed open")
}

// A delver who is no longer in play has no timed open from that tick, and the
// container they were opening stays shut: one who dies, one who escapes, and
// one who leaves the run. Nobody else's timed open is touched. R9, R11, D7.
func TestTimedOpen_ADelverOutOfPlayHasNone(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(t *testing.T, s *Session, playerID uuid.UUID, delver *ecs.Entity)
		gone    bool // the body left the world
	}{
		{"dies", func(t *testing.T, _ *Session, _ uuid.UUID, delver *ecs.Entity) { kill(t, delver) }, false},
		{"escapes", func(_ *testing.T, s *Session, playerID uuid.UUID, _ *ecs.Entity) { s.handlePlayerEscape(playerID) }, false},
		{"leaves the run", func(_ *testing.T, s *Session, playerID uuid.UUID, _ *ecs.Entity) { s.RemovePlayer(playerID.String()) }, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, player := containerSession(t, 500, 500)
			s.endSessionCh = make(chan bool, 64)
			delver := delverEntity(t, s, player)
			chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
			// someone else, at their own chest, keeps the run going
			other, otherDelver := placeDelver(t, s, "mage", 900, 900)
			otherChest, _ := s.EntityManager.GetEntity(s.AddContainer(905, 900, components.ContainerKindChest))
			reach(t, s, player, chest.ID)
			reach(t, s, other, otherChest.ID)

			tt.resolve(t, s, player, delver)
			tick(s)

			if !tt.gone {
				assert.Nil(t, timedOpenOf(delver), "out of play ends the timed open")
			}
			assert.NotNil(t, timedOpenOf(otherDelver), "nobody else's is touched")
			ticks(s, timedOpenTicks())
			assertShutAndUnrolled(t, chest)
		})
	}
}

// A delver removed from a ticking run goes on the tick, through its intents,
// after the tick's entities were read: their body is still among them. Leaving
// on the tick their timed open would complete opens nothing. R9, D7.
func TestTimedOpen_ADelverRemovedOnTheLastTickOpensNothing(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	s.endSessionCh = make(chan bool, 64)
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	// someone else keeps the run going
	placeDelver(t, s, "mage", 900, 900)
	reach(t, s, player, chest.ID)
	ticks(s, timedOpenTicks()-1)
	require.NotNil(t, timedOpenOf(delverEntity(t, s, player)), "still counting on the 44th tick")
	s.isRunning = true // a tick runs: the removal waits for it

	s.RemovePlayer(player.String())
	require.Contains(t, s.GetPlayerIDs(), player, "the body goes on the tick")
	tick(s)

	require.NotContains(t, s.GetPlayerIDs(), player)
	assertShutAndUnrolled(t, chest)
}

// A floor change ends every timed open: the container went with the floor, and
// nothing carries to the next one. R8–R9, D7.
func TestTimedOpen_AFloorChangeLeavesNone(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	player := uuid.New()
	s.AddPlayer(player, types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")
	delver := delverEntity(t, s, player)
	at := transformOf(t, delver)
	chestID := s.AddContainer(at.X+5, at.Y, components.ContainerKindChest)
	reach(t, s, player, chestID)
	require.NotNil(t, timedOpenOf(delver))

	require.NoError(t, s.regenerateFloor())
	// where the body stood is not what ends it here: the container is gone
	open := timedOpenOf(delver)
	open.FromX, open.FromY = transformOf(t, delver).X, transformOf(t, delver).Y
	tick(s)

	_, stands := s.EntityManager.GetEntity(chestID)
	require.False(t, stands, "the container went with the floor")
	assert.Nil(t, timedOpenOf(delverEntity(t, s, player)), "a floor change leaves no timed open")
}

// A second reach for the container the delver is already opening changes
// nothing: the time neither restarts nor shortens, and the container opens on
// the 45th tick after the first reach. R12, D8.
func TestTimedOpen_ASecondReachForTheSameContainerChangesNothing(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	delver := delverEntity(t, s, player)
	dt := 1.0 / float64(constants.GameFrameRate)
	reach(t, s, player, chest.ID)
	ticks(s, 20)

	releaseInteraction(s, chest.ID, player)
	reach(t, s, player, chest.ID) // the 21st tick after the first reach's

	open := timedOpenOf(delver)
	require.NotNil(t, open)
	assert.InDelta(t, 22*dt, open.Elapsed, 1e-9, "the time is not restarted")
	assert.False(t, targetReserved(s, chest.ID), "and the container is still held for nobody")

	ticks(s, timedOpenTicks()-22)
	require.NotNil(t, timedOpenOf(delver), "nor shortened: still counting on the 44th tick")
	assert.False(t, openable(t, chest).IsOpen)
	tick(s)
	assert.True(t, openable(t, chest).IsOpen, "open on the 45th tick after the first reach")
}

// A reach for another shut container replaces the delver's timed open, from
// zero: the first container stays shut and the second opens on the 45th tick
// after its own reach. R12, D8.
func TestTimedOpen_AReachForAnotherContainerReplacesIt(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	first, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	second, _ := s.EntityManager.GetEntity(s.AddContainer(500, 505, components.ContainerKindSack))
	s.chestRand = fixedRand{f: SackEmptyChance}
	delver := delverEntity(t, s, player)
	dt := 1.0 / float64(constants.GameFrameRate)
	reach(t, s, player, first.ID)
	ticks(s, 20)

	releaseInteraction(s, first.ID, player)
	reach(t, s, player, second.ID)

	open := timedOpenOf(delver)
	require.NotNil(t, open)
	assert.Equal(t, second.ID, open.ContainerID)
	assert.InDelta(t, dt, open.Elapsed, 1e-9, "from zero")

	ticks(s, timedOpenTicks()-1)
	assert.False(t, openable(t, second).IsOpen, "shut on the 44th tick after its own reach")
	tick(s)
	assert.True(t, openable(t, second).IsOpen, "open on the 45th")
	assertShutAndUnrolled(t, first)
}

// After a cancel the delver may reach again at once: the new timed open starts
// from zero and completes after the full 1.5 s. Nothing is sent for the
// cancel. R11, R20.
func TestTimedOpen_AfterACancelTheNextReachStartsFromZero(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	sent := &recordingSender{}
	s.sender = sent
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	delver := delverEntity(t, s, player)
	dt := 1.0 / float64(constants.GameFrameRate)
	reach(t, s, player, chest.ID)
	ticks(s, 30)

	// a step aside cancels it
	require.NoError(t, s.handleMove(player, 0, 1))
	tick(s)
	require.NoError(t, s.handleMove(player, 0, 0))
	require.Nil(t, timedOpenOf(delver))
	assert.Empty(t, sent.to(player), "no reply for the cancel")

	releaseInteraction(s, chest.ID, player)
	reach(t, s, player, chest.ID)

	open := timedOpenOf(delver)
	require.NotNil(t, open, "the next reach starts a timed open")
	assert.InDelta(t, dt, open.Elapsed, 1e-9, "from zero")
	ticks(s, timedOpenTicks()-1)
	assert.False(t, openable(t, chest).IsOpen, "shut on the 44th tick after the new reach")
	tick(s)
	assert.True(t, openable(t, chest).IsOpen, "open after the full 1.5 s")
	assert.Empty(t, sent.to(player))
}

// Nothing but moving, a hit and leaving reach cancels: a delver who attacks,
// casts an ability that leaves the body where it stands, or equips and
// unequips, still has their timed open, and it completes on its 45th tick.
// (A drink: TestTimedOpen_AHealDoesNotCancel.) R13, D9.
func TestTimedOpen_NothingElseCancels(t *testing.T) {
	acts := map[string]func(t *testing.T, s *Session, player uuid.UUID, delver *ecs.Entity){
		"attacking": func(t *testing.T, s *Session, player uuid.UUID, _ *ecs.Entity) {
			target := unarmoredTarget(s, 500, 545)
			require.NoError(t, s.handleAttack(player, target.ID))
			tick(s)
			require.Less(t, currentHealth(target), 1000, "the attack landed")
		},
		"casting an ability that does not move the body": func(t *testing.T, s *Session, player uuid.UUID, delver *ecs.Entity) {
			before := currentResource(delver)
			require.NoError(t, s.handleCastSkill(player, "triple_fireball", 500, 900))
			tick(s)
			require.Less(t, currentResource(delver), before, "the cast was paid for")
		},
		"equipping and unequipping": func(t *testing.T, s *Session, _ uuid.UUID, delver *ecs.Entity) {
			sword := carried(t, s, delver.ID, types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeWeapon, Name: "Sword"})
			require.NoError(t, s.handleEquip(constants.ActionEquip, delver.ID, sword))
			tick(s)
			require.NoError(t, s.handleEquip(constants.ActionUnequip, delver.ID, sword))
			tick(s)
		},
	}
	classes := map[string]string{"casting an ability that does not move the body": "mage"}
	for name, act := range acts {
		t.Run(name, func(t *testing.T) {
			class := classes[name]
			if class == "" {
				class = "warrior"
			}
			s, _ := containerSession(t, 100, 100)
			player, delver := placeDelver(t, s, class, 500, 500)
			chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
			reach(t, s, player, chest.ID)
			ticks(s, 5)

			act(t, s, player, delver)

			open := timedOpenOf(delver)
			require.NotNil(t, open, "the timed open is still running")
			left := timedOpenTicks() - int(math.Round(open.Elapsed*float64(constants.GameFrameRate)))
			ticks(s, left)
			assert.False(t, openable(t, chest).IsOpen, "shut on the 44th tick")
			tick(s)
			assert.True(t, openable(t, chest).IsOpen, "open on the 45th tick")
		})
	}
}

// A reach made while walking starts a timed open and loses it on the same
// tick: no state ever shows it, and nothing opens. Edge state "the reach is
// made while walking".
func TestTimedOpen_AReachMadeWhileWalkingIsCancelledOnItsOwnTick(t *testing.T) {
	s, player := containerSession(t, 500, 500)
	chest, _ := s.EntityManager.GetEntity(s.AddContainer(505, 500, components.ContainerKindChest))
	require.NoError(t, s.handleMove(player, 0, 1))

	reach(t, s, player, chest.ID)

	assert.Nil(t, timedOpenOf(delverEntity(t, s, player)))
	assert.NotContains(t, frameOf(t, s, types.WorldTypeRun, player)["current_player"], "timed_open")
	require.NoError(t, s.handleMove(player, 0, 0))
	ticks(s, timedOpenTicks()+1)
	assertShutAndUnrolled(t, chest)
}
