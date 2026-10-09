package gameserver

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// settle bounds how long a disconnect may take to be handled. A server that
// freezes fails the test here instead of hanging the suite.
const settle = 3 * time.Second

// within runs fn and fails the test if it panics or has not returned by d.
// The server's own accessors block forever on a lock nobody released, so this
// is what turns a deadlock into a failure.
func within(t *testing.T, d time.Duration, what string, fn func()) {
	t.Helper()

	done := make(chan any, 1)
	go func() {
		defer func() { done <- recover() }()
		fn()
	}()

	select {
	case r := <-done:
		if r != nil {
			t.Fatalf("%s panicked: %v", what, r)
		}
	case <-time.After(d):
		t.Fatalf("%s did not return within %s: the server is frozen", what, d)
	}
}

// eventually polls cond until it holds or settle passes, each poll bounded so a
// frozen server fails rather than hangs.
func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()

	deadline := time.Now().Add(settle)
	for {
		var held bool
		within(t, settle, what, func() { held = cond() })
		if held {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("%s: not true after %s", what, settle)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// wsPair is a real websocket connection: the server's end and the client's.
func wsPair(t *testing.T) (serverSide, clientSide *websocket.Conn) {
	t.Helper()

	accepted := make(chan *websocket.Conn, 1)
	upgrader := websocket.Upgrader{}
	httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		accepted <- conn
	}))
	t.Cleanup(httpServer.Close)

	clientSide, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(httpServer.URL, "http"), nil)
	require.NoError(t, err)
	t.Cleanup(func() { clientSide.Close() })

	return <-accepted, clientSide
}

// connectionsOf counts the connections the server maps to a member, and the
// writer channels it holds across every connection.
func connectionsOf(server *Server, memberID uuid.UUID) (mapped, writers int) {
	server.mu.RLock()
	defer server.mu.RUnlock()

	for _, player := range server.connToPlayer {
		if player.ID == memberID {
			mapped++
		}
	}

	return mapped, len(server.msgChan)
}

// Leaving on purpose is a normal close. The server forgets the member and
// keeps serving everyone else.
func TestDisconnect_ANormalCloseLeavesTheServerServing(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := NewServer(context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	route := newConnectRoute(t, server, authClient)

	client := route.connect(t, "token")
	require.NoError(t, client.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, "leaving"), time.Now().Add(time.Second)))

	eventually(t, "the member is forgotten after a normal close", func() bool {
		_, onRecord := server.PlayerByID(authClient.memberID)
		return !onRecord
	})

	mapped, writers := connectionsOf(server, authClient.memberID)
	assert.Zero(t, mapped, "the closed connection is no longer mapped")
	assert.Zero(t, writers, "its writer channel is gone")
}

// A connection reset by the peer is a read error the server does not
// recognise. It is cleaned up like a leave, and the server keeps serving.
func TestDisconnect_AConnectionResetLeavesTheServerServing(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := NewServer(context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	route := newConnectRoute(t, server, authClient)

	client := route.connect(t, "token")
	tcp, ok := client.NetConn().(*net.TCPConn)
	require.True(t, ok)
	require.NoError(t, tcp.SetLinger(0)) // close with a reset, not a FIN
	require.NoError(t, tcp.Close())

	eventually(t, "the reset connection is released", func() bool {
		mapped, _ := connectionsOf(server, authClient.memberID)
		return mapped == 0
	})

	// the server is still taking connections
	route.connect(t, "token")
	mapped, writers := connectionsOf(server, authClient.memberID)
	assert.Equal(t, 1, mapped)
	assert.Equal(t, 1, writers)
}

// A connection the server no longer maps, such as one a reconnect replaced, is
// simply closed: there is no player behind it to clean up, and the members
// the server does map are left alone.
func TestCleanUpClient_AnUnmappedConnectionIsOnlyClosed(t *testing.T) {
	server := NewServer(context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())

	bystanderConn := &websocket.Conn{}
	bystander := &types.Player{ID: uuid.New(), Username: "Kaelen"}
	registerTestConn(server, bystanderConn, bystander)

	unmapped, client := wsPair(t)

	within(t, settle, "cleaning up an unmapped connection", func() {
		server.cleanUpClient(unmapped)
	})

	require.NoError(t, client.SetReadDeadline(time.Now().Add(settle)))
	_, _, err := client.ReadMessage()
	require.Error(t, err, "the unmapped connection is closed")
	var netErr net.Error
	if errors.As(err, &netErr) {
		assert.False(t, netErr.Timeout(), "closed by the server, not left open")
	}

	_, onRecord := server.PlayerByID(bystander.ID)
	assert.True(t, onRecord, "the bystander is still on record")
	_, mapped := server.GetPlayerFromConn(bystanderConn)
	assert.True(t, mapped, "and still connected")
}

// A member reconnecting from several tabs at once ends with exactly one live
// connection. No handler is left replying on a writer channel another
// reconnect closed, and no superseded connection keeps a writer. Run under -race.
func TestReconnect_OverlappingReconnectsKeepOneLiveConnection(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := NewServer(context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	route := newConnectRoute(t, server, authClient)
	hub, _ := server.HubSession()

	route.connect(t, "token")
	record, ok := server.PlayerByID(authClient.memberID)
	require.True(t, ok)
	// in a world, so every reconnect replies "reconnected" and the world
	server.setCurrentWorld(record, hub.ID)

	const rounds, tabs = 4, 8
	for range rounds {
		var dials sync.WaitGroup
		for range tabs {
			dials.Add(1)
			go func() {
				defer dials.Done()
				route.dial(t, "token")
			}()
		}
		dials.Wait()
		for range tabs {
			route.awaitHandled(t)
		}
	}

	route.assertNoPanics(t)

	eventually(t, "one live connection and one writer remain", func() bool {
		mapped, writers := connectionsOf(server, authClient.memberID)
		return mapped == 1 && writers == 1
	})
}

// A reconnect into a world is answered with "reconnected" and then the world
// the member is in, in that order.
func TestReconnect_RepliesReconnectedThenTheWorld(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := NewServer(context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	route := newConnectRoute(t, server, authClient)
	hub, _ := server.HubSession()

	route.connect(t, "token")
	record, ok := server.PlayerByID(authClient.memberID)
	require.True(t, ok)
	server.setCurrentWorld(record, hub.ID)

	client := route.connect(t, "token")
	require.NoError(t, client.SetReadDeadline(time.Now().Add(settle)))

	var reconnected, world types.Message
	require.NoError(t, client.ReadJSON(&reconnected))
	require.NoError(t, client.ReadJSON(&world))

	assert.Equal(t, "reconnected", reconnected.Action)
	assert.Equal(t, map[string]interface{}{
		"message":    "Successfully reconnected",
		"session_id": hub.ID.String(),
		"username":   record.Username,
	}, reconnected.Payload)

	assert.Equal(t, string(constants.ActionWorldEntered), world.Action)
	assert.Equal(t, map[string]interface{}{
		"session_id": hub.ID.String(),
		"world_type": string(types.WorldTypeHub),
	}, world.Payload)
}
