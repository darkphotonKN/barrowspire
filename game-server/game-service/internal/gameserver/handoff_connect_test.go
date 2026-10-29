package gameserver

import (
	"context"
	"errors"
	"net/url"
	"testing"
	"time"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/auth"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	grpcitems "github.com/darkphotonKN/barrowspire-server/game-service/grpc/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// dialHandoff opens a handoff connection: the token plus the run's session id.
func (r *connectRoute) dialHandoff(t *testing.T, token, sessionID string) *websocket.Conn {
	t.Helper()

	query := url.Values{auth.TokenParam: {token}, auth.SessionIDParam: {sessionID}}
	conn, _, err := websocket.DefaultDialer.Dial(r.url+"?"+query.Encode(), nil)
	require.NoError(t, err, "a handoff connection is upgraded before it is decided")
	t.Cleanup(func() { _ = conn.Close() })

	return conn
}

// closeCodeOf reads until the server closes the connection and returns the
// code it closed with.
func closeCodeOf(t *testing.T, conn *websocket.Conn) int {
	t.Helper()
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(settle)))

	for {
		_, _, err := conn.ReadMessage()
		if err == nil {
			continue
		}
		var closeErr *websocket.CloseError
		require.ErrorAs(t, err, &closeErr, "the server closes with a close frame")
		return closeErr.Code
	}
}

// failingLoadoutItems is items-service unable to answer for a loadout.
type failingLoadoutItems struct{ MockItemsClient }

func (failingLoadoutItems) GetLoadoutWithItems(context.Context, *itemspb.GetLoadoutWithItemsRequest) (*itemspb.GetLoadoutWithItemsResponse, error) {
	return nil, errors.New("items-service down")
}

// runExpecting builds a run on server expecting memberID by handoff.
func runExpecting(server *Server, memberID uuid.UUID) *game.Session {
	return server.CreateGameSession(&types.ResolvedMatchedPlayers{
		HandoffPlayers: []*types.Player{{
			ID:        memberID,
			Character: types.CharacterInPlay{ID: uuid.New(), Class: "warrior", Name: "Arrival", Level: 1},
		}},
	})
}

// A connection without a session id is an ordinary connect, however the
// middleware passes the empty value on.
func TestHandleWebSocketConnection_NoSessionID_ConnectsAsBefore(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	route := newConnectRoute(t, server, authClient)

	route.connect(t, "token")

	mapped, writers := connectionsOf(server, authClient.memberID)
	assert.Equal(t, 1, mapped, "the connection is mapped")
	assert.Equal(t, 1, writers)
	route.assertNoPanics(t)
}

// A handoff connection the host cannot seat is closed with 4002, and is never
// mapped nor served. FS-K2HKP §Requirements 24.
func TestHandleWebSocketConnection_HandoffRefusals(t *testing.T) {
	tests := []struct {
		name      string
		items     grpcitems.ItemsClient
		sessionID func(t *testing.T, server *Server, memberID uuid.UUID) string
	}{
		{
			name: "session id is not a uuid",
			sessionID: func(*testing.T, *Server, uuid.UUID) string {
				return "not-a-session"
			},
		},
		{
			name: "unknown session",
			sessionID: func(*testing.T, *Server, uuid.UUID) string {
				return uuid.NewString()
			},
		},
		{
			name: "session is the hub, not a run",
			sessionID: func(t *testing.T, server *Server, _ uuid.UUID) string {
				hub, ok := server.HubSession()
				require.True(t, ok)
				return hub.ID.String()
			},
		},
		{
			name: "run has ended",
			sessionID: func(_ *testing.T, server *Server, memberID uuid.UUID) string {
				run := runExpecting(server, memberID)
				run.Shutdown()
				return run.ID.String()
			},
		},
		{
			name:  "loadout cannot be fetched",
			items: &failingLoadoutItems{},
			sessionID: func(_ *testing.T, server *Server, memberID uuid.UUID) string {
				return runExpecting(server, memberID).ID.String()
			},
		},
		{
			name: "member already seated in the run",
			sessionID: func(t *testing.T, server *Server, memberID uuid.UUID) string {
				run := runExpecting(server, memberID)
				_, err := run.SeatArrival(&types.Player{ID: memberID}, nil)
				require.NoError(t, err)
				return run.ID.String()
			},
		},
		{
			// a released seat leaves a running run that no longer expects the
			// member; the release itself runs on the run's tick 15s out, so the
			// state is built directly as a run expecting someone else
			name: "seat released, member no longer expected",
			sessionID: func(_ *testing.T, server *Server, _ uuid.UUID) string {
				return runExpecting(server, uuid.New()).ID.String()
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			authClient := &oneMemberAuth{memberID: uuid.New()}
			var items grpcitems.ItemsClient = &MockItemsClient{}
			if tt.items != nil {
				items = tt.items
			}
			server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, items, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
			route := newConnectRoute(t, server, authClient)

			conn := route.dialHandoff(t, "token", tt.sessionID(t, server, authClient.memberID))

			assert.Equal(t, auth.CloseCodeHandoffRefused, closeCodeOf(t, conn))
			route.awaitHandled(t)

			mapped, writers := connectionsOf(server, authClient.memberID)
			assert.Zero(t, mapped, "a refused connection is never mapped")
			assert.Zero(t, writers, "nor given a writer")
			_, onRecord := server.PlayerByID(authClient.memberID)
			assert.False(t, onRecord, "nor leaves a record of a member who never arrived")
			route.assertNoPanics(t)
		})
	}
}

// A refused handoff leaves alone a member already on record here: only the
// record the refused connect itself created is forgotten.
func TestHandleWebSocketConnection_HandoffRefusal_KeepsAnExistingRecord(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	route := newConnectRoute(t, server, authClient)

	route.connect(t, "token")

	conn := route.dialHandoff(t, "token", uuid.NewString())
	assert.Equal(t, auth.CloseCodeHandoffRefused, closeCodeOf(t, conn))
	route.awaitHandled(t)

	_, onRecord := server.PlayerByID(authClient.memberID)
	assert.True(t, onRecord, "the member's existing record is kept")
	mapped, _ := connectionsOf(server, authClient.memberID)
	assert.Equal(t, 1, mapped, "and so is their first connection")
}

// Once seated, the arrival's every record is in the run, and the run's
// world_entered is the first thing their connection is sent. FS-K2HKP
// §Requirements 22.
func TestEnterHandedOffRun_RecordsTheRunAndAnnouncesItFirst(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	run := runExpecting(server, authClient.memberID)

	player, _ := server.connectPlayer(authClient.memberID, "arrival", "token")
	msgChan := make(chan interface{}, clientWriterBuffer)

	server.enterHandedOffRun(&player, run, msgChan)

	assert.Equal(t, run.ID, player.CurrentGameSessionId, "the handler's copy points at the run")
	assert.Equal(t, run.ID, recordOf(t, server, authClient.memberID).CurrentGameSessionId, "and so does the stored record")
	assert.Equal(t, constants.Connected, connStateOf(t, server, authClient.memberID))

	require.Len(t, msgChan, 1)
	first := (<-msgChan).(types.Message)
	assert.Equal(t, worldEnteredMessage(run), first, "world_entered (run) is the first message")
	assert.Equal(t, string(types.WorldTypeRun), first.Payload["world_type"])
}

// An expected arrival is seated and served like any connection: the connection
// is mapped, world_entered (run) is the first message it is sent, and the
// loadout was fetched as the member. FS-K2HKP §Requirements 22.
func TestHandleWebSocketConnection_HandoffArrival_IsSeatedAndServed(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	items := &loadoutAuthRecorder{}
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, items, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	route := newConnectRoute(t, server, authClient)
	run := runExpecting(server, authClient.memberID)

	conn := route.dialHandoff(t, "token", run.ID.String())
	route.awaitHandled(t)

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(settle)))
	var first types.Message
	require.NoError(t, conn.ReadJSON(&first), "the seated arrival is sent a message, not closed")
	assert.Equal(t, string(constants.ActionWorldEntered), first.Action, "world_entered is the first message")
	assert.Equal(t, run.ID.String(), first.Payload["session_id"])
	assert.Equal(t, string(types.WorldTypeRun), first.Payload["world_type"])

	mapped, writers := connectionsOf(server, authClient.memberID)
	assert.Equal(t, 1, mapped, "the connection is mapped")
	assert.Equal(t, 1, writers, "and given a writer")
	assert.Equal(t, run.ID, recordOf(t, server, authClient.memberID).CurrentGameSessionId, "the record points at the run")
	assert.Equal(t, []string{"Bearer token"}, items.last(t), "the loadout is fetched with the member's token")
	route.assertNoPanics(t)
}
