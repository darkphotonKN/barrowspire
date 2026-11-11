package game

import (
	"fmt"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
)

/**
* Timed container opening (FS-MQYEX, owner, playtest 2026-11-11): in a run a
* shut chest or sack no longer opens on the reach. The reach starts the
* delver's timed open, the tick counts it, and when its time has passed the
* container opens exactly as an open always has. A drop pile, an open
* container, and every container in the hub and the fields open as before.
**/

// TimedOpenDuration is the seconds of simulation time a run's shut chest or
// sack takes to open. FS-MQYEX's named tunable (D15).
const TimedOpenDuration = 1.5

/**
* openContainer opens the container, the one way a container opens: it shows
* open and never closes, and on its first open its contents are rolled once
* for its kind (FS-3QHQZ §Requirements 19, FS-1D6BX §Requirements 4). An empty
* roll still leaves it opened.
**/
func (s *Session) openContainer(container *ecs.Entity, openable *components.OpenableComponent) error {
	// only open, never close (chest stays open once opened)
	openable.IsOpen = true

	if openable.HasBeenOpened {
		return nil
	}
	openable.HasBeenOpened = true

	// create items on first open by using seeded itemPool: RANDOM items on
	// the spot, the Spire's roll for the container's kind, or a field's
	// derived from it
	itemIDs, err := s.rollChest(containerKindOf(container))
	if err != nil {
		return fmt.Errorf("failed to generate container items: %w", err)
	}

	itemIDsComponent, hasItemIDs := container.GetComponent(ecs.ComponentTypeItemIDList)
	if !hasItemIDs {
		slog.Error("Failed to retrieve container entity itemIDs component", "targetEntityID", container.ID)
		return fmt.Errorf("Error when attempting to retrieve container entity itemIDs component with entityID %s", container.ID)
	}

	// relate the container with the newly generated items
	itemIDsComponent.(*components.ItemIDListComponent).ItemIDs = itemIDs
	return nil
}

/**
* advanceTimedOpens is a run's timed opens on its tick, after the tick's
* movement and combat: one its delver moved, was hit or left reach of is
* cancelled, the rest count the tick, and one whose time has passed opens its
* container (FS-MQYEX §Requirements 4–10). Nothing is sent, for a cancel
* either: the next state shows the container open, or no timed open.
**/
func (s *Session) advanceTimedOpens(deltaTime float64, entities []*ecs.Entity) {
	for _, done := range systems.NewTimedOpenSystem(s.EntityManager).Update(deltaTime, entities) {
		container, ok := s.EntityManager.GetEntity(done.ContainerID)
		if !ok {
			continue
		}
		oc, ok := container.GetComponent(ecs.ComponentTypeOpenable)
		if !ok {
			continue
		}
		if err := s.openContainer(container, oc.(*components.OpenableComponent)); err != nil {
			slog.Error("Failed to open a container at the end of its timed open",
				"container_entity_id", done.ContainerID,
				"delver_entity_id", done.DelverEntityID,
				"error", err)
		}
	}
}
