package gameserver

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// enter_hub while the record names a live run must not seat a second body:
// the run keeps the one it was entered with whoever asks, as it already does
// for another character (FS-BDA7X §Requirements 7). Two bodies mean two worlds
// broadcasting to one client, which the client renders as a delver jittering
// between two positions (reported 2026-10-29). Whether the member is refused
// or resumed into the run is the owner's call; neither seats them in the hub.
func TestEnterHub_WhileInARun_SeatsNoSecondBody(t *testing.T) {
	server := NewServer(context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()
	wren, conn := enterHub(t, server, "Wren")
	run := server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{wren}})
	t.Cleanup(run.Shutdown)
	require.False(t, hub.HasPlayer(wren.ID))

	// the same character, as the main menu's DELVE sends it
	_, err := server.JoinHub(conn, wren.Character)

	if err == nil {
		rec, _ := server.PlayerByID(wren.ID)
		assert.Equal(t, run.ID, rec.CurrentGameSessionId, "accepted, so it must be a resume into the run")
	}
	assert.False(t, hub.HasPlayer(wren.ID), "the hub seated a second body for a member still in a run")
	assert.True(t, run.HasPlayer(wren.ID), "the run lost the body it was entered with")
}
