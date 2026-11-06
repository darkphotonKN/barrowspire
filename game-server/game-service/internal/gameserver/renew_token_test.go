package gameserver

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// FS-ZPX58 R27-R31: a client renews its access token over REST and hands the new
// one to game-service with renew_token, so the token this pod forwards to
// items-service when it seats the member does not expire 60 minutes into one
// connection (option A of FS-ZPX58 Follow-up 3).

const (
	renewTokenAction   = "renew_token"
	tokenRenewedAction = "token_renewed"
)

// tokenAuth is auth-service's ValidateToken as the real one answers it, keyed by
// the token's text: "access:<member>" is a valid access token for that member,
// "refresh:<member>" a refresh token (refused since FS-ZPX58 R25: Valid false
// and an error), "down" an unreachable auth-service, anything else garbage.
type tokenAuth struct {
	MockAuthClient
	mu    sync.Mutex
	asked []string
}

func (a *tokenAuth) ValidateToken(_ context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	a.mu.Lock()
	a.asked = append(a.asked, req.Token)
	a.mu.Unlock()

	switch {
	case strings.HasPrefix(req.Token, "access:"):
		return &pb.ValidateTokenResponse{Valid: true, MemberId: strings.TrimPrefix(req.Token, "access:")}, nil
	case req.Token == "down":
		return nil, status.Error(codes.Unavailable, "connection refused")
	default:
		return &pb.ValidateTokenResponse{Valid: false}, errors.New(`token type "refresh" is not access`)
	}
}

func (a *tokenAuth) askedCount() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return len(a.asked)
}

// renewRig is a server whose member Wren connected with "old-token" on conn,
// with a second copy of the record mapped to conn the way the handler maps it.
type renewRig struct {
	server     *Server
	auth       *tokenAuth
	items      *loadoutAuthRecorder
	characters *fakeCharacters
	memberID   uuid.UUID
	conn       *websocket.Conn
}

func newRenewRig(t *testing.T) *renewRig {
	t.Helper()
	rig := &renewRig{auth: &tokenAuth{}, items: &loadoutAuthRecorder{}, characters: newFakeCharacters(), memberID: uuid.New(), conn: &websocket.Conn{}}
	rig.server = newTestServer(t, context.Background(), rig.auth, NewMockQueueService(), &MockEventEmitter{}, rig.items, rig.characters, testPodID, testPodAddr, noopAnnouncer{})

	connected, _ := rig.server.connectPlayer(rig.memberID, "Wren", "old-token")
	rig.server.MapConnToPlayer(rig.conn, connected.ID, make(chan interface{}, clientWriterBuffer))
	return rig
}

// heldTokens is the token on every copy of the member's record.
func (r *renewRig) heldTokens(t *testing.T) []types.BearerToken {
	t.Helper()
	stored, ok := r.server.PlayerByID(r.memberID)
	require.True(t, ok)
	connCopy, ok := r.server.GetPlayerFromConn(r.conn)
	require.True(t, ok)
	return []types.BearerToken{r.server.tokenOf(stored), r.server.tokenOf(connCopy)}
}

// R28, R29: a valid access token for the member this connection authenticated
// as replaces the held token on every copy of the record, and the next seat
// loads their gear with it.
func TestRenewToken_ReplacesTheHeldTokenAndTheNextSeatUsesIt(t *testing.T) {
	rig := newRenewRig(t)
	fresh := "access:" + rig.memberID.String()

	require.NoError(t, rig.server.RenewToken(context.Background(), rig.conn, fresh))

	assert.Equal(t, []types.BearerToken{types.BearerToken(fresh), types.BearerToken(fresh)}, rig.heldTokens(t))

	mage := rig.characters.give(rig.memberID, "mage", "Wren", 3, 100)
	_, err := rig.server.EnterHub(context.Background(), rig.conn, mage.ID.String())
	require.NoError(t, err)
	assert.Equal(t, []string{"Bearer " + fresh}, rig.items.last(t), "the seat reads gear with the renewed token")
}

// R28: every refusal keeps the old token. The member is the connection's, never
// anything the message says, so a valid token for someone else is refused.
func TestRenewToken_Refusals_KeepTheOldToken(t *testing.T) {
	cases := map[string]func(member uuid.UUID) string{
		"an access token for another member": func(uuid.UUID) string { return "access:" + uuid.New().String() },
		"a refresh token":                    func(m uuid.UUID) string { return "refresh:" + m.String() },
		"an expired or garbage token":        func(uuid.UUID) string { return "not-a-jwt" },
		"a subject that is not a uuid":       func(uuid.UUID) string { return "access:not-a-uuid" },
		"auth-service unreachable":           func(uuid.UUID) string { return "down" },
		"no token at all":                    func(uuid.UUID) string { return "" },
	}
	for name, token := range cases {
		t.Run(name, func(t *testing.T) {
			rig := newRenewRig(t)

			err := rig.server.RenewToken(context.Background(), rig.conn, token(rig.memberID))

			assert.Error(t, err)
			assert.Equal(t, []types.BearerToken{"old-token", "old-token"}, rig.heldTokens(t))
		})
	}
}

// R28: a connection with no player behind it renews nothing.
func TestRenewToken_UnknownConnection_IsRefused(t *testing.T) {
	rig := newRenewRig(t)

	err := rig.server.RenewToken(context.Background(), &websocket.Conn{}, "access:"+rig.memberID.String())

	assert.ErrorIs(t, err, errPlayerNotFound)
	assert.Zero(t, rig.auth.askedCount(), "nothing to check a token against")
}

// R29: the swap holds the server's lock, so seats reading the token while it is
// renewed never race it. Run with -race.
func TestRenewToken_RacesNoSeat(t *testing.T) {
	rig := newRenewRig(t)
	player, ok := rig.server.PlayerByID(rig.memberID)
	require.True(t, ok)

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			_ = rig.server.RenewToken(context.Background(), rig.conn, "access:"+rig.memberID.String())
		}()
		go func() {
			defer wg.Done()
			_ = rig.server.CheckLoadout(context.Background(), player)
			_ = rig.server.tokenOf(player)
		}()
	}
	wg.Wait()
}

// R27, R30: renew_token is handled on the connection, wherever its player is,
// and answered token_renewed; a refusal answers on renew_token and the socket
// stays.
func TestHubRun_RenewToken_AnsweredOnTheConnection(t *testing.T) {
	for _, where := range []string{"no world", "a run"} {
		t.Run(where, func(t *testing.T) {
			auth := &tokenAuth{}
			server := newTestServer(t, context.Background(), auth, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
			conn := &websocket.Conn{}
			player := &types.Player{ID: uuid.New(), Username: "Wren", Token: "old-token"}
			if where == "a run" {
				player.CurrentGameSessionId = uuid.New()
			}
			registerTestConn(server, conn, player)
			inbox := startSoloListen(t, server, conn)

			server.serverChan <- types.ClientPackage{Conn: conn, Message: types.Message{
				Action:  renewTokenAction,
				Payload: map[string]interface{}{"token": "access:" + player.ID.String()},
			}}

			reply, answered := inbox.await(tokenRenewedAction, renewTokenAction)
			require.True(t, answered, "renew_token was never answered")
			assert.Equal(t, tokenRenewedAction, reply.Action, "error: %v", reply.Error)
			assert.Nil(t, reply.Error)
		})
	}
}

func TestHubRun_RenewToken_RefusedButConnected(t *testing.T) {
	server := newTestServer(t, context.Background(), &tokenAuth{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren", Token: "old-token"}
	registerTestConn(server, conn, player)
	inbox := startSoloListen(t, server, conn)

	server.serverChan <- types.ClientPackage{Conn: conn, Message: types.Message{
		Action:  renewTokenAction,
		Payload: map[string]interface{}{"token": "access:" + uuid.New().String()},
	}}

	reply, answered := inbox.await(tokenRenewedAction, renewTokenAction)
	require.True(t, answered)
	assert.Equal(t, renewTokenAction, reply.Action)
	require.NotNil(t, reply.Error, "a refusal")
	assert.Equal(t, renewTokenRefused, *reply.Error)

	_, still := server.GetPlayerFromConn(conn)
	assert.True(t, still, "a refused renewal never disconnects")
	assert.Equal(t, types.BearerToken("old-token"), server.tokenOf(player))
}

// R31: at most one renew_token per second per connection is handled; the
// rest are refused without asking auth-service.
func TestHubRun_RenewToken_RateLimited(t *testing.T) {
	auth := &tokenAuth{}
	server := newTestServer(t, context.Background(), auth, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren", Token: "old-token"}
	registerTestConn(server, conn, player)
	inbox := startSoloListen(t, server, conn)

	send := func() {
		server.serverChan <- types.ClientPackage{Conn: conn, Message: types.Message{
			Action:  renewTokenAction,
			Payload: map[string]interface{}{"token": "access:" + player.ID.String()},
		}}
	}
	send()
	send()

	var renewed, limited int
	for i := 0; i < 2; i++ {
		reply, answered := inbox.await(tokenRenewedAction, renewTokenAction)
		require.True(t, answered)
		if reply.Action == tokenRenewedAction {
			renewed++
		} else if reply.Error != nil && *reply.Error == renewTokenTooSoon {
			limited++
		}
	}
	assert.Equal(t, 1, renewed)
	assert.Equal(t, 1, limited)
	assert.Equal(t, 1, auth.askedCount(), "the limited one never reaches auth-service")
}

func TestRenewLimiter_OnePerSecondPerConnection(t *testing.T) {
	limiter := newRenewLimiter(time.Second)
	a, b := &websocket.Conn{}, &websocket.Conn{}
	t0 := time.Unix(1_800_000_000, 0)

	assert.True(t, limiter.allow(a, t0))
	assert.False(t, limiter.allow(a, t0.Add(999*time.Millisecond)))
	assert.True(t, limiter.allow(b, t0.Add(999*time.Millisecond)), "per connection")
	assert.True(t, limiter.allow(a, t0.Add(time.Second)))
}
