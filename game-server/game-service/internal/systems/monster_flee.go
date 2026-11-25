package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/google/uuid"
)

/*
Flee sends a living monster running to (x, y) for at most within seconds
(FS-4EC7Z §E R18): what it was winding up ends with nothing landing, it drops
its target and its path, and until it arrives it turns on no one and answers
no hit (MonsterAISystem.flee). A leap already in the air is left to land.
*/
func Flee(monster *components.MonsterComponent, x, y, within float64) {
	monster.Flight = components.Flight{Fleeing: true, X: x, Y: y, Remaining: within}
	monster.WindUpRemaining = 0
	if !monster.AbilityPending.Leaping {
		monster.AbilityPending = components.PendingAbility{}
	}
	monster.ClawShowRemaining = 0
	monster.Target, monster.LastAttacker, monster.Retaliating = uuid.Nil, uuid.Nil, false
	monster.Wander = components.Wandering{}
	forget(&monster.Route)
}

// fleeArrival is how near the point of its flight a fleeing monster has
// arrived: within a body's width, so others standing there do not hold it
// off.
const fleeArrival = 40.0

// flee runs a fleeing monster's tick: it walks for its flight's point, by
// path on a dungeon floor, until it is within fleeArrival of it or its time
// runs out, and then it stands, Arrived. FS-4EC7Z §E R18.
func (s *MonsterAISystem) flee(deltaTime float64, monster *components.MonsterComponent, at *components.TransformComponent, velocity *components.VelocityComponent) {
	flight := &monster.Flight
	flight.Remaining -= deltaTime
	if math.Hypot(flight.X-at.X, flight.Y-at.Y) <= fleeArrival || flight.Remaining <= 0 {
		velocity.VX, velocity.VY = 0, 0
		flight.Fleeing, flight.Arrived = false, true
		forget(&monster.Route)
		monster.Action = components.MonsterActionIdle
		return
	}
	x, y := s.towards(monster, at, flight.X, flight.Y)
	faceAt(monster, at, x, y)
	velocity.VX, velocity.VY = monster.FacingX, monster.FacingY
	monster.Action = components.MonsterActionMove
}
