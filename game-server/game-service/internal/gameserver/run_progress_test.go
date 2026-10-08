package gameserver

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A run's progress lands on the player record's character in play, so the HUB
// seats them at the run's resulting level before character-service has
// consumed the run's end. FS-BDA7X §Requirements 24; §Acceptance Criteria
// "Persistence".
func TestApplyRunProgress_HubSeatsTheRunsResult(t *testing.T) {
	characters := newFakeCharacters()
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters)
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	warrior := characters.give(player.ID, "warrior", "Wren", 1, 90)
	_, err := server.EnterHub(context.Background(), conn, warrior.ID.String())
	require.NoError(t, err)
	run := server.CreateGameSession([]*types.Player{player})

	server.ApplyRunProgress([]types.RunProgress{{
		MemberID: player.ID, CharacterID: warrior.ID, Gained: 150, Seated: true, Level: 3, Experience: 240,
	}})
	server.ReturnPlayersToHub(run.ID)

	stored, ok := server.GetPlayerFromConn(conn)
	require.True(t, ok)
	assert.Equal(t, 3, stored.Character.Level)
	assert.Equal(t, int64(240), stored.Character.Experience)
	home := seatedStats(t, hub, player.ID)
	assert.Equal(t, 3, home.Level, "home at the run's level")
	assert.Equal(t, 240, home.Experience)
}

// What the record keeps for each kind of member, and whose record it touches.
// FS-BDA7X §Requirements 24.
func TestApplyRunProgress_RecordKeepsTheRunsResult(t *testing.T) {
	characterID := uuid.New()
	tests := []struct {
		name      string
		seated    types.CharacterInPlay
		progress  types.RunProgress
		wantLevel int
		wantExp   int64
	}{
		{
			"seated: where the body finished",
			types.CharacterInPlay{ID: characterID, Level: 1, Experience: 90},
			types.RunProgress{CharacterID: characterID, Gained: 10, Seated: true, Level: 2, Experience: 100},
			2, 100,
		},
		{
			"removed: what it earned on top of the record",
			types.CharacterInPlay{ID: characterID, Level: 1, Experience: 90},
			types.RunProgress{CharacterID: characterID, Gained: 150},
			3, 240,
		},
		{
			"removed: never below the seated level",
			types.CharacterInPlay{ID: characterID, Level: 5, Experience: 90},
			types.RunProgress{CharacterID: characterID, Gained: 10},
			5, 100,
		},
		{
			"another character in play now: untouched",
			types.CharacterInPlay{ID: characterID, Level: 1, Experience: 90},
			types.RunProgress{CharacterID: uuid.New(), Gained: 500},
			1, 90,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())
			conn := &websocket.Conn{}
			player := &types.Player{ID: uuid.New(), Username: "Wren", Character: tt.seated}
			registerTestConn(server, conn, player)

			tt.progress.MemberID = player.ID
			server.ApplyRunProgress([]types.RunProgress{tt.progress})

			stored, ok := server.GetPlayerFromConn(conn)
			require.True(t, ok)
			assert.Equal(t, tt.wantLevel, stored.Character.Level)
			assert.Equal(t, tt.wantExp, stored.Character.Experience)
		})
	}
}

// A member no longer connected has no record to keep it; nothing breaks.
func TestApplyRunProgress_UnknownMember_Ignored(t *testing.T) {
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())

	assert.NotPanics(t, func() {
		server.ApplyRunProgress([]types.RunProgress{{MemberID: uuid.New(), CharacterID: uuid.New(), Gained: 10}})
	})
}
