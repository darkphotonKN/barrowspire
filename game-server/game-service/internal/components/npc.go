package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// NPCFunction is what talking to an NPC opens.
//
// A function NPC *is* the entry point to something the hub offers, rather than
// decoration — the established way to reach anything there, so expect this list
// to grow. An NPC with no function is an ambient one: a resident, there to make
// the place feel inhabited. Vocabulary: game-service/CONTEXT.md.
type NPCFunction string

const (
	// NPCFunctionNone is an ambient resident, who opens nothing.
	NPCFunctionNone NPCFunction = ""
	// NPCFunctionDelve opens the matchmaking queue.
	NPCFunctionDelve NPCFunction = "delve"
	// NPCFunctionStorekeeper opens the loadout.
	NPCFunctionStorekeeper NPCFunction = "storekeeper"
)

// WanderRegion is the patch of the hub a resident keeps to.
//
// Confining them is what keeps a hub legible: residents belong to a quarter, so
// a delver can say "by the fire" and be understood, and nobody drifts across the
// whole map over an afternoon.
type WanderRegion struct {
	X, Y, W, H float64

	// Where they are currently headed, and how long they stand once they arrive.
	DestinationX, DestinationY float64
	HasDestination             bool
	PauseRemaining             float64

	// How long they have failed to get closer. Random walk against hard
	// collision corners a resident permanently without this.
	StalledFor     float64
	LastDistanceSq float64
}

type NPCComponent struct {
	// Shown above them, so a delver can tell who they are talking to.
	Name string
	// What talking to them opens, if anything.
	Function NPCFunction
	// Set for a resident; nil for a function NPC, who stands still.
	Wander *WanderRegion
}

func (n *NPCComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeNPC
}

func NewNPCComponent(name string, function NPCFunction) *NPCComponent {
	return &NPCComponent{Name: name, Function: function}
}
