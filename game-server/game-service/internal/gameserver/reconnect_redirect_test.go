package gameserver

import (
	"context"
	"log/slog"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/auth"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/**
* FS-MCYWK §A: a landing pod asks the presence index, at the handshake, whether
* the member is present on another live pod, their holding pod, and sends them there.
**/

const (
	holdingPodID   = "pod-b"
	holdingPodAddr = "ws://pod-b/game/ws"
)

// holdingIndex is the presence index answering every lookup with one entry,
// or an error, or nothing until the caller gives up when slow. It counts the
// lookups it is asked.
type holdingIndex struct {
	mu      sync.Mutex
	asked   int
	found   partypresence.Found
	present bool
	err     error
	slow    bool
}

func (h *holdingIndex) Seat(context.Context, string, string, []partypresence.Entry) error {
	return nil
}
func (h *holdingIndex) Unseat(context.Context, string, []partypresence.Entry) error { return nil }
func (h *holdingIndex) LookupIDs(context.Context, []uuid.UUID) (map[uuid.UUID]partypresence.Found, error) {
	return map[uuid.UUID]partypresence.Found{}, nil
}

func (h *holdingIndex) Lookup(ctx context.Context, _ string) (partypresence.Found, bool, error) {
	h.mu.Lock()
	h.asked++
	found, present, err, slow := h.found, h.present, h.err, h.slow
	h.mu.Unlock()

	if slow {
		// longer than any bound, and deaf to its caller giving up, as a
		// stalled Redis read past its context is
		time.Sleep(2 * redirectLookupBound)
	}
	return found, present, err
}

func (h *holdingIndex) lookups() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.asked
}

// holdingAt is the index naming the member present on pod with addr.
func holdingAt(memberID uuid.UUID, pod, addr string) *holdingIndex {
	return &holdingIndex{
		found:   partypresence.Found{PlayerID: memberID, Name: "Wren", PodID: pod, PodAddr: addr, World: "hub"},
		present: true,
	}
}

// podHeartbeats is the liveness reader: the pods it names are alive.
type podHeartbeats struct {
	mu    sync.Mutex
	asked []string
	alive map[string]bool
	err   error
	slow  bool
}

func (p *podHeartbeats) PodAlive(_ context.Context, podID string) (bool, error) {
	p.mu.Lock()
	p.asked = append(p.asked, podID)
	alive, err, slow := p.alive[podID], p.err, p.slow
	p.mu.Unlock()

	if slow {
		time.Sleep(2 * redirectLookupBound)
	}
	return alive, err
}

func (p *podHeartbeats) reads() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]string(nil), p.asked...)
}

func aliveHeartbeats(pods ...string) *podHeartbeats {
	alive := make(map[string]bool, len(pods))
	for _, pod := range pods {
		alive[pod] = true
	}
	return &podHeartbeats{alive: alive}
}

// redirectPod is a landing pod (testPodID) built with the index and the
// liveness reader given, and its connect route.
func redirectPod(t *testing.T, memberID uuid.UUID, opts ...Option) (*Server, *connectRoute) {
	t.Helper()

	authClient := &oneMemberAuth{memberID: memberID}
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{}, opts...)
	return server, newConnectRoute(t, server, authClient)
}

// dialWith opens a connection with the token and the extra query parameters.
func (r *connectRoute) dialWith(t *testing.T, query url.Values) *websocket.Conn {
	t.Helper()

	query.Set(auth.TokenParam, "token")
	conn, _, err := websocket.DefaultDialer.Dial(r.url+"?"+query.Encode(), nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })

	return conn
}

// closeOf reads until the server closes the connection, returning what it sent
// before and the close frame.
func closeOf(t *testing.T, conn *websocket.Conn) ([]types.Message, *websocket.CloseError) {
	t.Helper()
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(settle)))

	var sent []types.Message
	for {
		var msg types.Message
		err := conn.ReadJSON(&msg)
		if err == nil {
			sent = append(sent, msg)
			continue
		}
		var closeErr *websocket.CloseError
		require.ErrorAs(t, err, &closeErr, "the server closes with a close frame")
		return sent, closeErr
	}
}

// assertNotSeatedHere checks the landing pod keeps nothing for the member: no
// record, no mapped connection, no writer, nothing for its presence keeper.
func assertNotSeatedHere(t *testing.T, server *Server, memberID uuid.UUID) {
	t.Helper()

	_, onRecord := server.PlayerByID(memberID)
	assert.False(t, onRecord, "no record for the member")
	mapped, writers := connectionsOf(server, memberID)
	assert.Zero(t, mapped, "no mapped connection")
	assert.Zero(t, writers, "no writer")
	for _, present := range server.PresentPlayers() {
		assert.NotEqual(t, memberID, present.ID, "nothing for the presence keeper to write")
	}
}

// A member not on record here, present on another live pod with an address,
// is sent there: one world_handoff {addr, reconnect: true}, then a normal close.
// R2, R5, R7.
func TestHandleWebSocketConnection_PresentOnAnotherLivePod_Redirected(t *testing.T) {
	memberID := uuid.New()
	index := holdingAt(memberID, holdingPodID, holdingPodAddr)
	heartbeats := aliveHeartbeats(holdingPodID)
	server, route := redirectPod(t, memberID, WithPresence(index), WithPodLiveness(heartbeats))

	conn := route.dial(t, "token")
	sent, closed := closeOf(t, conn)
	route.awaitHandled(t)

	require.Len(t, sent, 1, "exactly one message")
	assert.Equal(t, string(constants.ActionWorldHandoff), sent[0].Action)
	assert.Equal(t, map[string]interface{}{"addr": holdingPodAddr, "reconnect": true}, sent[0].Payload,
		"the holding pod's address, no session_id, no hub")
	assert.Equal(t, websocket.CloseNormalClosure, closed.Code)
	assert.Equal(t, "redirected", closed.Text)

	assertNotSeatedHere(t, server, memberID)
	assert.Equal(t, []string{holdingPodID}, heartbeats.reads(), "the holding pod's liveness is read")
	route.assertNoPanics(t)
}

// assertSeatedHere checks the connection was seated on the landing pod as
// today: the member is on record with one mapped connection and its writer.
func assertSeatedHere(t *testing.T, server *Server, memberID uuid.UUID) {
	t.Helper()

	_, onRecord := server.PlayerByID(memberID)
	assert.True(t, onRecord, "the member is on record here")
	mapped, writers := connectionsOf(server, memberID)
	assert.Equal(t, 1, mapped, "the connection is mapped here")
	assert.Equal(t, 1, writers, "and given a writer")
}

// Anything short of another live pod with an address seats the connection
// where it landed. R5, R6; Edge States "Holding pod died", "Stale self-entry".
func TestHandleWebSocketConnection_NoLiveHolderElsewhere_SeatedWhereItLanded(t *testing.T) {
	tests := []struct {
		name       string
		index      func(memberID uuid.UUID) *holdingIndex
		heartbeats *podHeartbeats
	}{
		{"no entry", func(uuid.UUID) *holdingIndex { return &holdingIndex{} }, aliveHeartbeats(holdingPodID)},
		{"the entry names this pod", func(id uuid.UUID) *holdingIndex { return holdingAt(id, testPodID, testPodAddr) }, aliveHeartbeats(testPodID)},
		{"the entry has no address", func(id uuid.UUID) *holdingIndex { return holdingAt(id, holdingPodID, "") }, aliveHeartbeats(holdingPodID)},
		{"the entry's pod is not alive", func(id uuid.UUID) *holdingIndex { return holdingAt(id, holdingPodID, holdingPodAddr) }, aliveHeartbeats()},
		{"the lookup errs", func(id uuid.UUID) *holdingIndex {
			index := holdingAt(id, holdingPodID, holdingPodAddr)
			index.err = assert.AnError
			return index
		}, aliveHeartbeats(holdingPodID)},
		{"the liveness read errs", func(id uuid.UUID) *holdingIndex { return holdingAt(id, holdingPodID, holdingPodAddr) },
			&podHeartbeats{alive: map[string]bool{holdingPodID: true}, err: assert.AnError}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memberID := uuid.New()
			index := tt.index(memberID)
			server, route := redirectPod(t, memberID, WithPresence(index), WithPodLiveness(tt.heartbeats))

			route.connect(t, "token")

			assert.Equal(t, 1, index.lookups(), "the member was looked up")
			assertSeatedHere(t, server, memberID)
			route.assertNoPanics(t)
		})
	}
}

// A lookup that outlasts the bound, in either read, seats the connection where
// it landed, within the bound. R4, R6; Edge States "Redis slow or down".
func TestHandleWebSocketConnection_LookupSlowerThanTheBound_SeatedWithinIt(t *testing.T) {
	tests := []struct {
		name       string
		index      *holdingIndex
		heartbeats *podHeartbeats
	}{
		{"the presence lookup", &holdingIndex{slow: true}, aliveHeartbeats(holdingPodID)},
		{"the liveness read", nil, &podHeartbeats{alive: map[string]bool{holdingPodID: true}, slow: true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memberID := uuid.New()
			index := tt.index
			if index == nil {
				index = holdingAt(memberID, holdingPodID, holdingPodAddr)
			}
			server, route := redirectPod(t, memberID, WithPresence(index), WithPodLiveness(tt.heartbeats))

			began := time.Now()
			route.connect(t, "token")
			took := time.Since(began)

			assert.Less(t, took, redirectLookupBound+300*time.Millisecond, "the connection proceeds within the bound")
			assertSeatedHere(t, server, memberID)
			route.assertNoPanics(t)
		})
	}
}

// A member already on record here, whether connected, within the grace or
// kept until their run ends, is never looked up and reconnects in place, even
// with the index naming another live pod. R3; AC "never looked up".
func TestHandleWebSocketConnection_OnRecordHere_NeverLookedUp(t *testing.T) {
	tests := []struct {
		name   string
		onHere func(t *testing.T, server *Server, route *connectRoute, memberID uuid.UUID)
	}{
		{"connected", func(t *testing.T, _ *Server, route *connectRoute, _ uuid.UUID) {
			// seated here first by a connection a server sent them on
			route.dialWith(t, url.Values{auth.RedirectedParam: {"1"}})
			route.awaitHandled(t)
		}},
		{"within the reconnect grace", func(t *testing.T, server *Server, _ *connectRoute, memberID uuid.UUID) {
			server.connectPlayer(memberID, "Wren", "token")
		}},
		{"kept until the run ends", func(t *testing.T, server *Server, _ *connectRoute, memberID uuid.UUID) {
			server.connectPlayer(memberID, "Wren", "token")
			server.mu.Lock()
			server.keptUntilRunEnd[memberID] = struct{}{}
			server.mu.Unlock()
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			memberID := uuid.New()
			index := holdingAt(memberID, holdingPodID, holdingPodAddr)
			server, route := redirectPod(t, memberID, WithPresence(index), WithPodLiveness(aliveHeartbeats(holdingPodID)))
			tt.onHere(t, server, route, memberID)
			hub, _ := server.HubSession()
			server.setCurrentWorld(recordPointer(t, server, memberID), hub.ID)

			client := route.connect(t, "token")

			assert.Zero(t, index.lookups(), "a member on record here is never looked up")
			require.NoError(t, client.SetReadDeadline(time.Now().Add(settle)))
			var first types.Message
			require.NoError(t, client.ReadJSON(&first))
			assert.Equal(t, "reconnected", first.Action, "they reconnect in place")
			assertSeatedHere(t, server, memberID)
			route.assertNoPanics(t)
		})
	}
}

// recordPointer is the member's live record, for a test that moves it.
func recordPointer(t *testing.T, server *Server, memberID uuid.UUID) *types.Player {
	t.Helper()
	record, ok := server.PlayerByID(memberID)
	require.True(t, ok, "the member is on record")
	return record
}

// A handoff arrival is never looked up and keeps its own path. R3.
func TestHandleWebSocketConnection_HandoffArrival_NeverLookedUp(t *testing.T) {
	memberID := uuid.New()
	index := holdingAt(memberID, holdingPodID, holdingPodAddr)
	_, route := redirectPod(t, memberID, WithPresence(index), WithPodLiveness(aliveHeartbeats(holdingPodID)))

	conn := route.dialHandoff(t, "token", uuid.NewString())
	code := closeCodeOf(t, conn)
	route.awaitHandled(t)

	assert.Zero(t, index.lookups(), "a handoff arrival is never looked up")
	assert.Equal(t, auth.CloseCodeHandoffRefused, code, "and is refused on its own path, an unknown run")
	route.assertNoPanics(t)
}

// A connection a server sent the client to make is seated where it lands, even
// with the index naming another live pod: no loop. R8; Edge States "Both pods
// stale".
func TestHandleWebSocketConnection_Redirected_SeatedWhereItLands(t *testing.T) {
	memberID := uuid.New()
	index := holdingAt(memberID, holdingPodID, holdingPodAddr)
	server, route := redirectPod(t, memberID, WithPresence(index), WithPodLiveness(aliveHeartbeats(holdingPodID)))

	route.dialWith(t, url.Values{auth.RedirectedParam: {"1"}})
	route.awaitHandled(t)

	assert.Zero(t, index.lookups(), "a redirected connection is never looked up")
	assertSeatedHere(t, server, memberID)
	route.assertNoPanics(t)
}

// A pod built without the presence index or the liveness reader never looks
// up. R6.
func TestHandleWebSocketConnection_WithoutEitherRead_NeverLooksUp(t *testing.T) {
	t.Run("no liveness reader", func(t *testing.T) {
		memberID := uuid.New()
		index := holdingAt(memberID, holdingPodID, holdingPodAddr)
		server, route := redirectPod(t, memberID, WithPresence(index))

		route.connect(t, "token")

		assert.Zero(t, index.lookups())
		assertSeatedHere(t, server, memberID)
	})
	t.Run("no presence index", func(t *testing.T) {
		memberID := uuid.New()
		heartbeats := aliveHeartbeats(holdingPodID)
		server, route := redirectPod(t, memberID, WithPodLiveness(heartbeats))

		route.connect(t, "token")

		assert.Empty(t, heartbeats.reads())
		assertSeatedHere(t, server, memberID)
	})
}

// On the holding pod, a redirected connection of a member in a run is put back
// in it: reconnected, then the run's world_entered. R9.
func TestHandleWebSocketConnection_RedirectedIntoTheirRun_Reconnected(t *testing.T) {
	memberID := uuid.New()
	server, route := redirectPod(t, memberID)
	run := runExpecting(server, memberID)
	server.connectPlayer(memberID, "Wren", "token")
	server.setCurrentWorld(recordPointer(t, server, memberID), run.ID)

	client := route.dialWith(t, url.Values{auth.RedirectedParam: {"1"}})
	route.awaitHandled(t)

	require.NoError(t, client.SetReadDeadline(time.Now().Add(settle)))
	var reconnected, world types.Message
	require.NoError(t, client.ReadJSON(&reconnected))
	require.NoError(t, client.ReadJSON(&world))
	assert.Equal(t, "reconnected", reconnected.Action)
	assert.Equal(t, string(constants.ActionWorldEntered), world.Action)
	assert.Equal(t, run.ID.String(), world.Payload["session_id"])
	assert.Equal(t, string(types.WorldTypeRun), world.Payload["world_type"])
	assertSeatedHere(t, server, memberID)
}

// On the holding pod, a redirected connection whose record went before it
// arrived is seated as a fresh connection, not refused. R12.
func TestHandleWebSocketConnection_RedirectedAfterTheRecordWent_SeatedFresh(t *testing.T) {
	memberID := uuid.New()
	server, route := redirectPod(t, memberID)

	route.dialWith(t, url.Values{auth.RedirectedParam: {"1"}})
	route.awaitHandled(t)

	assertSeatedHere(t, server, memberID)
	assert.Equal(t, uuid.Nil, recordOf(t, server, memberID).CurrentGameSessionId, "fresh: in no world yet")
	route.assertNoPanics(t)
}

// A member within the reconnect grace returning to a hub at its cap is not refused: the return
// is an in-place reconnect, not an admission. R11.
func TestHandleWebSocketConnection_WithinTheGraceIntoAFullHub_NotRefused(t *testing.T) {
	memberID := uuid.New()
	server, route := redirectPod(t, memberID)
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	registerTestConn(server, conn, &types.Player{ID: memberID, Username: "Wren"})
	_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Wren"})
	require.NoError(t, err)
	fillHub(t, server, constants.HubOccupancyCap-1)
	_, _, held := server.holdForReconnect(conn)
	require.True(t, held)

	client := route.dialWith(t, url.Values{auth.RedirectedParam: {"1"}})
	route.awaitHandled(t)

	require.NoError(t, client.SetReadDeadline(time.Now().Add(settle)))
	var reconnected, world types.Message
	require.NoError(t, client.ReadJSON(&reconnected))
	require.NoError(t, client.ReadJSON(&world))
	assert.Equal(t, "reconnected", reconnected.Action)
	assert.Equal(t, hub.ID.String(), world.Payload["session_id"], "back in the full hub")
	assert.True(t, hub.HasPlayer(memberID))
	mapped, _ := connectionsOf(server, memberID)
	assert.Equal(t, 1, mapped, "the connection is mapped")
}

// A connection that goes away mid-lookup ends it at once, and is not reported
// as a lookup that outlasted the bound.
func TestHoldingPodsFind_ConnectionGoneMidLookup_NotReportedAsTooSlow(t *testing.T) {
	logs := &lockedLog{}
	before := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: slog.LevelWarn})))
	t.Cleanup(func() { slog.SetDefault(before) })

	memberID := uuid.New()
	finder := newHoldingPods(testPodID, &holdingIndex{slow: true}, aliveHeartbeats(holdingPodID))
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(20*time.Millisecond, cancel)

	began := time.Now()
	_, found := finder.find(ctx, memberID)

	assert.False(t, found)
	assert.Less(t, time.Since(began), redirectLookupBound, "ended when the connection went, not at the bound")
	assert.NotContains(t, logs.String(), "took too long", "a connection that went away is not a slow lookup")
}
