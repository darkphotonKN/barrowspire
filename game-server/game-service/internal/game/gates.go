package game

import (
	"math"
	"sync"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// bodyPosition is where a player's body stood at the end of a tick, and which
// body it was.
type bodyPosition struct {
	entityID uuid.UUID
	X, Y     float64
}

// AtGate reports whether the player's body is in this world and no further from
// the gate to destination than the gate's range. The one "at a gate" rule:
// FS-0XMCP §Requirements 7.
//
// Measured from this world's own entities, never from anything a client sends,
// and safe from any goroutine. MovementSystem writes a body's transform on the
// tick without the world's lock, so the body is read from where the tick last
// recorded it, not from its live transform: a body seated since the last tick is
// at no gate until the next one. It never takes the world's lock, so a seat
// holding that lock never parks the caller.
//
// False for a player with no body here (unknown, gone, or in another world) and
// for a destination this world has no gate to.
func (s *Session) AtGate(playerID uuid.UUID, destination components.GateDestination) bool {
	gate, found := s.gateTo(destination)
	if !found {
		return false
	}

	body, measured := s.measuredBody(playerID)
	if !measured {
		return false
	}

	return math.Hypot(body.X-gate.X, body.Y-gate.Y) <= gate.Range
}

// GateArrival is where a player coming back through the gate to destination is
// set down in this world. Not ok for a gate nobody comes back through (the
// Spire's: a run returns to the spawn) and for a gate this world does not have.
// FS-0XMCP §Requirements 1, 2.
func (s *Session) GateArrival(destination components.GateDestination) (x, y float64, ok bool) {
	gate, found := s.gateTo(destination)
	if !found || gate.Arrival == nil {
		return 0, 0, false
	}

	return gate.Arrival.X, gate.Arrival.Y, true
}

// gateAt is one gate as the queries need it.
type gateAt struct {
	X, Y, Range float64
	Arrival     *components.GateArrival
}

// gateIndex is a world's gates by destination. A gate is built with the map and
// never moves or changes, so it is indexed once, as it is placed, and read from
// any goroutine without the tick or the world's lock.
type gateIndex struct {
	mu            sync.RWMutex
	byDestination map[components.GateDestination]gateAt
}

// indexGate records a gate entity as it is placed, so the queries find it
// without scanning the world.
func (s *Session) indexGate(entity *ecs.Entity) {
	gateComp, isGate := entity.GetComponent(ecs.ComponentTypeGate)
	transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
	rangeComp, hasRange := entity.GetComponent(ecs.ComponentTypeInteractable)
	if !isGate || !hasTransform || !hasRange {
		return
	}
	gate := gateComp.(*components.GateComponent)
	transform := transformComp.(*components.TransformComponent)

	s.gates.mu.Lock()
	defer s.gates.mu.Unlock()

	if s.gates.byDestination == nil {
		s.gates.byDestination = make(map[components.GateDestination]gateAt)
	}
	s.gates.byDestination[gate.Destination] = gateAt{
		X:       transform.X,
		Y:       transform.Y,
		Range:   rangeComp.(*components.InteractableComponent).Range,
		Arrival: gate.Arrival,
	}
}

// gateTo finds this world's gate to destination.
func (s *Session) gateTo(destination components.GateDestination) (gateAt, bool) {
	s.gates.mu.RLock()
	defer s.gates.mu.RUnlock()

	gate, found := s.gates.byDestination[destination]
	return gate, found
}

// measuredBody is where the member's body stood on the last tick. Not ok for a
// member the tick did not measure here, nor for one whose body was removed
// since: the snapshot outlives a removal until the next tick, the entity does
// not. Never takes the world's lock.
func (s *Session) measuredBody(memberID uuid.UUID) (bodyPosition, bool) {
	bodies := s.bodiesAt.Load()
	if bodies == nil {
		return bodyPosition{}, false
	}

	body, measured := (*bodies)[memberID]
	if !measured {
		return bodyPosition{}, false
	}
	if _, here := s.EntityManager.GetEntity(body.entityID); !here {
		return bodyPosition{}, false
	}

	return body, true
}

// recordBodies notes where every player body stands, on the tick, by member,
// and publishes it whole for the gate queries. A run has no gates, so it records
// nothing.
func (s *Session) recordBodies(entities []*ecs.Entity) {
	if s.worldType == types.WorldTypeRun {
		return
	}

	at := make(map[uuid.UUID]bodyPosition)
	for _, entity := range entities {
		if !entity.HasComponent(ecs.ComponentTypePlayer) {
			continue
		}
		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		if !hasTransform {
			continue
		}
		transform := transformComp.(*components.TransformComponent)
		at[entity.ID] = bodyPosition{entityID: entity.ID, X: transform.X, Y: transform.Y}
	}

	s.mu.RLock()
	bodies := make(map[uuid.UUID]bodyPosition, len(s.playerIDToEntitiesID))
	for memberID, entityID := range s.playerIDToEntitiesID {
		if body, measured := at[entityID]; measured {
			bodies[memberID] = body
		}
	}
	s.mu.RUnlock()

	s.bodiesAt.Store(&bodies)
}
