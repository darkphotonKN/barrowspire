package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A page refresh is a reconnection, and it must put the player back where they
// actually were. Telling every returning player they found a game sent anyone
// standing in the hub into the run scene. FS-0008 §Requirements 15.
func TestReconnect_AnnouncesTheWorldTheyAreActuallyIn(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	_, err := server.JoinHub(conn, types.Character{Class: "mage", Name: "Wren"})
	require.NoError(t, err)

	msgChan := make(chan interface{}, 8)
	server.announceCurrentWorld(msgChan, player)
	close(msgChan)

	var worldEntered *types.Message
	for raw := range msgChan {
		msg, ok := raw.(types.Message)
		if ok && msg.Action == string(constants.ActionWorldEntered) {
			worldEntered = &msg
		}
		if ok && msg.Action == "game_found" {
			t.Fatal("a player in the hub was told they found a game")
		}
	}

	require.NotNil(t, worldEntered, "a reconnecting player must be told which world they are in")
	assert.Equal(t, string(types.WorldTypeHub), worldEntered.Payload["world_type"])
	assert.Equal(t, hub.ID.String(), worldEntered.Payload["session_id"])
}
