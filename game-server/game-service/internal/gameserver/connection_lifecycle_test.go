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
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
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

// recordOf is a copy of the member's record, read under the lock the server
// writes it under.
func recordOf(t *testing.T, server *Server, memberID uuid.UUID) types.Player {
	t.Helper()

	server.mu.RLock()
	defer server.mu.RUnlock()

	record, ok := server.players[memberID]
	require.True(t, ok, "the member is on record")

	return *record
}

// connStateOf is the connect state on the member's record.
func connStateOf(t *testing.T, server *Server, memberID uuid.UUID) constants.ConnectState {
	t.Helper()

	record := recordOf(t, server, memberID)
	require.NotNil(t, record.ConnectState)

	return *record.ConnectState
}

// A connection reset by the peer is a network drop, not a leave: the member is
// held for the reconnect grace and can resume, and the server keeps serving.
func TestDisconnect_AConnectionResetLeavesTheServerServing(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	route := newConnectRoute(t, server, authClient)
	hub, _ := server.HubSession()

	client := route.connect(t, "token")
	record, ok := server.PlayerByID(authClient.memberID)
	require.True(t, ok)
	server.setCurrentWorld(record, hub.ID)

	tcp, ok := client.NetConn().(*net.TCPConn)
	require.True(t, ok)
	require.NoError(t, tcp.SetLinger(0)) // close with a reset, not a FIN
	require.NoError(t, tcp.Close())

	eventually(t, "the reset connection is released", func() bool {
		mapped, writers := connectionsOf(server, authClient.memberID)
		return mapped == 0 && writers == 0
	})

	held, onRecord := server.PlayerByID(authClient.memberID)
	require.True(t, onRecord, "the member is held for the reconnect grace, not removed")
	assert.Same(t, record, held, "the record they resume is the one they dropped from")
	assert.Equal(t, constants.Reconnecting, connStateOf(t, server, authClient.memberID))
	assert.Equal(t, hub.ID, recordOf(t, server, authClient.memberID).CurrentGameSessionId,
		"still in the world they dropped out of")

	// they resume where they were, and the server is still taking connections
	resumed := route.connect(t, "token")
	require.NoError(t, resumed.SetReadDeadline(time.Now().Add(settle)))
	var reconnected types.Message
	require.NoError(t, resumed.ReadJSON(&reconnected))
	assert.Equal(t, "reconnected", reconnected.Action)

	mapped, writers := connectionsOf(server, authClient.memberID)
	assert.Equal(t, 1, mapped)
	assert.Equal(t, 1, writers)
	assert.Equal(t, constants.Connected, connStateOf(t, server, authClient.memberID))
}

// The server closing a connection a reconnect superseded is not the member
// dropping: the read error on that socket never marks them reconnecting.
func TestDisconnect_ClosingASupersededConnectionIsNotADrop(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	route := newConnectRoute(t, server, authClient)
	hub, _ := server.HubSession()

	first := route.connect(t, "token")
	record, ok := server.PlayerByID(authClient.memberID)
	require.True(t, ok)
	server.setCurrentWorld(record, hub.ID)

	route.connect(t, "token")

	// the server closes the superseded socket
	require.NoError(t, first.SetReadDeadline(time.Now().Add(settle)))
	for {
		if _, _, err := first.ReadMessage(); err != nil {
			var netErr net.Error
			if errors.As(err, &netErr) {
				require.False(t, netErr.Timeout(), "the superseded connection is closed by the server")
			}
			break
		}
	}

	// its reader sees the server's own close; give it time to act on it
	deadline := time.Now().Add(200 * time.Millisecond)
	for time.Now().Before(deadline) {
		require.Equal(t, constants.Connected, connStateOf(t, server, authClient.memberID),
			"the member on the new connection is not marked reconnecting")
		time.Sleep(5 * time.Millisecond)
	}

	mapped, writers := connectionsOf(server, authClient.memberID)
	assert.Equal(t, 1, mapped)
	assert.Equal(t, 1, writers)
}

// The connection is mapped to the member's record as it stands when the
// connection is published, not to the copy taken before the upgrade: a run
// ending in between is not undone on the connection routing reads.
func TestMapConnToPlayer_MapsTheLiveRecord(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()
	memberID := uuid.New()

	connected, _ := server.connectPlayer(memberID, "Wren", "token")

	// the run ends and sends them home while the handler is still upgrading
	record, ok := server.PlayerByID(memberID)
	require.True(t, ok)
	server.setCurrentWorld(record, hub.ID)

	conn := &websocket.Conn{}
	_, mapped := server.MapConnToPlayer(conn, connected.ID, make(chan interface{}, clientWriterBuffer))
	require.True(t, mapped)

	server.mu.RLock()
	published := *server.connToPlayer[conn]
	server.mu.RUnlock()
	assert.Equal(t, hub.ID, published.CurrentGameSessionId, "the connection carries the live record")
}

// A member whose record is gone by the time the connection is published (the
// reconnect grace ran out meanwhile) is refused: nothing is mapped and no
// writer is registered.
func TestMapConnToPlayer_RefusesAMemberNoLongerOnRecord(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	memberID := uuid.New()

	connected, _ := server.connectPlayer(memberID, "Wren", "token")

	// the grace cleanup removes the record while the handler is upgrading
	server.mu.Lock()
	delete(server.players, memberID)
	server.mu.Unlock()

	_, mapped := server.MapConnToPlayer(&websocket.Conn{}, connected.ID, make(chan interface{}, clientWriterBuffer))
	assert.False(t, mapped)

	conns, writers := connectionsOf(server, memberID)
	assert.Zero(t, conns)
	assert.Zero(t, writers)
}

// stalledQueue is a queue whose removals wait until released, as the real one
// does while it retries a slow store.
type stalledQueue struct {
	*mockQueueService
	removing chan struct{}
	release  chan struct{}
}

func (q *stalledQueue) PlayerRemoveQueue(context.Context, *types.Player) error {
	select {
	case q.removing <- struct{}{}:
	default:
	}
	<-q.release
	return nil
}

// A member who leaves, comes back and walks into the hub again while their old
// cleanup is still stalled on the queue keeps the body and the world they came
// back with: the old cleanup finishing never strips them.
func TestCleanUpClient_AnOldCleanupCannotStripAMemberWhoCameBack(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	queue := &stalledQueue{mockQueueService: NewMockQueueService(), removing: make(chan struct{}, 1), release: make(chan struct{})}
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(queue.release) }) }
	t.Cleanup(release)

	characters := newFakeCharacters()
	server := newTestServer(t, context.Background(), authClient, queue, &MockEventEmitter{}, &MockItemsClient{}, characters, testPodID, testPodAddr, noopAnnouncer{})
	route := newConnectRoute(t, server, authClient)
	hub, _ := server.HubSession()
	mage := characters.give(authClient.memberID, "mage", "Wren", 3, 100)

	route.connect(t, "token")
	oldConn, ok := server.GetConnFromPlayer(authClient.memberID)
	require.True(t, ok)
	_, err := server.EnterHub(context.Background(), oldConn, mage.ID.String())
	require.NoError(t, err)

	// they leave, and the cleanup stalls on the queue
	cleaned := make(chan struct{})
	go func() {
		defer close(cleaned)
		server.cleanUpClient(oldConn)
	}()
	select {
	case <-queue.removing:
	case <-time.After(settle):
		t.Fatal("the cleanup never reached the queue")
	}

	// meanwhile they come back and walk into the hub again
	route.connect(t, "token")
	newConn, ok := server.GetConnFromPlayer(authClient.memberID)
	require.True(t, ok)
	_, err = server.EnterHub(context.Background(), newConn, mage.ID.String())
	require.NoError(t, err)

	release()
	select {
	case <-cleaned:
	case <-time.After(settle):
		t.Fatal("the old cleanup did not finish")
	}

	assert.True(t, hub.HasPlayer(authClient.memberID), "the body they came back with is kept")
	assert.Equal(t, hub.ID, recordOf(t, server, authClient.memberID).CurrentGameSessionId,
		"their record still points at the hub")

	server.mu.RLock()
	routed := *server.connToPlayer[newConn]
	server.mu.RUnlock()
	assert.Equal(t, hub.ID, routed.CurrentGameSessionId, "and so does the copy routing reads")
}

// A connection the server no longer maps, such as one a reconnect replaced, is
// simply closed: there is no player behind it to clean up, and the members
// the server does map are left alone.
func TestCleanUpClient_AnUnmappedConnectionIsOnlyClosed(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})

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
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
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
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
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

// A member who drops, reconnects and drops again within the first grace is
// held for the whole second grace: the first drop's timer running out ends
// nothing, only the second drop's does.
func TestDisconnect_ARepeatedDropGetsTheFullGraceAgain(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})

	firstConn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, firstConn, player)

	// drop
	_, firstHold, held := server.holdForReconnect(firstConn)
	require.True(t, held)

	// reconnect
	secondConn := &websocket.Conn{}
	_, mapped := server.MapConnToPlayer(secondConn, player.ID, make(chan interface{}, clientWriterBuffer))
	require.True(t, mapped)

	// drop again
	_, secondHold, held := server.holdForReconnect(secondConn)
	require.True(t, held)

	// the first drop's grace runs out
	server.cleanUpPlayerCompletely(player.ID, firstHold)
	_, onRecord := server.PlayerByID(player.ID)
	require.True(t, onRecord, "the first drop's grace is over, but the second drop's is not")
	assert.Equal(t, constants.Reconnecting, connStateOf(t, server, player.ID))

	// the second drop's grace runs out
	server.cleanUpPlayerCompletely(player.ID, secondHold)
	_, onRecord = server.PlayerByID(player.ID)
	assert.False(t, onRecord, "evicted once the second drop's grace is over")
}

// The old connection failing between the reconnect marking the member
// connected and publishing the new connection marks them reconnecting. The
// published connection is live, so it marks them connected again, and the
// grace that old failure started never evicts them.
func TestMapConnToPlayer_PublishesTheMemberConnected(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})

	oldConn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, oldConn, player)

	// a reconnect arrives while the old connection is still mapped
	server.connectPlayer(player.ID, "Wren", "token")

	// the old connection fails before the new one is published
	_, staleHold, held := server.holdForReconnect(oldConn)
	require.True(t, held)
	require.Equal(t, constants.Reconnecting, connStateOf(t, server, player.ID))

	newConn := &websocket.Conn{}
	_, mapped := server.MapConnToPlayer(newConn, player.ID, make(chan interface{}, clientWriterBuffer))
	require.True(t, mapped)

	assert.Equal(t, constants.Connected, connStateOf(t, server, player.ID), "the record is connected")
	published, ok := server.GetPlayerFromConn(newConn)
	require.True(t, ok)
	require.NotNil(t, published.ConnectState)
	assert.Equal(t, constants.Connected, *published.ConnectState, "and so is the copy routing reads")

	// the old failure's grace runs out
	server.cleanUpPlayerCompletely(player.ID, staleHold)
	_, onRecord := server.PlayerByID(player.ID)
	assert.True(t, onRecord, "a member on a live connection is never evicted")
	_, stillMapped := server.GetPlayerFromConn(newConn)
	assert.True(t, stillMapped)
}
