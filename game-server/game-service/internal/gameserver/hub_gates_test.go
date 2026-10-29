package gameserver

import (
	"context"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// gateAt is a gate as a player meets it: where it stands and how close counts.
type gateAt struct {
	X, Y, Range float64
	Arrival     *components.GateArrival
}

// gatesIn maps each gate in a world to where it stands, keyed by destination
// because entity iteration order is not guaranteed.
func gatesIn(t *testing.T, entities []*ecs.Entity) map[components.GateDestination]gateAt {
	t.Helper()

	found := map[components.GateDestination]gateAt{}
	for _, entity := range entities {
		gateComp, isGate := entity.GetComponent(ecs.ComponentTypeGate)
		if !isGate {
			continue
		}

		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		require.True(t, hasTransform, "a gate nobody can find is not a place")
		interactableComp, hasRange := entity.GetComponent(ecs.ComponentTypeInteractable)
		require.True(t, hasRange, "a gate has to say how close counts")
		assert.False(t, entity.HasComponent(ecs.ComponentTypeNPC), "a gate is map data, not an NPC")

		gate := gateComp.(*components.GateComponent)
		transform := transformComp.(*components.TransformComponent)
		found[gate.Destination] = gateAt{
			X:       transform.X,
			Y:       transform.Y,
			Range:   interactableComp.(*components.InteractableComponent).Range,
			Arrival: gate.Arrival,
		}
	}

	return found
}

// The hub is the map: three places a player walks to, fixed in the hub's map
// data so every pod and every restart agrees where they are.
// FS-0XMCP §Requirements 1, 2, 4, 5.
func TestHub_HoldsItsThreeGates(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()

	gates := gatesIn(t, hub.EntityManager.GetAllEntities())

	assert.Equal(t, map[components.GateDestination]gateAt{
		components.GateDestinationSpire:   {X: 1000, Y: 50, Range: constants.GateRange},
		components.GateDestinationForest:  {X: 40, Y: 400, Range: constants.GateRange, Arrival: &components.GateArrival{X: 180, Y: 400}},
		components.GateDestinationMeadows: {X: 1960, Y: 360, Range: constants.GateRange, Arrival: &components.GateArrival{X: 1820, Y: 360}},
	}, gates)

	t.Run("the same on every server", func(t *testing.T) {
		second := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
		otherHub, _ := second.HubSession()

		assert.Equal(t, gates, gatesIn(t, otherHub.EntityManager.GetAllEntities()))
	})
}

// The client draws the gates from the hub's state, never from its own copy.
// FS-0XMCP §Requirements 6.
func TestHub_StateCarriesItsGates(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()

	stateSerializer := serializer.NewStateSerializer(hub.EntityManager)
	backendState, err := stateSerializer.SerializeBackendState(context.Background(), hub.ID, hub.WorldType(), hub.EntityManager.GetAllEntities())
	require.NoError(t, err)
	clientState := stateSerializer.FormatStateToClientState(backendState, uuid.New())

	destinations := make([]string, 0, len(clientState.Gates))
	for _, gate := range clientState.Gates {
		destinations = append(destinations, gate.Destination)
		assert.Equal(t, constants.GateRange, gate.Range)
	}
	assert.ElementsMatch(t, []string{"spire", "forest", "meadows"}, destinations)
}

// The at-gate query is asked from the server's goroutines while the hub ticks
// and moves the very body it measures. Run with -race. FS-0XMCP §Requirements 7.
func TestAtGate_WhileTheHubTicks(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(server, conn, player)
	_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Wren"})
	require.NoError(t, err)

	// walking, so every tick writes the body's transform
	hub.MessageCh <- types.ClientPackage{
		Conn: conn,
		Message: types.Message{
			Action: string(constants.ActionMove),
			Payload: map[string]interface{}{
				"player_id": player.ID.String(),
				"vx":        -1.0,
				"vy":        0.0,
			},
		},
	}

	deadline := time.Now().Add(300 * time.Millisecond)
	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for time.Now().Before(deadline) {
				for _, destination := range []components.GateDestination{
					components.GateDestinationSpire,
					components.GateDestinationForest,
					components.GateDestinationMeadows,
				} {
					// from the spawn, a third of a second's walk reaches none of them
					assert.False(t, hub.AtGate(player.ID, destination), "at the %s gate from the spawn", destination)
				}
			}
		}()
	}
	wg.Wait()
}

// A gate nobody can reach, or one a building half covers, is not a place; an
// arrival point inside the range would send a returning player straight back
// out. FS-0XMCP §Requirements 3.
func TestHub_GateLayout(t *testing.T) {
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, &MockItemsClient{}, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	hub, _ := server.HubSession()
	entities := hub.EntityManager.GetAllEntities()

	walls := wallsIn(entities)
	require.NotEmpty(t, walls)
	gates := gatesIn(t, entities)
	walkable := walkableFromSpawn(walls)

	tests := []struct {
		name        string
		destination components.GateDestination
		wantArrival bool
	}{
		{"the Spire gate", components.GateDestinationSpire, false},
		{"the Forest gate", components.GateDestinationForest, true},
		{"the Meadows gate", components.GateDestinationMeadows, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gate, ok := gates[tt.destination]
			require.True(t, ok, "the hub has no %s gate", tt.destination)

			for _, wall := range walls {
				assert.Greater(t, wall.distanceTo(gate.X, gate.Y), gate.Range,
					"a building stands inside the gate's range: %+v", wall)
			}

			assert.True(t, walkable.reaches(gate.X, gate.Y, gate.Range),
				"no walk from the spawn reaches the gate's range")

			if !tt.wantArrival {
				assert.Nil(t, gate.Arrival, "nobody comes back through this gate")
				return
			}

			require.NotNil(t, gate.Arrival, "a player coming back has nowhere to stand")
			arrival := *gate.Arrival
			assert.Greater(t, math.Hypot(arrival.X-gate.X, arrival.Y-gate.Y), gate.Range,
				"arriving would re-trigger the gate")
			for _, wall := range walls {
				assert.Greater(t, wall.distanceTo(arrival.X, arrival.Y), constants.PlayerRadius,
					"the arrival point is inside a building: %+v", wall)
			}
			assert.True(t, walkable.reaches(arrival.X, arrival.Y, walkStep),
				"the arrival point is cut off from the spawn")
		})
	}
}

// distanceTo is how far a point lies from the rectangle, zero inside it.
func (r rect) distanceTo(x, y float64) float64 {
	dx := math.Max(math.Max(r.X-x, 0), x-(r.X+r.W))
	dy := math.Max(math.Max(r.Y-y, 0), y-(r.Y+r.H))
	return math.Hypot(dx, dy)
}

// walkStep is the grid a walk is checked on, in px: finer than any wall is
// thick, so no wall is stepped over.
const walkStep = 10.0

// walkGrid is every point on the walk grid a body can reach from the spawn.
type walkGrid map[[2]int]bool

// walkableFromSpawn floods the hub from the spawn, a body's width clear of every
// wall and inside the movement clamp, the way MovementSystem lets a player go.
func walkableFromSpawn(walls []rect) walkGrid {
	minC, maxC := constants.PlayerRadius, constants.HubMapWidth-constants.PlayerRadius
	minR, maxR := constants.PlayerRadius, constants.HubMapHeight-constants.PlayerRadius

	at := func(cell [2]int) (float64, float64) {
		return float64(cell[0]) * walkStep, float64(cell[1]) * walkStep
	}
	open := func(cell [2]int) bool {
		x, y := at(cell)
		if x < minC || x > maxC || y < minR || y > maxR {
			return false
		}
		for _, wall := range walls {
			if wall.distanceTo(x, y) < constants.PlayerRadius {
				return false
			}
		}
		return true
	}

	start := [2]int{int(constants.HubSpawnX / walkStep), int(constants.HubSpawnY / walkStep)}
	reached := walkGrid{}
	if !open(start) {
		return reached
	}

	frontier := [][2]int{start}
	reached[start] = true
	for len(frontier) > 0 {
		cell := frontier[0]
		frontier = frontier[1:]
		for _, step := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			next := [2]int{cell[0] + step[0], cell[1] + step[1]}
			if reached[next] || !open(next) {
				continue
			}
			reached[next] = true
			frontier = append(frontier, next)
		}
	}

	return reached
}

// reaches reports whether any reachable point lies within within px of (x, y).
func (g walkGrid) reaches(x, y, within float64) bool {
	for cell := range g {
		if math.Hypot(float64(cell[0])*walkStep-x, float64(cell[1])*walkStep-y) <= within {
			return true
		}
	}
	return false
}
