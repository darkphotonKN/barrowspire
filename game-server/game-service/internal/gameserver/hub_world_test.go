package gameserver

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The hub is a world type, not a run: it exists before anyone connects and
// outlives every run. FS-29KSH §Requirements 1.
func TestNewServer_BuildsTheHubWorld(t *testing.T) {
	server := NewServer(context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})

	t.Run("only the hub and the Meadows channel exist with nobody connected", func(t *testing.T) {
		server.mu.RLock()
		defer server.mu.RUnlock()

		// the Meadows is built beside the hub at boot (FS-X2F2H §Requirements 4)
		assert.Len(t, server.sessions, 2, "the hub and one field, and no runs")
	})

	t.Run("it is reachable as the hub", func(t *testing.T) {
		hub, exists := server.HubSession()

		require.True(t, exists)
		require.NotNil(t, hub)
		assert.NotEqual(t, uuid.Nil, hub.ID)
	})

	t.Run("the hub is the session that is registered", func(t *testing.T) {
		hub, _ := server.HubSession()

		registered, exists := server.GetGameSession(hub.ID)

		require.True(t, exists, "the hub must be routable like any other world")
		assert.Same(t, hub, registered)
	})
}
