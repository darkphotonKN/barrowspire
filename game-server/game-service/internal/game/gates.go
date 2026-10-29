package game

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// bodyPosition is where a player's body stood at the end of a tick.
type bodyPosition struct {
	X, Y float64
}

/**
* AtGate reports whether the player's body is in this world and no further from
* the gate to destination than the gate's range. The one "at a gate" rule:
* FS-0XMCP §Requirements 7.
*
* Measured from this world's own entities, never from anything a client sends,
* and safe from any goroutine. MovementSystem writes a body's transform on the
* tick without the world's lock, so the body is read from where the tick last
* recorded it under the lock, not from its live transform: a body seated since
* the last tick is at no gate until the next one.
*
* False for a player with no body here (unknown, gone, or in another world) and
* for a destination this world has no gate to.
**/
func (s *Session) AtGate(playerID uuid.UUID, destination components.GateDestination) bool {
	gate, found := s.gateTo(destination)
	if !found {
		return false
	}

	s.mu.RLock()
	entityID, here := s.playerIDToEntitiesID[playerID]
	body, measured := s.bodiesAt[entityID]
	s.mu.RUnlock()

	if !here || !measured {
		return false
	}

	return math.Hypot(body.X-gate.X, body.Y-gate.Y) <= gate.Range
}

/**
* GateArrival is where a player coming back through the gate to destination is
* set down in this world. Not ok for a gate nobody comes back through (the
* Spire's: a run returns to the spawn) and for a gate this world does not have.
* FS-0XMCP §Requirements 1, 2.
**/
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

// gateTo finds this world's gate to destination. A gate is built with the map
// and never moves or changes, so its components are read without the tick.
func (s *Session) gateTo(destination components.GateDestination) (gateAt, bool) {
	for _, entity := range s.EntityManager.GetAllEntities() {
		gateComp, isGate := entity.GetComponent(ecs.ComponentTypeGate)
		if !isGate {
			continue
		}
		gate := gateComp.(*components.GateComponent)
		if gate.Destination != destination {
			continue
		}

		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		rangeComp, hasRange := entity.GetComponent(ecs.ComponentTypeInteractable)
		if !hasTransform || !hasRange {
			return gateAt{}, false
		}
		transform := transformComp.(*components.TransformComponent)

		return gateAt{
			X:       transform.X,
			Y:       transform.Y,
			Range:   rangeComp.(*components.InteractableComponent).Range,
			Arrival: gate.Arrival,
		}, true
	}

	return gateAt{}, false
}

// recordBodies notes where every player body stands, on the tick, for AtGate.
// A run has no gates, so it records nothing.
func (s *Session) recordBodies(entities []*ecs.Entity) {
	if s.worldType == types.WorldTypeRun {
		return
	}

	bodies := make(map[uuid.UUID]bodyPosition, len(s.bodiesAt))
	for _, entity := range entities {
		if !entity.HasComponent(ecs.ComponentTypePlayer) {
			continue
		}
		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		if !hasTransform {
			continue
		}
		transform := transformComp.(*components.TransformComponent)
		bodies[entity.ID] = bodyPosition{X: transform.X, Y: transform.Y}
	}

	s.mu.Lock()
	s.bodiesAt = bodies
	s.mu.Unlock()
}
