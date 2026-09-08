package gameserver

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newRoutingTestHub wires a hub over a real Server, which is the SessionManager.
func newRoutingTestHub(t *testing.T) (*messageHub, *Server) {
	t.Helper()

	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})
	hub := NewMessageHub(server, messaging.NewMessageSender(server))

	return hub, server
}

// registerSession puts a session in the server's map without building a world.
// Routing only has to resolve which session a message belongs to.
func registerSession(s *Server, id uuid.UUID) *game.Session {
	session := &game.Session{ID: id}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[id] = session

	return session
}

// The server knows which world a player is in; it must never take the client's
// word for it. FS-0008 §Requirements 16.
func TestResolveGameSession_UsesServerHeldState(t *testing.T) {
	t.Run("resolves the session the player is recorded in", func(t *testing.T) {
		hub, server := newRoutingTestHub(t)

		sessionID := uuid.New()
		want := registerSession(server, sessionID)

		conn := &websocket.Conn{}
		player := &types.Player{ID: uuid.New(), Username: "Delver", CurrentGameSessionId: sessionID}
		registerTestConn(server, conn, player)

		got, err := hub.resolveGameSession(conn)

		require.NoError(t, err)
		assert.Same(t, want, got)
	})

	t.Run("rejects a connection with no registered player", func(t *testing.T) {
		hub, _ := newRoutingTestHub(t)

		got, err := hub.resolveGameSession(&websocket.Conn{})

		assert.Nil(t, got)
		assert.ErrorIs(t, err, errPlayerNotFound)
	})

	t.Run("rejects a player who is in no world", func(t *testing.T) {
		hub, server := newRoutingTestHub(t)

		conn := &websocket.Conn{}
		player := &types.Player{ID: uuid.New(), Username: "Delver", CurrentGameSessionId: uuid.Nil}
		registerTestConn(server, conn, player)

		got, err := hub.resolveGameSession(conn)

		assert.Nil(t, got)
		assert.ErrorIs(t, err, errPlayerNotInSession)
	})

	t.Run("rejects a player pointing at a session that is gone", func(t *testing.T) {
		hub, server := newRoutingTestHub(t)

		conn := &websocket.Conn{}
		player := &types.Player{ID: uuid.New(), Username: "Delver", CurrentGameSessionId: uuid.New()}
		registerTestConn(server, conn, player)

		got, err := hub.resolveGameSession(conn)

		assert.Nil(t, got)
		assert.ErrorIs(t, err, errSessionNotFound)
	})
}

// The headline guarantee, driven through the live hub loop rather than asserted
// off the method in isolation: a crafted payload naming someone else's world is
// delivered to the sender's own. FS-0008 §Requirements 16.
func TestHubRun_ForeignSessionIDInPayload_RoutesToOwnSession(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})

	ownID, foreignID := uuid.New(), uuid.New()
	own := registerRoutableSession(server, ownID)
	foreign := registerRoutableSession(server, foreignID)

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Delver", CurrentGameSessionId: ownID}
	registerTestConn(server, conn, player)

	// NewServer already started the hub over this channel.
	server.serverChan <- types.ClientPackage{
		Conn: conn,
		Message: types.Message{
			Action: string(constants.ActionMove),
			Payload: map[string]interface{}{
				"player_id":  player.ID.String(),
				"session_id": foreignID.String(), // a world this player is not in
				"vx":         1.0,
				"vy":         0.0,
			},
		},
	}

	select {
	case delivered := <-own.MessageCh:
		assert.Equal(t, string(constants.ActionMove), delivered.Message.Action)
	case <-foreign.MessageCh:
		t.Fatal("message reached the world named in the payload; the client set its own route")
	case <-time.After(2 * time.Second):
		t.Fatal("message was never routed")
	}
}

// registerRoutableSession is registerSession plus a live MessageCh, so the hub
// can actually deliver into it.
func registerRoutableSession(s *Server, id uuid.UUID) *game.Session {
	session := &game.Session{
		ID:        id,
		MessageCh: make(chan types.ClientPackage, 10),
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[id] = session

	return session
}
