package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
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
		d := s.dungeon
		require.NotNil(t, d, "seed %d: floor 1 is a dungeon floor", seed)

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
	}
	require.NotZero(t, guarded, "the builds hold guarded chests to check")
	t.Logf("guarded chests %d, sacks in halls %d", guarded, sacksInHalls)
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
		chest.AddComponent(components.NewGuardedComponent(ids))
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
// that waits on nobody opens at once. FS-KE075 §J R58–R60.
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

			err := s.handleInteract(player, chest.ID)

			if tt.opens {
				require.NoError(t, err)
				assert.True(t, openable(t, chest).IsOpen)
				assert.True(t, openable(t, chest).HasBeenOpened)
				assert.NotEmpty(t, chestHolds(t, chest), "it rolls as any chest does")
				assert.Empty(t, refusalsTo(sent, player))
				return
			}
			require.ErrorIs(t, err, ErrContainerGuarded)
			assert.False(t, openable(t, chest).IsOpen, "it stays shut")
			assert.False(t, openable(t, chest).HasBeenOpened, "nothing is rolled")
			assert.Empty(t, chestHolds(t, chest))
			assert.Zero(t, itemCount(s), "no item is made")
			assert.Equal(t, []string{RefusalContainerGuarded}, refusalsTo(sent, player), "the delver is told, by reason")
		})
	}
}

// A refusal holds nothing: once the last guard falls, by any member's hand, the
// very next reach opens the chest, with no wait on a cooldown or an event.
// Out of reach it is still refused for the distance, not for its guards.
// FS-KE075 §J R59, §Edge States "A guard dies while a delver reaches".
func TestGuardedChest_TheNextReachAfterTheLastGuardFallsOpensIt(t *testing.T) {
	s, player, chest, guards, sent := guardedChest(t, 1)

	require.ErrorIs(t, s.handleInteract(player, chest.ID), ErrContainerGuarded)
	require.ErrorIs(t, s.handleInteract(player, chest.ID), ErrContainerGuarded, "a refusal leaves the chest free to try again")

	layDead(t, guards[0])
	require.NoError(t, s.handleInteract(player, chest.ID))
	assert.True(t, openable(t, chest).IsOpen)
	assert.Equal(t, []string{RefusalContainerGuarded, RefusalContainerGuarded}, refusalsTo(sent, player))

	t.Run("out of reach is refused for the distance", func(t *testing.T) {
		s, player, chest, _, sent := guardedChest(t, 1)
		at := transformOf(t, chest)
		at.X += constants.DefaultInteractableRange * 2

		require.ErrorIs(t, s.handleInteract(player, chest.ID), ErrOutOfRange)
		assert.Empty(t, refusalsTo(sent, player))
	})
}

// Floors 2 and 3 are built as before: no container on them waits on anyone,
// and a chest there opens with a monster standing beside it. FS-KE075 §J R57.
func TestGuardedChests_Floors2And3Unchanged(t *testing.T) {
	s, _ := dungeonRun(t, 5, 2, 0)
	require.NotNil(t, s.dungeon)

	for depth := 2; depth <= constants.RunFloorCount; depth++ {
		require.NoError(t, s.regenerateFloor())
		require.Nil(t, s.dungeon, "floor %d is a floor of buildings", depth)
		found := containers(s)
		require.NotEmpty(t, found, "floor %d has containers", depth)
		for _, c := range found {
			_, ok := guardsOf(c)
			assert.False(t, ok, "floor %d: no container waits on a guard", depth)
		}
	}
}
