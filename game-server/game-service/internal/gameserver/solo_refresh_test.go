package gameserver

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A refresh mid-run is a drop within the grace and a reconnect: the member is
// announced the run they are in, not the hub. A run of one must behave as a
// run of two here; nobody else keeps it alive. FS-NSV3D §Edge States "The run".
func TestSoloRun_RefreshReturnsToTheRun(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	wren, conn := enterHub(t, server, "Wren")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren}})
	t.Cleanup(run.Shutdown)
	require.True(t, run.HasPlayer(wren.ID))

	// the page unloads: the socket drops, the record is held for the grace
	_, hold, held := server.holdForReconnect(conn)
	require.True(t, held)
	_ = hold

	// the page comes back: a new socket for the same member
	player, isReconnection := server.connectPlayer(wren.ID, "Wren", "token-2")
	require.True(t, isReconnection, "a member on record is reconnecting, not arriving fresh")
	assert.Equal(t, run.ID, player.CurrentGameSessionId, "the record still names the run")

	msgChan := make(chan interface{}, 8)
	server.announceCurrentWorld(msgChan, &player)
	newConn := &websocket.Conn{}
	_, mapped := server.MapConnToPlayer(newConn, player.ID, msgChan)
	require.True(t, mapped)
	close(msgChan)

	var worldEntered *types.Message
	for raw := range msgChan {
		if msg, ok := raw.(types.Message); ok && msg.Action == string(constants.ActionWorldEntered) {
			worldEntered = &msg
		}
	}
	require.NotNil(t, worldEntered, "a reconnecting delver is told which world they are in")
	assert.Equal(t, string(types.WorldTypeRun), worldEntered.Payload["world_type"])
	assert.Equal(t, run.ID.String(), worldEntered.Payload["session_id"])
	assert.True(t, run.HasPlayer(wren.ID), "their body is still in the run")
	_, stillThere := server.GetGameSession(run.ID)
	assert.True(t, stillThere, "the run did not end on the drop")
}
