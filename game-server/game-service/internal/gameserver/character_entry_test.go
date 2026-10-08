package gameserver

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeCharacters stands in for character-service: characters per member, every
// read scoped by member, so another member's character is not found.
type fakeCharacters struct {
	mu    sync.Mutex
	owned map[uuid.UUID]map[uuid.UUID]types.CharacterInPlay
	// down makes every read fail the way an unreachable service does
	down bool
}

func newFakeCharacters() *fakeCharacters {
	return &fakeCharacters{owned: map[uuid.UUID]map[uuid.UUID]types.CharacterInPlay{}}
}

// give creates a character for the member and returns it.
func (f *fakeCharacters) give(memberID uuid.UUID, class, name string, level int, experience int64) types.CharacterInPlay {
	f.mu.Lock()
	defer f.mu.Unlock()

	character := types.CharacterInPlay{ID: uuid.New(), Name: name, Class: class, Level: level, Experience: experience}
	if f.owned[memberID] == nil {
		f.owned[memberID] = map[uuid.UUID]types.CharacterInPlay{}
	}
	f.owned[memberID][character.ID] = character

	return character
}

func (f *fakeCharacters) GetCharacter(ctx context.Context, memberID, characterID uuid.UUID) (types.CharacterInPlay, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.down {
		return types.CharacterInPlay{}, errors.New("character service: connection refused")
	}

	character, ok := f.owned[memberID][characterID]
	if !ok {
		return types.CharacterInPlay{}, fmt.Errorf("character %s: %w", characterID, types.ErrCharacterNotFound)
	}

	return character, nil
}

// sendEnterHub sends enter_hub with the payload as a client would.
func sendEnterHub(server *Server, conn *websocket.Conn, payload map[string]interface{}) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: string(constants.ActionEnterHub), Payload: payload},
	}
}

// seatedStats finds the member's body in a world.
func seatedStats(t *testing.T, world *game.Session, memberID uuid.UUID) *components.StatsComponent {
	t.Helper()

	for _, entity := range world.EntityManager.GetAllEntities() {
		pc, ok := entity.GetComponent(ecs.ComponentTypePlayer)
		if !ok || pc.(*components.PlayerComponent).MemberID != memberID {
			continue
		}
		sc, _ := entity.GetComponent(ecs.ComponentTypeStats)
		return sc.(*components.StatsComponent)
	}

	t.Fatalf("member %s has no body in world %s", memberID, world.ID)
	return nil
}

// The client enters with a character id. Class, name, level and experience
// come from character-service's record, never from the payload.
// FS-BDA7X §Requirements 5, 18.
func TestEnterHub_SeatsTheResolvedCharacterAtItsLevel(t *testing.T) {
	characters := newFakeCharacters()
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters)
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "account-name"}
	msgCh := registerTestConn(server, conn, player)
	archer := characters.give(player.ID, "archer", "Wren", 5, 640)

	sendEnterHub(server, conn, map[string]interface{}{
		"characterId":   archer.ID.String(),
		"class":         "mage",
		"className":     "mage",
		"characterName": "Impostor",
		"username":      "Impostor",
	})
	awaitAction(t, msgCh, constants.ActionWorldEntered)

	stats := seatedStats(t, hub, player.ID)
	assert.Equal(t, 20, stats.Agility, "a level-5 archer: 8 + 4 × 3")
	assert.Equal(t, 5, stats.Level)
	assert.Equal(t, 640, stats.Experience)

	stored, ok := server.GetPlayerFromConn(conn)
	require.True(t, ok)
	assert.Equal(t, archer, stored.Character, "the character in play is on the player record")
}

// Entry is refused, visibly, and nothing is seated when the character id is
// missing, not the member's, or character-service cannot be reached.
// FS-BDA7X §Requirements 6, §Edge States.
func TestEnterHub_RefusesWithoutAResolvableCharacter(t *testing.T) {
	tests := []struct {
		name        string
		characterID func(characters *fakeCharacters, member uuid.UUID) interface{}
		down        bool
		wantMessage string
	}{
		{
			name:        "no character id",
			characterID: func(*fakeCharacters, uuid.UUID) interface{} { return nil },
			wantMessage: "Choose a character to enter with.",
		},
		{
			name: "another member's character",
			characterID: func(characters *fakeCharacters, _ uuid.UUID) interface{} {
				return characters.give(uuid.New(), "warrior", "Stranger", 3, 300).ID.String()
			},
			wantMessage: "That character could not be found. Choose another.",
		},
		{
			name:        "an unknown or deleted character",
			characterID: func(*fakeCharacters, uuid.UUID) interface{} { return uuid.New().String() },
			wantMessage: "That character could not be found. Choose another.",
		},
		{
			name:        "not an id at all",
			characterID: func(*fakeCharacters, uuid.UUID) interface{} { return "char_1712345" },
			wantMessage: "That character could not be found. Choose another.",
		},
		{
			name: "character-service down",
			characterID: func(characters *fakeCharacters, member uuid.UUID) interface{} {
				return characters.give(member, "mage", "Wren", 1, 0).ID.String()
			},
			down:        true,
			wantMessage: "Characters are unavailable right now. Try again shortly.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			characters := newFakeCharacters()
			server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters)
			hub, _ := server.HubSession()

			conn := &websocket.Conn{}
			player := &types.Player{ID: uuid.New(), Username: "Wren"}
			msgCh := registerTestConn(server, conn, player)

			payload := map[string]interface{}{"class": "mage", "characterName": "Wren"}
			if id := tt.characterID(characters, player.ID); id != nil {
				payload["characterId"] = id
			}
			characters.down = tt.down

			sendEnterHub(server, conn, payload)
			refusal := awaitAction(t, msgCh, constants.ActionEnterHub)

			require.NotNil(t, refusal.Error, "a refusal is an error frame")
			assert.Equal(t, tt.wantMessage, refusal.Payload["message"])
			assert.False(t, hub.HasPlayer(player.ID), "nothing is seated")

			stored, _ := server.GetPlayerFromConn(conn)
			assert.Equal(t, uuid.Nil, stored.CurrentGameSessionId, "and they are in no world")
			assert.Equal(t, types.CharacterInPlay{}, stored.Character, "and play no character")
		})
	}
}

// The character in play belongs to the player's server-held record, not to a
// world: it rides HUB → run → HUB. FS-BDA7X §Requirements 7.
func TestCharacterInPlay_RidesEveryWorldSwitch(t *testing.T) {
	characters := newFakeCharacters()
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters)
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	warrior := characters.give(player.ID, "warrior", "Wren", 5, 700)

	_, err := server.EnterHub(context.Background(), conn, warrior.ID.String())
	require.NoError(t, err)

	run := server.CreateGameSession([]*types.Player{player})
	runStats := seatedStats(t, run, player.ID)
	assert.Equal(t, 5, runStats.Level, "seated in the run at its level")
	assert.Equal(t, 16, runStats.Strength)

	server.ReturnPlayersToHub(run.ID)
	homeStats := seatedStats(t, hub, player.ID)
	assert.Equal(t, 5, homeStats.Level, "and home again at its level")
	assert.Equal(t, 17, homeStats.Vitality)
}

// A reconnect re-maps the connection from the server-held record, which still
// carries the character in play. FS-BDA7X §Requirements 7.
func TestCharacterInPlay_SurvivesAReconnect(t *testing.T) {
	characters := newFakeCharacters()
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters)

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	mage := characters.give(player.ID, "mage", "Wren", 4, 400)

	_, err := server.EnterHub(context.Background(), conn, mage.ID.String())
	require.NoError(t, err)
	run := server.CreateGameSession([]*types.Player{player})

	// the handler's reconnect path: the record is kept, and a new connection
	// is mapped from it
	server.markPlayerAsReconnecting(player)

	record, ok := server.playerByID(player.ID)
	require.True(t, ok)
	newConn := &websocket.Conn{}
	server.MapConnToPlayer(newConn, *record)

	reconnected, ok := server.GetPlayerFromConn(newConn)
	require.True(t, ok)
	assert.Equal(t, mage, reconnected.Character)
	assert.Equal(t, run.ID, reconnected.CurrentGameSessionId)
	assert.Equal(t, 4, seatedStats(t, run, player.ID).Level, "the run kept its body for the reconnect")
}

// find_game carries no character: the run seats the character in play, and a
// player with none is not queued. FS-BDA7X §Requirements 6–7.
func TestFindGame_WithoutACharacterInPlay_IsRefused(t *testing.T) {
	queue := NewMockQueueService()
	server := NewServer(&MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters())

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	msgCh := registerTestConn(server, conn, player)

	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: string(constants.ActionFindGame), Payload: map[string]interface{}{"class": "mage"}},
	}

	refusal := awaitAction(t, msgCh, constants.ActionFindGame)
	require.NotNil(t, refusal.Error)
	queue.mu.Lock()
	defer queue.mu.Unlock()
	assert.Empty(t, queue.players, "nobody is queued as a guessed character")
}

// Back in the HUB, entering again as another character re-seats the member as
// it: the body is the new character's, not the old one's under a new record.
// FS-BDA7X §Requirements 5, 7.
func TestEnterHub_AsAnotherCharacter_ReseatsAsThatCharacter(t *testing.T) {
	characters := newFakeCharacters()
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters)
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	warrior := characters.give(player.ID, "warrior", "Kaelen", 5, 700)
	mage := characters.give(player.ID, "mage", "Wren", 1, 0)

	_, err := server.EnterHub(context.Background(), conn, warrior.ID.String())
	require.NoError(t, err)
	_, err = server.EnterHub(context.Background(), conn, mage.ID.String())
	require.NoError(t, err)

	stats := seatedStats(t, hub, player.ID)
	assert.Equal(t, 1, stats.Level)
	assert.Equal(t, 0, stats.Experience)
	assert.Equal(t, 9, stats.Intelligence, "a level-1 mage")
	stored, _ := server.GetPlayerFromConn(conn)
	assert.Equal(t, mage, stored.Character)
}

// Mid-run, entering the HUB as another character is refused: the run keeps the
// character it was entered with, and the member stays where they are.
// FS-BDA7X §Requirements 7.
func TestEnterHub_AsAnotherCharacterMidRun_IsRefused(t *testing.T) {
	characters := newFakeCharacters()
	server := NewServer(&MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, characters)
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	warrior := characters.give(player.ID, "warrior", "Kaelen", 5, 700)
	mage := characters.give(player.ID, "mage", "Wren", 1, 0)

	_, err := server.EnterHub(context.Background(), conn, warrior.ID.String())
	require.NoError(t, err)
	run := server.CreateGameSession([]*types.Player{player})

	_, err = server.EnterHub(context.Background(), conn, mage.ID.String())

	assert.ErrorIs(t, err, game.ErrCharacterSwitchMidRun)
	assert.False(t, hub.HasPlayer(player.ID), "no second body in the HUB")
	assert.Equal(t, 5, seatedStats(t, run, player.ID).Level, "the run keeps its body")
	stored, _ := server.GetPlayerFromConn(conn)
	assert.Equal(t, warrior, stored.Character)
	assert.Equal(t, run.ID, stored.CurrentGameSessionId)
}
