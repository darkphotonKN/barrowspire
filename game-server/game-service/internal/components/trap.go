package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// TrapKind is what a trap is. FS-5FZ4J §D R24, §I R46.
type TrapKind string

const (
	TrapSpikePlate TrapKind = "spike_plate"
	TrapDartWall   TrapKind = "dart_wall"
	TrapFireJet    TrapKind = "fire_jet"
	TrapTripwire   TrapKind = "tripwire"
	TrapGasVent    TrapKind = "gas_vent"
)

// TrapKinds are the v1 kinds, each drawn uniformly per trap (FS-5FZ4J §D R24).
var TrapKinds = []TrapKind{TrapSpikePlate, TrapDartWall, TrapFireJet, TrapTripwire, TrapGasVent}

/*
TrapComponent is one trap of a floor, a floor entity beside a Transform on its
cell's centre and a Detectable (FS-5FZ4J §D R23-R31). Everything here is the
floor's and goes with it.

Armed is whether stepping on it fires it: false while a fired trap waits
RearmIn seconds to re-arm, and for good once a tripwire is Spent. A gas vent is
always armed. On is the bodies whose centre stood on Cell last tick, so a trap
fires on a body entering its cell, never on one standing there (Edge States).

A gas vent's cloud: Clouded is whether a body that fires traps stood in it last
tick, PuffIn the seconds to its next puff while one does. Age is the seconds
the trap has stood, and PuffedAt the Age of its last puff, Puffed once it has.
*/
type TrapComponent struct {
	Kind  TrapKind
	Cell  Cell
	Armed bool
	Spent bool

	RearmIn float64
	On      []uuid.UUID

	Clouded  bool
	PuffIn   float64
	Age      float64
	PuffedAt float64
	Puffed   bool
}

func (t *TrapComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeTrap
}

/*
PoisonComponent is a delver's poison (FS-5FZ4J §D R29): Remaining seconds of
it, and Owed, the health it has taken by the tick that is not a whole point
yet. It is on the body, so it carries across a floor change with it.
*/
type PoisonComponent struct {
	Remaining float64
	Owed      float64
}

func (p *PoisonComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypePoison
}
