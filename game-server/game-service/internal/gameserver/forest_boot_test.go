package gameserver

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	grpcauth "github.com/darkphotonKN/barrowspire-server/game-service/grpc/auth"
	grpcitems "github.com/darkphotonKN/barrowspire-server/game-service/grpc/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-3QHQZ §B Requirements 10, 11, 13; Acceptance Criteria "Forest world (§B)"
// 1, 2 and "A forced generator error"; Edge States "Generator boxed in",
// "Pod restart". I-3QHQZ-2.

// withForestParams builds the pod's Forest from p instead of the Forest's own
// parameters, so a test can force the generator to fail.
func withForestParams(p levelgen.Params) Option {
	return func(o *bootOptions) { o.forestParams = p }
}

// newTestServer is NewServer for a test: a construction error fails it.
func newTestServer(t testing.TB, ctx context.Context, authClient grpcauth.AuthClient, queueService QueueManager, eventEmitter game.EventEmitter, itemsClient grpcitems.ItemsClient, characters CharacterReader, podID, podAddr string, announcer HandoffAnnouncer, opts ...Option) *Server {
	t.Helper()

	server, err := NewServer(ctx, authClient, queueService, eventEmitter, itemsClient, characters, podID, podAddr, announcer, opts...)
	require.NoError(t, err)
	return server
}

// bootedServer is a server built with opts and otherwise idle doubles.
func bootedServer(t *testing.T, opts ...Option) *Server {
	t.Helper()

	return newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{}, opts...)
}

// The pod builds one Forest at boot from the boot seed, a field world of the
// Forest's size whose walls are the seed's layout. R10, R11, R13.
func TestNewServer_BuildsTheForestFromTheBootSeed(t *testing.T) {
	const seed uint64 = 424242
	generated, err := levelgen.Generate(levelgen.ForestParams, seed)
	require.NoError(t, err)

	server := bootedServer(t, WithBootSeed(seed))

	forest, ok := server.FieldSession(game.FieldForlornForest)
	require.True(t, ok, "the server builds the Forest at startup")
	assert.Equal(t, types.WorldTypeField, forest.WorldType())

	place, ok := forest.FieldPlace()
	require.True(t, ok)
	assert.Equal(t, constants.ForestMapWidth, place.Width)
	assert.Equal(t, constants.ForestMapHeight, place.Height)
	assert.Equal(t, generated.Entrance.At.X, place.Entrance.X, "the gate stands at the seed's entrance")
	assert.Equal(t, generated.Entrance.At.Y, place.Entrance.Y, "the gate stands at the seed's entrance")
	want := make([]rect, 0, len(generated.Walls))
	for _, wall := range generated.Walls {
		want = append(want, rect{X: wall.X, Y: wall.Y, W: wall.W, H: wall.H})
	}
	walls := wallsIn(forest.EntityManager.GetAllEntities())
	assert.ElementsMatch(t, want, walls, "one wall per layout rect, at the rect")
	assert.LessOrEqual(t, len(walls), levelgen.ForestParams.WallBudget)
}

// Each boot draws its own seed: two pods (or one pod restarted) generally
// stand different forests. Edge States "Pod restart", "Players on different pods".
func TestNewServer_DrawsAFreshSeedEachBoot(t *testing.T) {
	entrances := map[game.FieldPoint]bool{}
	for range 5 {
		forest, ok := bootedServer(t).FieldSession(game.FieldForlornForest)
		require.True(t, ok)
		place, _ := forest.FieldPlace()
		entrances[place.Entrance] = true
	}

	assert.Greater(t, len(entrances), 1, "five boots stood the same forest")
}

// A generator that cannot lay out the Forest fails the server's construction
// with the wrapped error, rather than serving no forest or a broken one. Edge
// States "Generator boxed in".
func TestNewServer_ForestThatCannotBeGenerated_FailsConstruction(t *testing.T) {
	boxedIn := levelgen.ForestParams
	boxedIn.Cols, boxedIn.Rows = 10, 10 // far too small for five branches
	boxedIn.Branches = levelgen.IntRange{Min: 5, Max: 5}
	boxedIn.RetryLimit = 3

	server, err := NewServer(context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{},
		WithBootSeed(7), withForestParams(boxedIn))

	require.ErrorIs(t, err, levelgen.ErrNoLayout)
	assert.Nil(t, server)
}
