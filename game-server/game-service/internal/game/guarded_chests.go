package game

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/**
* A dungeon floor's guarded chests (FS-KE075 §J, owner, playtest 2026-11-06): a
* chest in a room that spawned guards, a treasure room's elites or a hall's
* troll pack, will not open while any of them still stands. Nothing about it
* is sent and nothing changes as a guard falls: the open asks the world, on
* the tick, whether any of the chest's guards is still in it with health left,
* so a kill and an open are never out of step.
**/

// RefusalContainerGuarded is the reason an interact refusal gives for a chest
// whose guards still stand; the client words it (FS-KE075 §J Requirement 60).
const RefusalContainerGuarded = "container_guarded"

// guardsRoom is whether a monster placed as role is one of its room's guards:
// a treasure room's elites and a hall's pack, never a rolled single, a
// corridor's monster, a top-up or the demon (FS-KE075 §J Requirement 58).
func (role spawnRole) guardsRoom() bool {
	return role == spawnTreasureGuard || role == spawnHallPack
}

/**
* guardChests sets every chest standing in a room of guards to wait on them
* (FS-KE075 §J Requirement 57). A sack is never guarded, and a room whose
* guards all failed to place has none to wait on.
**/
func (s *Session) guardChests(d *dungeonFloor, guards map[int][]uuid.UUID) {
	if len(guards) == 0 {
		return
	}
	for _, entity := range s.EntityManager.GetAllEntities() {
		if !entity.HasComponent(ecs.ComponentTypeContainer) || containerKindOf(entity) != components.ContainerKindChest {
			continue
		}
		tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		at := tc.(*components.TransformComponent)
		if ids := guards[d.roomAt(at.X, at.Y)]; len(ids) > 0 {
			entity.AddComponent(components.NewGuardedComponent(ids))
		}
	}
}

/**
* guardStands is whether any monster the container waits on still stands: in
* the world with health left, wherever it has chased to. A container that waits
* on nobody has none (FS-KE075 §J Requirements 58–59).
**/
func (s *Session) guardStands(container *ecs.Entity) bool {
	gc, ok := container.GetComponent(ecs.ComponentTypeGuarded)
	if !ok {
		return false
	}
	for _, id := range gc.(*components.GuardedComponent).Guards {
		guard, ok := s.EntityManager.GetEntity(id)
		if !ok {
			continue
		}
		if hc, ok := guard.GetComponent(ecs.ComponentTypeHealth); ok && hc.(*components.HealthComponent).CurrentHealth > 0 {
			return true
		}
	}
	return false
}
