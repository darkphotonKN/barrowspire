package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The identity every test server runs as, unless a test needs its own.
const (
	testPodID   = "pod-host"
	testPodAddr = "ws://pod-host:5668/game/ws"
)

// noopAnnouncer drops every announce, for tests that never match across pods.
type noopAnnouncer struct{}

func (noopAnnouncer) Announce(context.Context, matchmaker.MatchStart) error { return nil }

// announceCall is one announce the host made, and whether the run it names
// already existed when it was made.
type announceCall struct {
	payload       matchmaker.MatchStart
	sessionExists bool
}

// recordingAnnouncer records every announce, and fails the ones for pods in failPods.
type recordingAnnouncer struct {
	mu       sync.Mutex
	calls    []announceCall
	failPods map[string]bool

	// set before a match is pushed, to check the run exists at announce time
	server *Server
}

func (a *recordingAnnouncer) Announce(ctx context.Context, payload matchmaker.MatchStart) error {
	exists := false
	if a.server != nil {
		_, exists = a.server.GetGameSession(payload.SessionID)
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	a.calls = append(a.calls, announceCall{payload: payload, sessionExists: exists})

	if a.failPods[payload.PodID] {
		return errors.New("redis down")
	}
	return nil
}

func (a *recordingAnnouncer) recorded() []announceCall {
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]announceCall(nil), a.calls...)
}

func newHandoffServer(t *testing.T, queue *mockQueueService, announcer HandoffAnnouncer) *Server {
	t.Helper()
	return NewServer(context.Background(), &MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, announcer)
}

func matchPlayer(pod string) matchmaker.MatchStartPlayer {
	return matchmaker.MatchStartPlayer{
		ID:        uuid.New(),
		Pod:       pod,
		Character: types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Delver"},
	}
}

// A matched player is local only when they are on this pod and connected
// here; a player on another pod is handed off; a player on this pod who is not
// connected is dropped. FS-K2HKP §Requirements 19–20.
func TestResolveMatchedPlayers_ClassifiesByPod(t *testing.T) {
	server := newHandoffServer(t, NewMockQueueService(), noopAnnouncer{})
	hub := NewMessageHub(server, messaging.NewMessageSender(server), testPodID, testPodAddr, noopAnnouncer{})

	local := matchPlayer(testPodID)
	registerTestConn(server, &websocket.Conn{}, &types.Player{ID: local.ID, Username: "Wren", Character: local.Character})

	gone := matchPlayer(testPodID)
	remote := matchPlayer("pod-other")

	resolved := hub.resolveMatchedPlayers(matchmaker.MatchStart{
		PodID:   testPodID,
		Step:    matchmaker.MatchStepCreate,
		Players: []matchmaker.MatchStartPlayer{local, gone, remote},
	})

	require.Len(t, resolved.LocalPlayers, 1)
	assert.Equal(t, local.ID, resolved.LocalPlayers[0].ID)

	require.Len(t, resolved.HandoffPlayers, 1)
	assert.Equal(t, remote.ID, resolved.HandoffPlayers[0].ID)
	assert.Equal(t, remote.Character, resolved.HandoffPlayers[0].Character,
		"the host builds the run from the character the remote player queued with")
}

// After the run exists, the host announces one handoff per other pod, listing
// that pod's players only, and none for its own. FS-K2HKP §Requirements 20.
func TestCreate_AnnouncesOneHandoffPerOtherPod_AfterTheRunExists(t *testing.T) {
	queue := NewMockQueueService()
	announcer := &recordingAnnouncer{}
	server := newHandoffServer(t, queue, announcer)
	announcer.server = server

	host, _ := enterHub(t, server, "Wren")
	hostPlayer := matchmaker.MatchStartPlayer{ID: host.ID, Pod: testPodID, Character: host.Character}
	podA1, podA2 := matchPlayer("pod-a"), matchPlayer("pod-a")
	podB := matchPlayer("pod-b")

	queue.matchedChan <- matchmaker.MatchStart{
		PodID:   testPodID,
		Step:    matchmaker.MatchStepCreate,
		Players: []matchmaker.MatchStartPlayer{hostPlayer, podA1, podB, podA2},
	}

	require.Eventually(t, func() bool { return len(announcer.recorded()) == 2 }, 2*time.Second, 10*time.Millisecond)
	// no third announce follows, the host's own player gets none
	time.Sleep(50 * time.Millisecond)
	calls := announcer.recorded()
	require.Len(t, calls, 2)

	byPod := map[string]announceCall{}
	for _, call := range calls {
		byPod[call.payload.PodID] = call
	}
	require.Contains(t, byPod, "pod-a")
	require.Contains(t, byPod, "pod-b")

	sessionID := calls[0].payload.SessionID
	require.NotEqual(t, uuid.Nil, sessionID)
	run, exists := server.GetGameSession(sessionID)
	require.True(t, exists, "the announced session id is the run the host created")
	assert.True(t, run.HasPlayer(host.ID), "the host's own player is moved in without a handoff")

	idsOf := func(players []matchmaker.MatchStartPlayer) []uuid.UUID {
		ids := make([]uuid.UUID, 0, len(players))
		for _, p := range players {
			ids = append(ids, p.ID)
		}
		return ids
	}

	for pod, want := range map[string][]uuid.UUID{
		"pod-a": {podA1.ID, podA2.ID},
		"pod-b": {podB.ID},
	} {
		call := byPod[pod]
		assert.True(t, call.sessionExists, "handoff to %s published before the run existed", pod)
		assert.Equal(t, matchmaker.MatchStepHandoff, call.payload.Step)
		assert.Equal(t, sessionID, call.payload.SessionID, "every pod is told the same run")
		assert.Equal(t, testPodAddr, call.payload.HostAddr)
		assert.ElementsMatch(t, want, idsOf(call.payload.Players), "%s is told about its own players only", pod)
	}
}

// The handoff step's wire form, as the receiving pod decodes it.
func TestHandoffAnnounce_WireForm(t *testing.T) {
	queue := NewMockQueueService()
	announcer := &recordingAnnouncer{}
	server := newHandoffServer(t, queue, announcer)

	host, _ := enterHub(t, server, "Wren")
	remote := matchPlayer("pod-a")

	queue.matchedChan <- matchmaker.MatchStart{
		PodID: testPodID,
		Step:  matchmaker.MatchStepCreate,
		Players: []matchmaker.MatchStartPlayer{
			{ID: host.ID, Pod: testPodID, Character: host.Character},
			remote,
		},
	}

	require.Eventually(t, func() bool { return len(announcer.recorded()) == 1 }, 2*time.Second, 10*time.Millisecond)
	payload := announcer.recorded()[0].payload

	raw, err := json.Marshal(payload)
	require.NoError(t, err)

	var wire map[string]any
	require.NoError(t, json.Unmarshal(raw, &wire))

	assert.Equal(t, "handoff", wire["step"])
	assert.Equal(t, "pod-a", wire["pod_id"])
	assert.Equal(t, payload.SessionID.String(), wire["session_id"])
	assert.Equal(t, testPodAddr, wire["host_addr"])
	players, ok := wire["players"].([]any)
	require.True(t, ok)
	require.Len(t, players, 1)
	assert.Equal(t, remote.ID.String(), players[0].(map[string]any)["id"])
}

// A failed announce to one pod is logged and the rest are still told; the
// unclaimed seats lapse on their own. FS-K2HKP §Requirements 25.
func TestCreate_FailedAnnounceToOnePod_DoesNotStopTheOthers(t *testing.T) {
	queue := NewMockQueueService()
	announcer := &recordingAnnouncer{failPods: map[string]bool{"pod-a": true, "pod-b": true}}
	server := newHandoffServer(t, queue, announcer)

	host, _ := enterHub(t, server, "Wren")

	queue.matchedChan <- matchmaker.MatchStart{
		PodID: testPodID,
		Step:  matchmaker.MatchStepCreate,
		Players: []matchmaker.MatchStartPlayer{
			{ID: host.ID, Pod: testPodID, Character: host.Character},
			matchPlayer("pod-a"), matchPlayer("pod-b"), matchPlayer("pod-c"),
		},
	}

	require.Eventually(t, func() bool { return len(announcer.recorded()) == 3 }, 2*time.Second, 10*time.Millisecond)

	pods := []string{}
	for _, call := range announcer.recorded() {
		pods = append(pods, call.payload.PodID)
	}
	assert.ElementsMatch(t, []string{"pod-a", "pod-b", "pod-c"}, pods)
}

// On a handoff step, each listed player connected here is told where to go.
// A listed player not connected here is skipped. FS-K2HKP §Requirements 21.
func TestHandoff_TellsListedPlayersToReconnectToTheHost(t *testing.T) {
	queue := NewMockQueueService()
	server := newHandoffServer(t, queue, noopAnnouncer{})
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Kaelen"}
	msgCh := registerTestConn(server, conn, player)
	_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Kaelen"})
	require.NoError(t, err)

	sessionID := uuid.New()
	queue.handoffChan <- matchmaker.MatchStart{
		PodID:     testPodID,
		Step:      matchmaker.MatchStepHandoff,
		SessionID: sessionID,
		HostAddr:  "ws://pod-a:5668/game/ws",
		Players: []matchmaker.MatchStartPlayer{
			{ID: player.ID},
			{ID: uuid.New()}, // not connected here
		},
	}

	msg := awaitAction(t, msgCh, constants.Action("world_handoff"))
	assert.Equal(t, "world_handoff", string(constants.ActionWorldHandoff))
	assert.Equal(t, "ws://pod-a:5668/game/ws", msg.Payload["addr"])
	assert.Equal(t, sessionID.String(), msg.Payload["session_id"])

	assert.True(t, hub.HasPlayer(player.ID), "the pod does not remove anyone from its HUB world")
}

// A handoff step missing where to go or which run is dropped, nobody is told.
func TestHandoff_MissingFields_SendsNothing(t *testing.T) {
	cases := []struct {
		name      string
		sessionID uuid.UUID
		hostAddr  string
	}{
		{name: "no session id", sessionID: uuid.Nil, hostAddr: "ws://pod-a:5668/game/ws"},
		{name: "no host addr", sessionID: uuid.New(), hostAddr: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			queue := NewMockQueueService()
			server := newHandoffServer(t, queue, noopAnnouncer{})

			conn := &websocket.Conn{}
			player := &types.Player{ID: uuid.New(), Username: "Kaelen"}
			msgCh := registerTestConn(server, conn, player)

			queue.handoffChan <- matchmaker.MatchStart{
				PodID:     testPodID,
				Step:      matchmaker.MatchStepHandoff,
				SessionID: tc.sessionID,
				HostAddr:  tc.hostAddr,
				Players:   []matchmaker.MatchStartPlayer{{ID: player.ID}},
			}

			timeout := time.After(300 * time.Millisecond)
			for {
				select {
				case raw := <-msgCh:
					if msg, ok := raw.(types.Message); ok {
						assert.NotEqual(t, "world_handoff", msg.Action, "an incomplete handoff must not be sent")
					}
				case <-timeout:
					return
				}
			}
		})
	}
}
