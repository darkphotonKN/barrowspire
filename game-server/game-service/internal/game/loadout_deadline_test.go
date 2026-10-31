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
// or a checkout until its caller gives up.
type hangingLoadoutClient struct {
	mockItemsClient
	hadDeadline bool
}

func (c *hangingLoadoutClient) GetLoadoutWithItems(ctx context.Context, req *pb.GetLoadoutWithItemsRequest) (*pb.GetLoadoutWithItemsResponse, error) {
	_, c.hadDeadline = ctx.Deadline()
	<-ctx.Done()
	return nil, ctx.Err()
}

func (c *hangingLoadoutClient) CheckOutRunGear(ctx context.Context, req *pb.CheckOutRunGearRequest) (*pb.CheckOutRunGearResponse, error) {
	_, c.hadDeadline = ctx.Deadline()
	<-ctx.Done()
	return nil, ctx.Err()
}

// A hanging items service at seat time never holds the world's lock for good:
// seating returns within the loadout deadline and the delver is seated with no
// loadout. A run seat checks out, so the hang is the checkout's. I-77AB6-12;
// FS-18Z5F §C R15.
func TestAddPlayer_LoadoutFetchHangs_SeatsWithoutLoadoutWithinTheDeadline(t *testing.T) {
	s, _ := equipRun(t, nil)
	client := &hangingLoadoutClient{}
	s.itemsClient = client

	seated := make(chan uuid.UUID, 1)
	memberID := uuid.New()
	go func() {
		seated <- s.AddPlayer(memberID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 3}, "")
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
	assert.True(t, delverEntityLoadoutUnknown(t, s, memberID), "marked loadout unknown")
}
