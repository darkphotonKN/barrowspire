package game

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
	Container kinds: a chest spawn point holds a chest, or a sack at SackShare,
	and each placed kind rolls its own odds on its first open through one roll
	shape: the kind's empty chance, then a count in its range, split by item type
	as the chest roll splits (FS-1D6BX §Requirements 3–6, D1). Past its roll a
	sack is a chest in every respect.
*/

// containerRollFor is the kind's roll; a kind without one rolls as a chest
// (FS-1D6BX D2).
func containerRollFor(kind components.ContainerKind) ContainerRoll {
	if roll, ok := ContainerRolls[kind]; ok {
		return roll
	}
	return ContainerRolls[components.ContainerKindChest]
}

// spawnedContainerKind is what one chest spawn point holds: one draw against
// SackShare, a sack on a hit, else a chest (FS-1D6BX §Requirements 3).
func spawnedContainerKind(r lootRand) components.ContainerKind {
	if r.Float64() < SackShare {
		return components.ContainerKindSack
	}
	return components.ContainerKindChest
}

// containerKindOf is the container's kind, a chest when it names none.
func containerKindOf(container *ecs.Entity) components.ContainerKind {
	if cc, ok := container.GetComponent(ecs.ComponentTypeContainer); ok {
		if c, ok := cc.(*components.ContainerComponent); ok && c.Kind != "" {
			return c.Kind
		}
	}
	return components.ContainerKindChest
}

/**
* rollContainer is a placed container's roll for the drop given, by its kind:
* the kind's empty chance hit is an empty list, else the chest roll at the
* kind's count range. A kind that never rolls empty draws nothing for it, so a
* chest draws exactly as it always has.
*
* Draws, in order: the empty roll, from r, when the kind can roll empty. r must
* be set for any kind that can roll empty (a sack): a Session built as a literal
* has no chestRand, and a sack roll on it would panic.
**/
func (s *Session) rollContainer(r lootRand, kind components.ContainerKind, drop lootDrop) ([]uuid.UUID, error) {
	roll := containerRollFor(kind)
	if roll.EmptyChance > 0 && r.Float64() < roll.EmptyChance {
		return []uuid.UUID{}, nil
	}
	return s.generateItemsAt(drop, roll.MinItems, roll.MaxItems)
}
