package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-29KSH §Change: The acting player is the connection's, R37–R39; ADR-0079.
// At the world's seam: the world acts for, and answers, the player the message
// hub stamped on the package, never a player_id in the payload.

func bodyVelocity(t *testing.T, e *ecs.Entity) *components.VelocityComponent {
	t.Helper()
	c, ok := e.GetComponent(ecs.ComponentTypeVelocity)
	require.True(t, ok)
	return c.(*components.VelocityComponent)
}

func TestSession_ActsForTheStampedPlayer_NeverThePayloadsPlayerID(t *testing.T) {
	s := coopRun(t)
	dispatcher := &recordingDispatcher{}
	s.sender = messaging.NewMessageSender(dispatcher)
	wren, wrenBody := placeDelver(t, s, "warrior", 300, 300)
	kaelen, kaelenBody := placeDelver(t, s, "warrior", 700, 700)

	move := clientMessage(constants.ActionMove, wren, map[string]interface{}{
		"player_id": kaelen.String(), "vx": -1.0, "vy": 0.0,
	})
	refused := clientMessage(constants.ActionInteract, wren, map[string]interface{}{
		"player_id": kaelen.String(), "entity_id": "not-an-entity",
	})

	runConcurrently(t, s, []types.ClientPackage{move, refused})

	assert.Equal(t, -1.0, bodyVelocity(t, wrenBody).VX, "the stamped player moves")
	assert.Zero(t, bodyVelocity(t, kaelenBody).VX, "the player the payload named does not")
	require.Len(t, dispatcher.framesTo(wren), 1, "the refusal answers the stamped player")
	assert.Equal(t, string(constants.ActionInteract), dispatcher.framesTo(wren)[0].Action)
	assert.Empty(t, dispatcher.framesTo(kaelen), "the player the payload named is told nothing")
}

// A package nobody stamped is never acted on, even when its payload names a
// player: a world has no other way to know who sent it.
func TestSession_UnstampedMessage_IsDropped(t *testing.T) {
	s := coopRun(t)
	s.sender = messaging.NewMessageSender(&recordingDispatcher{})
	wren, wrenBody := placeDelver(t, s, "warrior", 300, 300)

	unstamped := clientMessage(constants.ActionMove, uuid.Nil, map[string]interface{}{
		"player_id": wren.String(), "vx": -1.0, "vy": 0.0,
	})

	runConcurrently(t, s, []types.ClientPackage{unstamped})

	assert.Zero(t, bodyVelocity(t, wrenBody).VX)
}
