package gameserver

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// awaitAction drains a test connection's channel until the named action arrives.
func awaitAction(t *testing.T, msgCh chan interface{}, action constants.Action) types.Message {
	t.Helper()

	timeout := time.After(2 * time.Second)
	for {
		select {
		case raw := <-msgCh:
			msg, ok := raw.(types.Message)
			if ok && msg.Action == string(action) {
				return msg
			}
		case <-timeout:
			t.Fatalf("never received %q", action)
		}
	}
}

// Connecting is not entering. A player picks a character first, and only then
// asks to enter the hub. FS-0008 §Requirements 15, 19.
func TestEnterHub_PlacesThePlayerAndTellsThem(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, exists := server.HubSession()
	require.True(t, exists)

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Delver", Class: "mage"}
	msgCh := registerTestConn(server, conn, player)

	require.Equal(t, uuid.Nil, player.CurrentGameSessionId,
		"a connected player who has not entered is in no world")

	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: string(constants.ActionEnterHub)},
	}

	msg := awaitAction(t, msgCh, constants.ActionWorldEntered)

	t.Run("the message names the hub", func(t *testing.T) {
		assert.Equal(t, string(types.WorldTypeHub), msg.Payload["world_type"])
		assert.Equal(t, hub.ID.String(), msg.Payload["session_id"])
	})

	t.Run("the player is now routable to the hub", func(t *testing.T) {
		stored, ok := server.GetPlayerFromConn(conn)
		require.True(t, ok)
		assert.Equal(t, hub.ID, stored.CurrentGameSessionId)
	})

	t.Run("and has an entity in the hub world", func(t *testing.T) {
		assert.True(t, hub.HasPlayer(player.ID))
	})
}
