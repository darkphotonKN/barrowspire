package gameserver

import (
	"context"
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
// standing in the hub into the run scene. FS-29KSH §Requirements 15.
func TestReconnect_AnnouncesTheWorldTheyAreActuallyIn(t *testing.T) {
	server := NewServer(context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Wren"})
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

// Leaving the hub is final. There is nothing to resume: the member is out of
// the world and off record, and walks back in from the menu like anyone
// arriving. FS-29KSH §Edge States (Disconnect).
func TestDisconnect_LeavingTheHubIsFinal(t *testing.T) {
	server := NewServer(context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	hub, _ := server.HubSession()

	conn, _ := wsPair(t)
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "archer", Name: "Wren"})
	require.NoError(t, err)

	server.cleanUpClient(conn)

	assert.False(t, hub.HasPlayer(player.ID), "they are out of the world")
	_, onRecord := server.PlayerByID(player.ID)
	assert.False(t, onRecord, "and off record, so nothing tries to resume them into a world they left")
	_, mapped := server.GetPlayerFromConn(conn)
	assert.False(t, mapped, "and routing no longer knows the connection")
}
