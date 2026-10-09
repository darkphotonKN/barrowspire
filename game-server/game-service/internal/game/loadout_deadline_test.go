package game

import (
	"context"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// hangingLoadoutClient is an items service that never answers a loadout fetch
// until its caller gives up.
type hangingLoadoutClient struct {
	mockItemsClient
	hadDeadline bool
}

func (c *hangingLoadoutClient) GetLoadoutWithItems(ctx context.Context, req *pb.GetLoadoutWithItemsRequest) (*pb.GetLoadoutWithItemsResponse, error) {
	_, c.hadDeadline = ctx.Deadline()
	<-ctx.Done()
	return nil, ctx.Err()
}

// A hanging items service at seat time never holds the world's lock for good:
// seating returns within the loadout deadline and the delver is seated with no
// loadout. I-77AB6-12.
func TestAddPlayer_LoadoutFetchHangs_SeatsWithoutLoadoutWithinTheDeadline(t *testing.T) {
	s, _ := equipRun(t, nil)
	client := &hangingLoadoutClient{}
	s.itemsClient = client

	seated := make(chan uuid.UUID, 1)
	go func() {
		seated <- s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3})
	}()

	var playerEntityID uuid.UUID
	select {
	case playerEntityID = <-seated:
	case <-time.After(loadoutLoadTimeout + 2*time.Second):
		t.Fatal("seating did not return within the loadout deadline")
	}

	assert.True(t, client.hadDeadline, "the loadout fetch carries a deadline")
	_, ok := s.EntityManager.GetEntity(playerEntityID)
	require.True(t, ok, "the delver is seated")
	assert.Empty(t, wornIDs(t, s, playerEntityID), "seated without a loadout")
	assert.Empty(t, inventory(t, s, playerEntityID).ItemIDs)
}
