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

type NPCComponent struct {
	// Shown above them, so a delver can tell who they are talking to.
	Name string
	// What talking to them opens, if anything.
	Function NPCFunction
}

func (n *NPCComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeNPC
}

func NewNPCComponent(name string, function NPCFunction) *NPCComponent {
	return &NPCComponent{Name: name, Function: function}
}
