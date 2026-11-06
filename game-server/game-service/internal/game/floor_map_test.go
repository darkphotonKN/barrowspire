package game

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// sentFrom is one thing a recipient was sent: a message by its action, or a
// state by its floor.
type sentFrom struct {
	action string
	floor  int
}

// orderedSender keeps, per recipient, everything the session sent them in the
// order it was handed over.
type orderedSender struct {
	mu   sync.Mutex
	sent map[uuid.UUID][]sentFrom
	msgs map[uuid.UUID][]types.Message
}

func (o *orderedSender) record(playerID uuid.UUID, f sentFrom) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.sent == nil {
		o.sent = map[uuid.UUID][]sentFrom{}
	}
	o.sent[playerID] = append(o.sent[playerID], f)
}

func (o *orderedSender) SendMessageToPlayer(playerID uuid.UUID, message types.Message) error {
	floor, _ := message.Payload["floor"].(int)
	o.record(playerID, sentFrom{action: message.Action, floor: floor})
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.msgs == nil {
		o.msgs = map[uuid.UUID][]types.Message{}
	}
	o.msgs[playerID] = append(o.msgs[playerID], message)
	return nil
}

func (o *orderedSender) BroadcastToPlayerList(_ []uuid.UUID, _ types.Message) error { return nil }

func (o *orderedSender) SendStateToPlayer(playerID uuid.UUID, state *types.ClientGameState) error {
	o.record(playerID, sentFrom{action: "state", floor: state.Floor})
	return nil
}

func (o *orderedSender) BroadcastStateToPlayerList(_ []uuid.UUID, _ *types.ClientGameState) error {
	return nil
}

func (o *orderedSender) to(playerID uuid.UUID) []sentFrom {
	o.mu.Lock()
	defer o.mu.Unlock()
	return append([]sentFrom(nil), o.sent[playerID]...)
}

// wireOf is a message as its client reads it.
func wireOf(t *testing.T, message types.Message) map[string]any {
	t.Helper()
	raw, err := json.Marshal(message)
	require.NoError(t, err)
	var wire map[string]any
	require.NoError(t, json.Unmarshal(raw, &wire))
	return wire
}

// A floor change hands every recipient the new floor's map before the new
// floor's first state: the map goes from the loop, the states after it.
// FS-KE075 §F Requirement 32, ADR-0060 Decision 1.
func TestFloorChange_FloorMapBeforeTheNewFloorsFirstState(t *testing.T) {
	c := newClimb(t)
	sender := &orderedSender{}
	c.s.sender = sender
	c.s.stateSerializer = serializer.NewStateSerializer(c.s.EntityManager, nil)
	for _, playerID := range c.delvers {
		c.standAtStairs(t, playerID)
	}
	require.NoError(t, c.interactWithStairs(t, c.delvers[0]))

	c.s.applyRequestedFloorChange()
	require.NoError(t, c.s.broadcastFullState(c.s.EntityManager.GetAllEntities()))

	for _, playerID := range c.delvers {
		require.Eventually(t, func() bool { return len(sender.to(playerID)) == 2 }, time.Second, time.Millisecond)
		assert.Equal(t, []sentFrom{
			{action: string(constants.ActionFloorMap), floor: 2},
			{action: "state", floor: 2},
		}, sender.to(playerID))
	}
}

// A climb that is dropped (its stairs gone) sends no map: nothing changed.
func TestFloorChange_DroppedClimbSendsNoMap(t *testing.T) {
	c := newClimb(t)
	sender := &orderedSender{}
	c.s.sender = sender
	c.s.requestFloorChange(uuid.New())

	c.s.applyRequestedFloorChange()

	for _, playerID := range c.delvers {
		assert.Empty(t, sender.to(playerID))
	}
}

// A run floor's map is its size and its walls in today's shape, the house id
// included; walls exactly what a snapshot used to carry. A floor with no cell
// grid sends neither cell_size nor regions. FS-KE075 §F Requirements 31, 35.
func TestFloorMapMessage_FloorsOfBuildingsCarrySizeAndWalls(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s

	for depth := 1; depth <= constants.RunFloorCount; depth++ {
		if depth > 1 {
			require.NoError(t, s.regenerateFloor())
		}
		message, ok := s.FloorMapMessage()
		require.True(t, ok, "floor %d has a map", depth)
		assert.Equal(t, string(constants.ActionFloorMap), message.Action)

		wire := wireOf(t, message)
		payload := wire["payload"].(map[string]any)
		keys := make([]string, 0, len(payload))
		for k := range payload {
			keys = append(keys, k)
		}
		assert.ElementsMatch(t, []string{"session_id", "floor", "width", "height", "walls"}, keys,
			"no cell_size and no regions on a floor of buildings")
		assert.Equal(t, s.ID.String(), payload["session_id"])
		assert.Equal(t, float64(depth), payload["floor"])
		width, height := floorSize(depth)
		assert.Equal(t, width, payload["width"])
		assert.Equal(t, height, payload["height"])

		// what a snapshot of the same floor carried, read the way the hub's still is
		snapshot, err := serializer.NewStateSerializer(s.EntityManager, nil).SerializeBackendState(
			context.Background(), s.ID, types.WorldTypeField, s.EntityManager.GetAllEntities())
		require.NoError(t, err)
		require.NotEmpty(t, snapshot.Walls)
		assert.ElementsMatch(t, snapshot.Walls, message.Payload["walls"], "floor %d", depth)
		for _, wall := range snapshot.Walls {
			assert.NotEqual(t, uuid.Nil, wall.HouseID, "a building's wall keeps its house")
		}
	}
}

// The map is published whole and never written after: a reader on another
// goroutine holds the floor it was handed even as the next floor is built.
// FS-KE075 §G Requirement 38's rule, kept for the map: no alias of pooled state.
func TestFloorMapMessage_HandedOutMapOutlivesTheNextFloor(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	first, ok := s.FloorMapMessage()
	require.True(t, ok)
	walls := append([]*types.WallState(nil), first.Payload["walls"].([]*types.WallState)...)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for range 50 {
			_ = wireOf(t, first)
		}
	}()
	require.NoError(t, s.regenerateFloor())
	<-done

	assert.Equal(t, 1, first.Payload["floor"])
	assert.Equal(t, walls, first.Payload["walls"])
	next, _ := s.FloorMapMessage()
	assert.Equal(t, 2, next.Payload["floor"])
}

// Worlds that are not runs have no floor map: their walls ride the snapshot.
func TestFloorMapMessage_NoneOutsideARun(t *testing.T) {
	for _, bounds := range []WorldBounds{HubBounds(), {Type: types.WorldTypeField, Width: 800, Height: 800}} {
		s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, bounds)
		_, ok := s.FloorMapMessage()
		assert.False(t, ok, "%s", bounds.Type)
	}
}
