package gameserver

import (
	"context"
	"sync"
	"testing"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/metadata"
)

// loadoutAuthRecorder is the items service, recording the authorization each
// loadout fetch arrives with.
type loadoutAuthRecorder struct {
	MockItemsClient
	mu   sync.Mutex
	auth [][]string
}

func (r *loadoutAuthRecorder) GetLoadoutWithItems(ctx context.Context, req *itemspb.GetLoadoutWithItemsRequest) (*itemspb.GetLoadoutWithItemsResponse, error) {
	md, _ := metadata.FromOutgoingContext(ctx)
	r.mu.Lock()
	r.auth = append(r.auth, md.Get("authorization"))
	r.mu.Unlock()
	return r.MockItemsClient.GetLoadoutWithItems(ctx, req)
}

func (r *loadoutAuthRecorder) last(t *testing.T) []string {
	t.Helper()
	r.mu.Lock()
	defer r.mu.Unlock()
	require.NotEmpty(t, r.auth, "no loadout was fetched")
	return r.auth[len(r.auth)-1]
}

// The token a member connects with is kept on their record, and a reconnect
// replaces it with the one they reconnect with.
func TestConnectPlayer_KeepsTheTokenAndAReconnectRefreshesIt(t *testing.T) {
	server := NewServer(context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
	memberID := uuid.New()

	player, reconnecting := server.connectPlayer(memberID, "Wren", "first-token")
	assert.False(t, reconnecting)
	assert.Equal(t, types.BearerToken("first-token"), player.Token)

	kept, ok := server.PlayerByID(memberID)
	require.True(t, ok)

	// the reconnect's own connection copy, as the handler maps it
	conn := &websocket.Conn{}
	server.MapConnToPlayer(conn, player.ID, make(chan interface{}, clientWriterBuffer))

	again, reconnecting := server.connectPlayer(memberID, "Wren", "second-token")
	assert.True(t, reconnecting)
	assert.Equal(t, types.BearerToken("second-token"), again.Token)

	record, ok := server.PlayerByID(memberID)
	require.True(t, ok)
	assert.Same(t, kept, record, "a reconnect keeps the record")
	assert.Equal(t, types.BearerToken("second-token"), record.Token)
	connCopy, ok := server.GetPlayerFromConn(conn)
	require.True(t, ok)
	assert.Equal(t, types.BearerToken("second-token"), connCopy.Token, "every copy of the record is refreshed")
}

// Every world that seats the member loads their gear as them: the hub on
// entry, the run they are matched into, and the hub they come home to.
func TestSeating_LoadsTheLoadoutWithTheHeldToken(t *testing.T) {
	items := &loadoutAuthRecorder{}
	characters := newFakeCharacters()
	server := NewServer(context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, items, characters)

	memberID := uuid.New()
	connected, _ := server.connectPlayer(memberID, "Wren", "hub-token")
	conn := &websocket.Conn{}
	server.MapConnToPlayer(conn, connected.ID, make(chan interface{}, clientWriterBuffer))
	player, ok := server.PlayerByID(memberID)
	require.True(t, ok)
	mage := characters.give(memberID, "mage", "Wren", 3, 100)

	_, err := server.EnterHub(context.Background(), conn, mage.ID.String())
	require.NoError(t, err)
	assert.Equal(t, []string{"Bearer hub-token"}, items.last(t), "the hub seat")

	run := server.CreateGameSession([]*types.Player{player})
	assert.Equal(t, []string{"Bearer hub-token"}, items.last(t), "the run seat")

	server.connectPlayer(memberID, "Wren", "fresh-token")
	server.ReturnPlayersToHub(run.ID)
	assert.Equal(t, []string{"Bearer fresh-token"}, items.last(t), "home again, with the refreshed token")
}
