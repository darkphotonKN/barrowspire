package gameserver

import (
	"context"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/game-service/auth"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// oneMemberAuth is the auth service, recognising every token as one member.
type oneMemberAuth struct {
	MockAuthClient
	memberID uuid.UUID
}

func (a *oneMemberAuth) ValidateToken(ctx context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	return &pb.ValidateTokenResponse{Valid: true, MemberId: a.memberID.String()}, nil
}

// connectRoute is the game's connect route as config wires it: the auth
// middleware in front of the connection handler.
type connectRoute struct {
	url     string
	handled chan struct{}
	panics  chan any
}

func newConnectRoute(t *testing.T, server *Server, authClient *oneMemberAuth) *connectRoute {
	t.Helper()
	gin.SetMode(gin.TestMode)

	route := &connectRoute{handled: make(chan struct{}, 64), panics: make(chan any, 64)}

	router := gin.New()
	router.GET("/game/ws",
		func(c *gin.Context) {
			// a panicking handler is reported, not swallowed by net/http
			defer func() {
				if r := recover(); r != nil {
					route.panics <- r
				}
				route.handled <- struct{}{}
			}()
			c.Next()
		},
		auth.WSAuthMiddleware(authClient),
		server.HandleWebSocketConnection,
	)

	httpServer := httptest.NewServer(router)
	t.Cleanup(httpServer.Close)
	route.url = "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/game/ws"

	return route
}

// dial opens a connection as a member holding token, without waiting for the
// handler. The connection is closed normally when the test ends.
func (r *connectRoute) dial(t *testing.T, token string) *websocket.Conn {
	t.Helper()

	conn, _, err := websocket.DefaultDialer.Dial(r.url+"?"+auth.TokenParam+"="+token, nil)
	require.NoError(t, err)
	t.Cleanup(func() { closeNormally(conn) })

	return conn
}

// connect dials as a member holding token and waits for the handler to finish
// with the connection, so one connect is fully handled before the next.
func (r *connectRoute) connect(t *testing.T, token string) *websocket.Conn {
	t.Helper()

	conn := r.dial(t, token)
	r.awaitHandled(t)

	return conn
}

// awaitHandled waits for the handler to finish with one connection.
func (r *connectRoute) awaitHandled(t *testing.T) {
	t.Helper()

	select {
	case <-r.handled:
	case <-time.After(settle):
		t.Fatalf("the connect handler did not finish within %s", settle)
	}
}

// assertNoPanics fails the test if any connect handler panicked.
func (r *connectRoute) assertNoPanics(t *testing.T) {
	t.Helper()

	for {
		select {
		case p := <-r.panics:
			t.Errorf("the connect handler panicked: %v", p)
		default:
			return
		}
	}
}

// closeNormally leaves the way a client does on purpose: a close frame, then
// the socket.
func closeNormally(conn *websocket.Conn) {
	_ = conn.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	_ = conn.Close()
}

// The token the member connects with is the one their record holds: the
// middleware that validates it and the handler that keeps it agree on where
// it is passed.
func TestHandleWebSocketConnection_KeepsTheTokenTheMiddlewareValidated(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := NewServer(context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	route := newConnectRoute(t, server, authClient)

	route.connect(t, "connect-token")

	record, ok := server.PlayerByID(authClient.memberID)
	require.True(t, ok, "the member is on record")
	assert.Equal(t, types.BearerToken("connect-token"), record.Token)
}

// A reconnect through the handler reads and copies the member's record while
// the worlds they are in keep writing it. Run under -race.
func TestHandleWebSocketConnection_ReconnectDoesNotRaceTheWorldsWritingTheRecord(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	server := NewServer(context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	route := newConnectRoute(t, server, authClient)
	hub, _ := server.HubSession()

	route.connect(t, "first-token")
	record, ok := server.PlayerByID(authClient.memberID)
	require.True(t, ok)

	stop := make(chan struct{})
	var writers sync.WaitGroup
	writers.Add(1)
	go func() {
		defer writers.Done()
		for {
			select {
			case <-stop:
				return
			default:
				server.setCurrentWorld(record, hub.ID)
				server.forgetCurrentWorld(record)
			}
		}
	}()

	for range 5 {
		route.connect(t, "again-token")
	}

	close(stop)
	writers.Wait()

	record, ok = server.PlayerByID(authClient.memberID)
	require.True(t, ok)
	assert.Equal(t, types.BearerToken("again-token"), record.Token)
}
