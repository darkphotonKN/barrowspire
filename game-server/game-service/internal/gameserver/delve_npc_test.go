package gameserver

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// npcsIn collects the NPCs a world holds.
func npcsIn(entities []*ecs.Entity) []*components.NPCComponent {
	found := make([]*components.NPCComponent, 0)
	for _, entity := range entities {
		if comp, ok := entity.GetComponent(ecs.ComponentTypeNPC); ok {
			found = append(found, comp.(*components.NPCComponent))
		}
	}
	return found
}

// A function NPC is how anything in the hub is reached. They stand still, so
// their placement is map data: a delver has to be able to tell someone where to
// stand. FS-29KSH §Requirements 9, 29.
func TestHub_HoldsItsFunctionNPCs(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()

	npcs := npcsIn(hub.EntityManager.GetAllEntities())

	byFunction := map[components.NPCFunction]*components.NPCComponent{}
	for _, npc := range npcs {
		assert.NotEmpty(t, npc.Name, "a delver has to be able to tell who they are talking to")
		byFunction[npc.Function] = npc
	}

	// the Warden tells the hub's story and opens nothing: the Spire is entered
	// at its door, not through him. FS-0XMCP §Requirements 23.
	assert.Equal(t, []components.NPCFunction{components.NPCFunctionStorekeeper, components.NPCFunctionStoryteller},
		functionsOf(npcs), "the hub's function NPCs")
	require.Contains(t, byFunction, components.NPCFunctionStoryteller, "no one to tell how the Spire came")
	assert.Equal(t, "Spirewarden", byFunction[components.NPCFunctionStoryteller].Name)
	assert.Equal(t, [2]float64{constants.HubSpawnX + 140, constants.HubSpawnY - 120},
		npcPositions(hub.EntityManager.GetAllEntities())[components.NPCFunctionStoryteller], "he stands where he always has")
	assert.Contains(t, byFunction, components.NPCFunctionStorekeeper, "no one to gear you up")

	t.Run("and stands where the map put them", func(t *testing.T) {
		second := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
		otherHub, _ := second.HubSession()

		assert.Equal(t,
			npcPositions(hub.EntityManager.GetAllEntities()),
			npcPositions(otherHub.EntityManager.GetAllEntities()),
			"two clients must find them in the same places")
	})

	t.Run("and is close enough to talk to", func(t *testing.T) {
		for _, entity := range hub.EntityManager.GetAllEntities() {
			if _, isNPC := entity.GetComponent(ecs.ComponentTypeNPC); !isNPC {
				continue
			}
			comp, ok := entity.GetComponent(ecs.ComponentTypeInteractable)
			require.True(t, ok, "an NPC nobody can reach is decoration")
			assert.Greater(t, comp.(*components.InteractableComponent).Range, 0.0)
		}
	})

	_ = constants.HubSpawnX
}

// functionsOf lists the function NPCs' functions, sorted, residents skipped.
func functionsOf(npcs []*components.NPCComponent) []components.NPCFunction {
	functions := make([]components.NPCFunction, 0)
	for _, npc := range npcs {
		if npc.Function != components.NPCFunctionNone {
			functions = append(functions, npc.Function)
		}
	}
	slices.Sort(functions)
	return functions
}

// npcPositions maps each *function* NPC to where they stand. Keyed by function
// rather than indexed, because entity iteration order is not guaranteed. Residents
// are skipped, since they share the empty function and are supposed to be
// somewhere different every time you look.
func npcPositions(entities []*ecs.Entity) map[components.NPCFunction][2]float64 {
	positions := map[components.NPCFunction][2]float64{}

	for _, entity := range entities {
		npcComp, isNPC := entity.GetComponent(ecs.ComponentTypeNPC)
		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)

		if !isNPC || !hasTransform {
			continue
		}

		npc := npcComp.(*components.NPCComponent)
		if npc.Function == components.NPCFunctionNone {
			continue
		}

		transform := transformComp.(*components.TransformComponent)
		positions[npc.Function] = [2]float64{transform.X, transform.Y}
	}

	return positions
}

// Standing in the hub is not being in a game. The resume check predates the hub
// and asked only whether the player was in *a* session. Everyone now is, so
// asking to delve resumed them into the hub they were already standing in and
// never queued them. FS-29KSH §Requirements 26.
func TestFindGame_FromTheHub_Queues(t *testing.T) {
	queue := NewMockQueueService()
	server := newTestServer(t, context.Background(), &MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Wren"})
	require.NoError(t, err)
	require.Equal(t, hub.ID, player.CurrentGameSessionId)

	walkToSpireGate(t, server, conn, player.ID)
	server.serverChan <- types.ClientPackage{
		Conn: conn,
		Message: types.Message{
			Action:  string(constants.ActionFindGame),
			Payload: map[string]interface{}{"class": "mage"},
		},
	}

	require.Eventually(t, func() bool {
		queue.mu.Lock()
		defer queue.mu.Unlock()
		return len(queue.players) == 1
	}, 2*time.Second, 20*time.Millisecond,
		"a delver who asked to descend was never queued")
}

// The whole loop, from the hub side: two delvers walk to the Spire's door, ask
// to descend, and end up in one run together, out of the hub.
// FS-29KSH §Requirements 26, 28, §Edge States (Concurrent); FS-0XMCP R12.
func TestTwoDelversDescend_MatchIntoOneRun(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()

	conns := map[uuid.UUID]*websocket.Conn{}
	for _, name := range []string{"Wren", "Kaelen"} {
		conn := &websocket.Conn{}
		player := &types.Player{ID: uuid.New(), Username: name}
		registerTestConn(server, conn, player)
		_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: name})
		require.NoError(t, err)

		headForSpireGate(t, server, conn, player.ID)
		conns[player.ID] = conn
	}

	for playerID, conn := range conns {
		require.Eventually(t, func() bool {
			return hub.AtGate(playerID, components.GateDestinationSpire)
		}, spireGateWalk, 20*time.Millisecond, "never reached the Spire's door on foot")

		server.serverChan <- types.ClientPackage{
			Conn: conn,
			Message: types.Message{
				Action:  string(constants.ActionFindGame),
				Payload: map[string]interface{}{"class": "mage"},
			},
		}
	}

	require.Eventually(t, func() bool {
		server.mu.RLock()
		defer server.mu.RUnlock()
		return len(server.sessions) == 4 // the hub, the Meadows, the Forest, plus one run
	}, 3*time.Second, 20*time.Millisecond, "the two delvers never got a run")

	assert.Empty(t, hub.GetPlayerIDs(), "both left the hub to descend")
}
