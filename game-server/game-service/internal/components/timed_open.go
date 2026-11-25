package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// TimedTargetKind is what a timed interact does to its target when it
// completes: opens a shut run container (FS-MQYEX), searches a secret door
// open (FS-5FZ4J §F R38) or, from slice 7, prays at the hallowed altar (§G
// R43). On the wire as current_player.timed_open.target_kind (§I R49).
type TimedTargetKind string

const (
	TimedTargetOpen   TimedTargetKind = "open"
	TimedTargetSearch TimedTargetKind = "search"
	TimedTargetPray   TimedTargetKind = "pray"
)

// TimedOpenComponent is a delver's timed interact: the target they are
// working, what completing it does, and how far along they are. It rides the
// delver's body, so a delver has at most one, and it is gone once it
// completes. FS-MQYEX §Requirements 2–5, FS-5FZ4J §F R38.
type TimedOpenComponent struct {
	// TargetID is the entity id of the target: a chest or sack, a secret
	// door.
	TargetID uuid.UUID
	// TargetKind is what completing it does to the target.
	TargetKind TimedTargetKind
	// Elapsed is the seconds of simulation time counted so far, 0 at the reach.
	Elapsed float64
	// Duration is the seconds it takes, fixed at the reach.
	Duration float64
	// FromX, FromY is where the body stood at the reach.
	FromX, FromY float64
	// Afar is a timed open worked from a distance (Far Hand, FS-X2CMM §J
	// R50): its reach is measured from AfarX, AfarY, a point beside the
	// target, rather than from the body.
	Afar         bool
	AfarX, AfarY float64
	// HealthBeforeCombat is the health the delver took into the last combat
	// the timed open saw: less than it afterwards is a hit that cost health.
	HealthBeforeCombat int
}

func (o *TimedOpenComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeTimedOpen
}
