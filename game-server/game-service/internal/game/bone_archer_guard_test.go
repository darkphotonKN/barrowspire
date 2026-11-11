package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// hallChestWithArcher is a floor-1 chest standing in a hall whose pack holds a
// Bone Archer, with that archer, from the first seed that builds one.
func hallChestWithArcher(t *testing.T) (s *Session, player uuid.UUID, chest, archer *ecs.Entity, seed uint64) {
	t.Helper()
	for seed = 1; seed <= 200; seed++ {
		run, ids := dungeonRun(t, seed, 1, 0)
		d := run.dungeon
		for _, c := range containers(run) {
			at := transformOf(t, c)
			room := roomOf(d, at.X, at.Y)
			if !eligibleHall(d, room) || kindOf(t, c) != components.ContainerKindChest {
				continue
			}
			for _, m := range monstersIn(run) {
				mat := transformOf(t, m)
				if monsterOf(m).Archetype == components.MonsterArchetypeBoneArcher && roomOf(d, mat.X, mat.Y) == room {
					return run, ids[0], c, m, seed
				}
			}
		}
	}
	require.FailNow(t, "no seed builds a hall chest beside a Bone Archer")
	return nil, uuid.Nil, nil, nil, 0
}

// A hall's Bone Archer is one of its chest's guards: the chest refuses with
// container_guarded while only the archer stands, and opens once it is dead.
// FS-B4SG9 §B R18; FS-KE075 §J R57–R60.
func TestHallChest_WaitsOnTheHallsBoneArcher(t *testing.T) {
	s, player, chest, archer, seed := hallChestWithArcher(t)
	sent := &recordingSender{}
	s.sender = sent

	guards, ok := guardsOf(chest)
	require.True(t, ok, "seed %d: the hall's chest waits on its pack", seed)
	assert.Contains(t, guards, archer.ID, "seed %d: the archer is one of its guards", seed)
	for _, id := range guards {
		if id == archer.ID {
			continue
		}
		guard, ok := s.EntityManager.GetEntity(id)
		require.True(t, ok)
		layDead(t, guard)
	}
	*transformOf(t, delverEntity(t, s, player)) = *transformOf(t, chest)

	require.ErrorIs(t, s.handleInteract(player, chest.ID), ErrContainerGuarded, "seed %d: only the archer stands", seed)
	assert.False(t, openable(t, chest).IsOpen)
	assert.Equal(t, []string{RefusalContainerGuarded}, refusalsTo(sent, player))

	layDead(t, archer)
	require.NoError(t, s.handleInteract(player, chest.ID), "seed %d: every guard is down", seed)
	assert.True(t, openable(t, chest).IsOpen)
}
