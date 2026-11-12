package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-JS7C8 §E R47: no facing goes up. A `face` is an action the hub does not
// know, refused as any unknown one is, whether its sender is in a world or
// not, and never routed to a world. The hub refuses before it looks a world
// up, so the town, a field and a run are alike here. I-JS7C8-10.

func TestHubRun_Face_RefusedAsAnUnknownAction(t *testing.T) {
	for _, tc := range []struct {
		name    string
		inWorld bool
	}{
		{"a player in a world", true},
		{"a player in no world", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
			player := &types.Player{ID: uuid.New(), Username: "Wren"}
			var world chan types.ClientPackage
			if tc.inWorld {
				worldID := uuid.New()
				world = registerRoutableSession(server, worldID).MessageCh
				player.CurrentGameSessionId = worldID
			}
			conn := &websocket.Conn{}
			registerTestConn(server, conn, player)
			inbox := startSoloListen(t, server, conn)

			server.serverChan <- types.ClientPackage{Conn: conn, Message: types.Message{
				Action:  "face",
				Payload: map[string]interface{}{"player_id": player.ID.String(), "facing": "nw"},
			}}

			reply, answered := inbox.await("face")
			require.True(t, answered, "the face is answered with a refusal")
			require.NotNil(t, reply.Error)
			assert.Equal(t, "Unknown action", *reply.Error)
			if world != nil {
				select {
				case routed := <-world:
					t.Fatalf("a face reached the world: %+v", routed.Message)
				case <-time.After(100 * time.Millisecond):
				}
			}
		})
	}
}
