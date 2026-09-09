package gameserver

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The hub is a world type, not a run: it exists before anyone connects and
// outlives every run. FS-0008 §Requirements 1.
func TestNewServer_BuildsTheHubWorld(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{})

	t.Run("exactly one session exists with nobody connected", func(t *testing.T) {
		server.mu.RLock()
		defer server.mu.RUnlock()

		assert.Len(t, server.sessions, 1, "the hub, and no runs")
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
