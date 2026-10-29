package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// GateDestination is where walking into a gate takes a player. Vocabulary:
// game-service/CONTEXT.md, "Gate".
type GateDestination string

const (
	// GateDestinationSpire is the Spire's door: the way into a delve.
	GateDestinationSpire GateDestination = "spire"
	// GateDestinationForest is the trail west, to the Forlorn Forest.
	GateDestinationForest GateDestination = "forest"
	// GateDestinationMeadows is the road east, to Gentle Meadows.
	GateDestinationMeadows GateDestination = "meadows"
	// GateDestinationHub is a field's entrance gate: the road back to the hub.
	// It stands in a field world, never in the hub. FS-X2F2H §Requirements 3.
	GateDestinationHub GateDestination = "hub"
)

// GateArrival is where a player coming back through a gate is set down: just
// inside the hub, outside the gate's range, so arriving never sends them
// straight back out. FS-0XMCP §Requirements 3.
type GateArrival struct {
	X, Y float64
}

// GateComponent marks a fixed place in the hub a player walks into to go
// somewhere. Map data, not an NPC: where it stands is its transform, how close
// counts is its interactable range. FS-0XMCP §Requirements 1, 5.
type GateComponent struct {
	Destination GateDestination
	// Server-only. Nil for the Spire gate: a run returns to the spawn.
	Arrival *GateArrival
}

func (g *GateComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeGate
}

func NewGateComponent(destination GateDestination, arrival *GateArrival) *GateComponent {
	return &GateComponent{Destination: destination, Arrival: arrival}
}
