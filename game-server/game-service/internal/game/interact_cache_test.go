package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// farX, farY is a spot well out of interact range of anything placed at (500, 500).
const farX, farY = 500 + constants.DefaultInteractableRange*3, 500.0

// targetReserved reports whether the target is still held in the interaction cache.
func targetReserved(s *Session, targetID uuid.UUID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, held := s.containerInteractedCache[targetID]
	return held
}

// A refused interaction never keeps the target reserved: a click out of range
// must not lock a door, chest or switch for every delver for the rest of the run.
func TestHandleInteract_RefusedForRange_DoesNotLockTheTarget(t *testing.T) {
	cases := map[string]func(s *Session) uuid.UUID{
		"door":      func(s *Session) uuid.UUID { return s.AddDoor(490, 490, 20, 20) },
		"container": func(s *Session) uuid.UUID {
			// already looted once, so the open draws nothing from the item pool
			chestID := s.AddContainer(500, 500, components.ContainerKindChest)
			chest, _ := s.EntityManager.GetEntity(chestID)
			oc, _ := chest.GetComponent(ecs.ComponentTypeOpenable)
			oc.(*components.OpenableComponent).HasBeenOpened = true
			return chestID
		},
		"switch": func(s *Session) uuid.UUID {
			s.exitDoorEntityID = s.AddEscape(900, 900)
			return CreateSwitchEntity(s.EntityManager, SwitchConfig{X: 500, Y: 500}).ID
		},
	}

	for name, place := range cases {
		t.Run(name, func(t *testing.T) {
			s, _ := equipRun(t, nil)
			targetID := place(s)
			far, _ := placeDelver(t, s, "warrior", farX, farY)
			near, _ := placeDelver(t, s, "mage", 500, 510)

			require.ErrorIs(t, s.handleInteract(far, targetID), ErrOutOfRange)
			assert.False(t, targetReserved(s, targetID), "a refused interaction releases the target")

			require.NoError(t, s.handleInteract(near, targetID), "another delver in reach can still use it")
		})
	}
}

// The same delver who clicked from too far can walk up and use the door.
func TestHandleInteract_RefusedForRange_SameDelverCanRetryInReach(t *testing.T) {
	s, _ := equipRun(t, nil)
	doorID := s.AddDoor(490, 490, 20, 20)
	playerID, delver := placeDelver(t, s, "warrior", farX, farY)

	require.ErrorIs(t, s.handleInteract(playerID, doorID), ErrOutOfRange)

	tc, _ := delver.GetComponent(ecs.ComponentTypeTransform)
	tc.(*components.TransformComponent).X, tc.(*components.TransformComponent).Y = 500, 510

	require.NoError(t, s.handleInteract(playerID, doorID))
}

// A delver still on cooldown is refused, and the target they reached for stays
// free for everyone else.
func TestHandleInteract_RefusedForPlayerCooldown_DoesNotLockTheTarget(t *testing.T) {
	s, _ := equipRun(t, nil)
	firstDoor := s.AddDoor(490, 490, 20, 20)
	secondDoor := s.AddDoor(510, 490, 20, 20)
	hasty, _ := placeDelver(t, s, "warrior", 510, 510)
	other, _ := placeDelver(t, s, "mage", 515, 510)

	require.NoError(t, s.handleInteract(hasty, firstDoor))
	require.Error(t, s.handleInteract(hasty, secondDoor), "the delver is still on cooldown")
	assert.False(t, targetReserved(s, secondDoor), "the cooldown refusal releases the target")

	require.NoError(t, s.handleInteract(other, secondDoor))
}

// Trying the escape door before the switch is thrown must not bar the exit once
// the switch is thrown.
func TestHandleInteract_LockedEscapeDoor_DoesNotLockTheExit(t *testing.T) {
	s, _ := equipRun(t, nil)
	s.endSessionCh = make(chan bool, 1)
	escapeID := s.AddEscape(500, 500)
	s.exitDoorEntityID = escapeID
	switchID := CreateSwitchEntity(s.EntityManager, SwitchConfig{X: 500, Y: 500}).ID
	early, _ := placeDelver(t, s, "warrior", 500, 510)
	thrower, _ := placeDelver(t, s, "mage", 505, 510)

	require.Error(t, s.handleInteract(early, escapeID), "the escape door is locked")
	assert.False(t, targetReserved(s, escapeID), "a locked door refusal releases the door")

	require.NoError(t, s.handleInteract(thrower, switchID))
	require.NoError(t, s.handleInteract(early, escapeID), "the exit opens once the switch is thrown")
}

// Something that cannot be interacted with is refused and left unreserved.
func TestHandleInteract_NotInteractable_IsNotReserved(t *testing.T) {
	s, _ := equipRun(t, nil)
	rock := s.EntityManager.CreateEntity()
	rock.AddComponent(components.NewTransformComponent(500, 500))
	playerID, _ := placeDelver(t, s, "warrior", 500, 510)

	require.Error(t, s.handleInteract(playerID, rock.ID))
	assert.False(t, targetReserved(s, rock.ID))
}

// A successful interaction still holds the target briefly, so a double click
// does not toggle a door twice.
func TestHandleInteract_Success_HoldsTheTargetBriefly(t *testing.T) {
	s, _ := equipRun(t, nil)
	doorID := s.AddDoor(490, 490, 20, 20)
	first, _ := placeDelver(t, s, "warrior", 500, 510)
	second, _ := placeDelver(t, s, "mage", 505, 510)

	require.NoError(t, s.handleInteract(first, doorID))
	assert.True(t, targetReserved(s, doorID))
	require.Error(t, s.handleInteract(second, doorID), "the door is held for a moment after use")
}
