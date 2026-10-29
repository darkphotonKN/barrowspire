package game

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// standAt seats a player in the world and puts their body at (x, y), then ticks
// so the world has measured where they stand.
func standAt(t *testing.T, s *Session, x, y float64) uuid.UUID {
	t.Helper()

	playerID := uuid.New()
	s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")

	entity, ok := s.EntityManager.GetEntity(s.playerIDToEntitiesID[playerID])
	require.True(t, ok)
	comp, _ := entity.GetComponent(ecs.ComponentTypeTransform)
	transform := comp.(*components.TransformComponent)
	transform.X, transform.Y = x, y

	tick(s)

	return playerID
}

// builtHub is the hub with its map, not started: the test is the only thing
// ticking it.
func builtHub() *Session {
	hub := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
	hub.InitialHubMapObjects()
	return hub
}

// "At a gate" is one rule: the body is in this world and no further from the
// gate than its range. FS-0XMCP §Requirements 7.
func TestAtGate_MeasuresTheBodyAgainstTheGatesRange(t *testing.T) {
	const spireX, spireY = 1000.0, 50.0

	tests := []struct {
		name        string
		x, y        float64
		destination components.GateDestination
		want        bool
	}{
		{"on the gate", spireX, spireY, components.GateDestinationSpire, true},
		{"at exactly its range", spireX, spireY + constants.GateRange, components.GateDestinationSpire, true},
		{"one px beyond it", spireX, spireY + constants.GateRange + 1, components.GateDestinationSpire, false},
		{"at a different gate", spireX, spireY, components.GateDestinationMeadows, false},
		{"at a gate the hub does not have", spireX, spireY, components.GateDestination("nowhere"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hub := builtHub()
			playerID := standAt(t, hub, tt.x, tt.y)

			assert.Equal(t, tt.want, hub.AtGate(playerID, tt.destination))
		})
	}
}

// A player with no body in this world is at none of its gates.
// FS-0XMCP §Requirements 7, §Edge States.
func TestAtGate_FalseForAPlayerNotInThisWorld(t *testing.T) {
	t.Run("unknown to the hub", func(t *testing.T) {
		hub := builtHub()

		assert.False(t, hub.AtGate(uuid.New(), components.GateDestinationSpire))
	})

	t.Run("left the hub", func(t *testing.T) {
		hub := builtHub()
		playerID := standAt(t, hub, 1000, 50)
		require.True(t, hub.AtGate(playerID, components.GateDestinationSpire))

		hub.RemovePlayer(playerID.String())

		assert.False(t, hub.AtGate(playerID, components.GateDestinationSpire))
	})

	t.Run("in a run, standing where the gate would be", func(t *testing.T) {
		run := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, RunBounds())
		playerID := standAt(t, run, 1000, 50)

		assert.False(t, run.AtGate(playerID, components.GateDestinationSpire))
	})
}

// The at-gate query never waits on the world's lock: a seat holds it across the
// loadout read, and the hub's one message loop asks at-gate for every
// find_game and start_solo, so waiting here would park the whole loop behind
// one seat. FS-0XMCP §Requirements 7, 12.
func TestAtGate_DoesNotWaitOnTheWorldsLock(t *testing.T) {
	hub := builtHub()
	playerID := standAt(t, hub, 1000, 50)

	// a seat in progress
	hub.mu.Lock()
	defer hub.mu.Unlock()

	answered := make(chan bool, 1)
	go func() { answered <- hub.AtGate(playerID, components.GateDestinationSpire) }()

	select {
	case at := <-answered:
		assert.True(t, at, "at the Spire gate, measured on the last tick")
	case <-time.After(time.Second):
		t.Fatal("AtGate waited on the world's lock")
	}
}

// A player coming back through a field gate is set down at its arrival point.
// FS-0XMCP §Requirements 1, 2; FS-X2F2H reads it.
func TestGateArrival(t *testing.T) {
	tests := []struct {
		name        string
		destination components.GateDestination
		wantX       float64
		wantY       float64
		wantOK      bool
	}{
		{"the Forest gate", components.GateDestinationForest, 180, 400, true},
		{"the Meadows gate", components.GateDestinationMeadows, 1820, 360, true},
		{"the Spire gate, which nobody comes back through", components.GateDestinationSpire, 0, 0, false},
		{"a gate the hub does not have", components.GateDestination("nowhere"), 0, 0, false},
	}

	hub := builtHub()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			x, y, ok := hub.GateArrival(tt.destination)

			assert.Equal(t, tt.wantOK, ok)
			assert.Equal(t, tt.wantX, x)
			assert.Equal(t, tt.wantY, y)
		})
	}
}

// A second gate to a destination the world already has a gate to is not
// indexed: the first one placed stays the gate to it, as a scan in placement
// order found it before the index.
func TestIndexGate_ASecondGateToOneDestination_KeepsTheFirst(t *testing.T) {
	hub := builtHub()
	firstX, firstY, ok := hub.GateArrival(components.GateDestinationMeadows)
	require.True(t, ok)

	hub.indexGate(CreateGateEntity(hub.EntityManager, hubGate{
		Destination: components.GateDestinationMeadows,
		X:           10, Y: 10,
		Arrival: &components.GateArrival{X: 20, Y: 20},
	}))

	x, y, ok := hub.GateArrival(components.GateDestinationMeadows)
	assert.True(t, ok)
	assert.Equal(t, firstX, x, "the first gate's arrival point")
	assert.Equal(t, firstY, y, "the first gate's arrival point")
}
