package game

import (
	"context"
	"sync"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/metadata"
)

// credentialRecordingClient is the items service, recording the authorization
// metadata each call arrives with.
type credentialRecordingClient struct {
	countingItemsClient
	mu   sync.Mutex
	seen map[string][][]string
}

func (c *credentialRecordingClient) record(ctx context.Context, method string) {
	md, _ := metadata.FromOutgoingContext(ctx)

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.seen == nil {
		c.seen = map[string][][]string{}
	}
	c.seen[method] = append(c.seen[method], md.Get("authorization"))
}

func (c *credentialRecordingClient) calls(method string) [][]string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.seen[method]
}

func (c *credentialRecordingClient) ListItemTemplates(ctx context.Context) (*pb.ListItemTemplatesResponse, error) {
	c.record(ctx, "ListItemTemplates")
	return c.countingItemsClient.ListItemTemplates(ctx)
}

func (c *credentialRecordingClient) ListItemRarities(ctx context.Context) (*pb.ListItemRaritiesResponse, error) {
	c.record(ctx, "ListItemRarities")
	return c.countingItemsClient.ListItemRarities(ctx)
}

func (c *credentialRecordingClient) GetLoadoutWithItems(ctx context.Context, req *pb.GetLoadoutWithItemsRequest) (*pb.GetLoadoutWithItemsResponse, error) {
	c.record(ctx, "GetLoadoutWithItems")
	return c.countingItemsClient.GetLoadoutWithItems(ctx, req)
}

// Worn gear belongs to the member, so the world loads it as them: the loadout
// call carries the member's own bearer token, and items-service still checks
// the caller owns the loadout.
func TestSeat_LoadsTheLoadoutAsThePlayer(t *testing.T) {
	client := &credentialRecordingClient{}
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, client, RunBounds())

	entityID := s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "member-token")

	require.Equal(t, [][]string{{"Bearer member-token"}}, client.calls("GetLoadoutWithItems"))
	assert.Len(t, wornIDs(t, s, entityID), 1, "the loadout loaded, so the delver wears its weapon")
}

// The catalogue (base types and rarity weights) is no member's: it is read
// once per world with no player behind the call, so no token rides on it.
func TestCatalogueReads_CarryNoPlayerToken(t *testing.T) {
	client := &credentialRecordingClient{}
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, client, RunBounds())

	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "member-token")
	s.InitialMapObjects()

	for _, method := range []string{"ListItemTemplates", "ListItemRarities"} {
		calls := client.calls(method)
		require.NotEmpty(t, calls, "%s was read", method)
		for _, authorization := range calls {
			assert.Empty(t, authorization, "%s carries no token", method)
		}
	}
}

// A member with no token on record is still seated; the loadout call goes out
// with no authorization at all rather than an empty bearer, items-service
// refuses it, and the delver arrives without gear.
func TestSeat_WithoutAToken_SendsNoAuthorization(t *testing.T) {
	client := &credentialRecordingClient{}
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, client, RunBounds())

	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")

	require.Len(t, client.calls("GetLoadoutWithItems"), 1)
	assert.Empty(t, client.calls("GetLoadoutWithItems")[0])
}
