package game

import (
	"context"
	"encoding/json"
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-KE075 §J Requirements 57–61 (amendment 2026-11-06, guarded chests).

// guardsOf is the guards a container waits on, and whether it waits on any.
func guardsOf(container *ecs.Entity) ([]uuid.UUID, bool) {
	gc, ok := container.GetComponent(ecs.ComponentTypeGuarded)
	if !ok {
		return nil, false
	}
	return gc.(*components.GuardedComponent).Guards, true
}

// A floor-1 chest in a treasure room or a hall waits on exactly the monsters
// that room spawned as its guards or pack: every monster standing in it at the
// build but the demon, since no top-up or rolled single goes there. A sack, a
// chest in any other room, and a room whose guards all failed to place wait on
// nothing. FS-KE075 §J R57–R58.
func TestDungeonFloor1_ChestsInGuardedRoomsWaitOnTheirGuards(t *testing.T) {
	guarded, sacksInHalls := 0, 0
	for seed := uint64(1); seed <= 200; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		g, sacks := assertChestsWaitOnTheirRoomsGuards(t, s, seed)
		guarded += g
		sacksInHalls += sacks
	}
	require.NotZero(t, guarded, "the builds hold guarded chests to check")
	t.Logf("guarded chests %d, sacks in halls %d", guarded, sacksInHalls)
}

// assertChestsWaitOnTheirRoomsGuards checks every container of s's dungeon
// floor against its room, and counts the guarded chests and the sacks in
// guarded rooms it saw.
func assertChestsWaitOnTheirRoomsGuards(t *testing.T, s *Session, seed uint64) (guarded, sacksInHalls int) {
	t.Helper()
	d := s.dungeon
	require.NotNil(t, d, "seed %d: the floor is a dungeon", seed)

	inRoom := map[int][]uuid.UUID{}
	for _, m := range standardMonstersIn(s) {
		at := transformOf(t, m)
		if room := roomOf(d, at.X, at.Y); room != -1 {
			inRoom[room] = append(inRoom[room], m.ID)
		}
	}

	for _, c := range containers(s) {
		at := transformOf(t, c)
		room := roomOf(d, at.X, at.Y)
		guardedRoom := slices.Contains(d.layout.Roles.Treasure, room) || eligibleHall(d, room)
		chest := kindOf(t, c) == components.ContainerKindChest
		guards, ok := guardsOf(c)

		if guardedRoom && !chest {
			sacksInHalls++
		}
		if !guardedRoom || !chest || len(inRoom[room]) == 0 {
			assert.False(t, ok, "seed %d room %d: a %s here waits on nobody", seed, room, kindOf(t, c))
			continue
		}
		guarded++
		require.True(t, ok, "seed %d room %d: a chest in a guarded room waits on its guards", seed, room)
		assert.ElementsMatch(t, inRoom[room], guards, "seed %d room %d: its guards are the room's spawned guards", seed, room)
	}
	return guarded, sacksInHalls
}

// guardedChest is a run with a delver beside a chest that waits on n ghouls,
// each standing beside it, every message to the delver recorded.
func guardedChest(t *testing.T, n int) (s *Session, player uuid.UUID, chest *ecs.Entity, guards []*ecs.Entity, sent *recordingSender) {
	t.Helper()
	s, player = containerSession(t, 500, 500)
	s.chestRand = fixedRand{f: SackEmptyChance}
	sent = &recordingSender{}
	s.sender = sent

	chestID := s.AddContainer(505, 500, components.ContainerKindChest)
	chest, _ = s.EntityManager.GetEntity(chestID)
	var ids []uuid.UUID
	for i := range n {
		g := CreateMonsterEntity(s.EntityManager, MonsterConfig{
			Archetype: components.MonsterArchetypeGhoul, Level: 1, Elite: true, X: 560, Y: 440 + 60*float64(i),
		})
		guards = append(guards, g)
		ids = append(ids, g.ID)
	}
	if n > 0 {
		chest.AddComponent(components.NewGuardedComponent(ids, false))
	}
	return s, player, chest, guards, sent
}

// layDead is a monster the CombatSystem took to 0 and the death system laid down.
func layDead(t *testing.T, m *ecs.Entity) {
	t.Helper()
	hc, ok := m.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	hc.(*components.HealthComponent).CurrentHealth = 0
	monsterOf(m).Action = components.MonsterActionDead
}

// refusalsTo is the interact refusals sent to player, by reason.
func refusalsTo(sent *recordingSender, player uuid.UUID) []string {
	var reasons []string
	for _, m := range sent.to(player) {
		if m.Action != string(constants.ActionInteract) {
			continue
		}
		if reason, ok := m.Payload["reason"].(string); ok && m.Payload["success"] == false {
			reasons = append(reasons, reason)
		}
	}
	return reasons
}

// A guarded chest is refused, server-side, while any guard stands, wherever it
// stands: in the room, or chased out of it. Once every guard lies dead, its
// corpse still there or gone, it opens and rolls as any chest does. A chest
// that waits on nobody opens with no refusal. A refused reach starts no timed
// open; an allowed one opens through it. FS-KE075 §J R58–R60; FS-MQYEX
// §Requirements 3, L6.
func TestGuardedChest_OpensOnlyOnceEveryGuardIsDown(t *testing.T) {
	tests := []struct {
		name   string
		guards int
		// fell takes the guards down before the delver reaches for the chest
		fell  func(t *testing.T, s *Session, guards []*ecs.Entity)
		opens bool
	}{
		{"a guard standing beside it", 1, func(*testing.T, *Session, []*ecs.Entity) {}, false},
		{"a guard that chased out of the room, far away and alive", 1, func(t *testing.T, s *Session, g []*ecs.Entity) {
			at := transformOf(t, g[0])
			at.X, at.Y = 4000, 3000
		}, false},
		{"one of two guards dead, the other alive", 2, func(t *testing.T, s *Session, g []*ecs.Entity) {
			layDead(t, g[0])
		}, false},
		{"a guard at 0 health not yet laid down", 1, func(t *testing.T, s *Session, g []*ecs.Entity) {
			hc, _ := g[0].GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).CurrentHealth = 0
		}, true},
		{"every guard lying dead", 2, func(t *testing.T, s *Session, g []*ecs.Entity) {
			layDead(t, g[0])
			layDead(t, g[1])
		}, true},
		{"every guard's corpse gone from the world", 2, func(t *testing.T, s *Session, g []*ecs.Entity) {
			s.EntityManager.RemoveEntity(g[0].ID)
			s.EntityManager.RemoveEntity(g[1].ID)
		}, true},
		{"a chest that waits on nobody, a monster beside it", 0, func(t *testing.T, s *Session, _ []*ecs.Entity) {
			CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: 560, Y: 500})
		}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, player, chest, guards, sent := guardedChest(t, tt.guards)
			tt.fell(t, s, guards)

			err := openThrough(t, s, player, chest.ID)

			if tt.opens {
				require.NoError(t, err)
				assert.True(t, openable(t, chest).IsOpen)
				assert.True(t, openable(t, chest).HasBeenOpened)
				assert.NotEmpty(t, chestHolds(t, chest), "it rolls as any chest does")
				assert.Empty(t, refusalsTo(sent, player))
				return
			}
			require.ErrorIs(t, err, ErrContainerGuarded)
			assert.Nil(t, timedOpenOf(delverEntity(t, s, player)), "a refusal starts no timed open")
			assert.False(t, openable(t, chest).IsOpen, "it stays shut")
			assert.False(t, openable(t, chest).HasBeenOpened, "nothing is rolled")
			assert.Empty(t, chestHolds(t, chest))
			assert.Zero(t, itemCount(s), "no item is made")
			assert.Equal(t, []string{RefusalContainerGuarded}, refusalsTo(sent, player), "the delver is told, by reason")
		})
	}
}

// A refusal holds nothing: once the last guard falls, by any member's hand, the
// very next reach opens the chest through its timed open, with no wait on a
// cooldown or an event.
// Out of reach it is still refused for the distance, not for its guards.
// FS-KE075 §J R59, §Edge States "A guard dies while a delver reaches".
func TestGuardedChest_TheNextReachAfterTheLastGuardFallsOpensIt(t *testing.T) {
	s, player, chest, guards, sent := guardedChest(t, 1)

	require.ErrorIs(t, s.handleInteract(player, chest.ID), ErrContainerGuarded)
	require.ErrorIs(t, s.handleInteract(player, chest.ID), ErrContainerGuarded, "a refusal leaves the chest free to try again")

	layDead(t, guards[0])
	require.NoError(t, openThrough(t, s, player, chest.ID))
	assert.True(t, openable(t, chest).IsOpen)
	assert.Equal(t, []string{RefusalContainerGuarded, RefusalContainerGuarded}, refusalsTo(sent, player))

	t.Run("out of reach is refused for the distance", func(t *testing.T) {
		s, player, chest, _, sent := guardedChest(t, 1)
		at := transformOf(t, chest)
		at.X += constants.DefaultInteractableRange * 2

		require.ErrorIs(t, s.handleInteract(player, chest.ID), ErrOutOfRange)
		assert.Empty(t, refusalsTo(sent, player))
		assert.Nil(t, timedOpenOf(delverEntity(t, s, player)), "out of reach starts no timed open")
	})
}

// Guarded chests follow the dungeon up the Spire: on every floor of the climb a
// chest in a guarded room waits on the guards its own room spawned, and a delver
// beside one is refused. FS-M8CSE §C Requirement 14.
func TestGuardedChests_EveryFloorOfTheClimb(t *testing.T) {
	guarded := 0
	for seed := uint64(1); seed <= 30; seed++ {
		s, ids := dungeonRun(t, seed, 4, 0)
		s.sender = &recordingSender{}

		for depth := 2; depth <= testSpireHeight; depth++ {
			require.NoError(t, s.regenerateFloor())
			g, _ := assertChestsWaitOnTheirRoomsGuards(t, s, seed)
			guarded += g

			for _, c := range containers(s) {
				if _, ok := guardsOf(c); !ok {
					continue
				}
				*transformOf(t, delverEntity(t, s, ids[0])) = *transformOf(t, c)
				require.ErrorIs(t, s.handleInteract(ids[0], c.ID), ErrContainerGuarded, "seed %d floor %d", seed, depth)
				break
			}
		}
	}
	require.NotZero(t, guarded, "the climbs hold guarded chests to check")
}

// A floor of buildings left by a failed generation has no guarded rooms, so
// nothing on it waits on anyone. FS-M8CSE §Edge States.
func TestGuardedChests_NoneOnAFallbackFloor(t *testing.T) {
	s, _ := dungeonRun(t, 5, 2, 0)
	failGeneration(s)

	require.NoError(t, s.regenerateFloor())

	require.Nil(t, s.dungeon)
	found := containers(s)
	require.NotEmpty(t, found)
	for _, c := range found {
		_, ok := guardsOf(c)
		assert.False(t, ok, "no container waits on a guard")
	}
}

// Across the climb, only a chest in a treasure room whose guards were placed
// rolls as a guarded treasure chest. A chest in a hall waits on its pack just
// the same but rolls as a chest, and a sack and an unguarded chest roll as
// themselves. The stored kind never changes. FS-M8CSE §G R35; FS-KE075 §J.
func TestGuardChests_OnlyATreasureRoomChestWithGuardsRollsAsOne(t *testing.T) {
	treasure, hall := 0, 0
	for seed := uint64(1); seed <= 60; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		for depth := 1; depth <= testSpireHeight; depth++ {
			if depth > 1 {
				require.NoError(t, s.regenerateFloor())
			}
			d := s.dungeon
			require.NotNil(t, d)
			for _, c := range containers(s) {
				at := transformOf(t, c)
				room := roomOf(d, at.X, at.Y)
				_, guarded := guardsOf(c)
				stored := kindOf(t, c)
				require.NotEqual(t, containerKindGuardedTreasure, stored, "the stored kind is never the roll-only one")

				switch {
				case guarded && slices.Contains(d.layout.Roles.Treasure, room):
					treasure++
					assert.Equal(t, containerKindGuardedTreasure, containerKindOf(c), "seed %d room %d", seed, room)
					assert.Equal(t, components.ContainerKindChest, stored)
				case guarded:
					hall++
					assert.True(t, eligibleHall(d, room), "seed %d room %d", seed, room)
					assert.Equal(t, components.ContainerKindChest, containerKindOf(c), "seed %d room %d: a hall chest rolls as a chest", seed, room)
				default:
					assert.Equal(t, stored, containerKindOf(c), "seed %d room %d: an unguarded container rolls as itself", seed, room)
				}
			}
		}
	}
	require.NotZero(t, treasure, "the builds hold guarded treasure chests")
	require.NotZero(t, hall, "the builds hold guarded hall chests")
}

// A treasure-room chest whose guards all failed to place waits on nobody and is
// an ordinary chest. FS-M8CSE §G R35.
func TestGuardChests_ATreasureRoomWhoseGuardsFailedIsOrdinary(t *testing.T) {
	checked := 0
	for seed := uint64(1); seed <= 40; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		require.NotNil(t, d)

		var inTreasure []*ecs.Entity
		for _, c := range containers(s) {
			at := transformOf(t, c)
			if slices.Contains(d.layout.Roles.Treasure, roomOf(d, at.X, at.Y)) && kindOf(t, c) == components.ContainerKindChest {
				c.RemoveComponent(ecs.ComponentTypeGuarded)
				inTreasure = append(inTreasure, c)
			}
		}

		// some other room placed its guards; these rooms placed none
		guards := map[int][]uuid.UUID{d.layout.Roles.Start: {uuid.New()}}
		for _, room := range d.layout.Roles.Treasure {
			guards[room] = nil
		}
		s.guardChests(d, guards)

		for _, c := range inTreasure {
			checked++
			_, guarded := guardsOf(c)
			assert.False(t, guarded)
			assert.Equal(t, components.ContainerKindChest, containerKindOf(c), "seed %d", seed)
		}
	}
	require.NotZero(t, checked, "the builds hold treasure-room chests")
}

// The chest's standing is where it was placed: whether its guards still stand,
// lie dead or are gone from the world, it rolls as the same kind. FS-M8CSE §G R35.
func TestContainerKindOf_GuardsFateDoesNotChangeIt(t *testing.T) {
	s, _, chest, guards, _ := guardedChest(t, 2)
	gc, ok := chest.GetComponent(ecs.ComponentTypeGuarded)
	require.True(t, ok)
	gc.(*components.GuardedComponent).TreasureRoom = true

	assert.Equal(t, containerKindGuardedTreasure, containerKindOf(chest), "guards standing")

	layDead(t, guards[0])
	layDead(t, guards[1])
	assert.Equal(t, containerKindGuardedTreasure, containerKindOf(chest), "guards dead")

	s.EntityManager.RemoveEntity(guards[0].ID)
	s.EntityManager.RemoveEntity(guards[1].ID)
	assert.Equal(t, containerKindGuardedTreasure, containerKindOf(chest), "guards gone from the world")
}

// A marked chest is still "chest" on the wire: the roll-only kind reaches no
// serialized frame, on any container of a built floor. FS-M8CSE §G R35.
func TestGuardedTreasureChest_WireKindIsUnchanged(t *testing.T) {
	marked := 0
	for seed := uint64(1); seed <= 20; seed++ {
		s, _ := dungeonRun(t, seed, 1, 0)
		for _, c := range containers(s) {
			if containerKindOf(c) == containerKindGuardedTreasure {
				marked++
			}
		}

		state, err := serializer.NewStateSerializer(s.EntityManager, nil).SerializeBackendState(context.Background(), s.ID, types.WorldTypeRun, s.EntityManager.GetAllEntities())
		require.NoError(t, err)
		require.NotEmpty(t, state.Containers)
		for _, c := range state.Containers {
			assert.Contains(t, []string{string(components.ContainerKindChest), string(components.ContainerKindSack)}, c.Kind, "seed %d", seed)
		}
		raw, err := json.Marshal(state.Containers)
		require.NoError(t, err)
		assert.NotContains(t, string(raw), string(containerKindGuardedTreasure))
	}
	require.NotZero(t, marked, "the builds hold marked chests")
}

// Opened for real on floor 6 with its guards down, a guarded treasure chest
// holds a chest's count and stays a chest: its stored kind, and its guards'
// list, are as the build left them. FS-M8CSE §G R35.
func TestGuardedTreasureChest_OpensAsAChestOnFloorSix(t *testing.T) {
	s, player, chest, guards, _ := guardedChest(t, 1)
	gc, _ := chest.GetComponent(ecs.ComponentTypeGuarded)
	gc.(*components.GuardedComponent).TreasureRoom = true
	floor := s.EntityManager.CreateEntity()
	floor.AddComponent(components.NewFloorComponent(6, 10))
	layDead(t, guards[0])

	require.NoError(t, openThrough(t, s, player, chest.ID))

	held := chestHolds(t, chest)
	assert.GreaterOrEqual(t, len(held), ChestMinItems)
	assert.LessOrEqual(t, len(held), ChestMaxItems)
	assert.Equal(t, components.ContainerKindChest, kindOf(t, chest))
}
