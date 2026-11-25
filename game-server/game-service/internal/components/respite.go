package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// FountainComponent is a floor's healing fountain (FS-5FZ4J §G R40-R41): its
// shared pool of health, fixed at the floor's build, and whether it is dry.
// Owed is the fraction of a point each delver it heals is owed, carried from
// tick to tick so a heal below a whole point a tick is never rounded away.
type FountainComponent struct {
	// Pool is the health the fountain has left to give.
	Pool int
	// Dry is set once Pool reaches 0, for the floor's life.
	Dry bool
	// Owed is each healed delver's fraction of a point, by entity id.
	Owed map[uuid.UUID]float64
}

func (f *FountainComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeFountain
}

// NewFountainComponent is a fountain holding pool, dry already when it holds
// none.
func NewFountainComponent(pool int) *FountainComponent {
	return &FountainComponent{Pool: max(pool, 0), Dry: pool <= 0, Owed: map[uuid.UUID]float64{}}
}

// HallowedAltarPlanComponent is a run's hallowed altar plan (FS-5FZ4J §G R42):
// the floor it stands on and whether it stands in a hidden room there. It sits
// on the run-level entity beside the floor, as the tome plan does, so it
// survives every floor change; only a run with a hallowed altar has one. It
// never reaches a client as such.
type HallowedAltarPlanComponent struct {
	// Floor is the floor the altar stands on, in [2, height - 1].
	Floor int
	// Hidden is whether it stands in a hidden room of its floor (§F R35).
	Hidden bool
}

func (p *HallowedAltarPlanComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeHallowedAltarPlan
}

// HallowedAltarComponent marks the hallowed altar on its floor, spent once a
// prayer at it has completed (FS-5FZ4J §G R43). Never the Altar of
// Consecration's AltarComponent: they share a model, not a kind.
type HallowedAltarComponent struct {
	// Prayed is set when the first prayer completes, for the run.
	Prayed bool
}

func (a *HallowedAltarComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeHallowedAltar
}

// BlessedComponent marks a blessed delver (FS-5FZ4J §G R44): it rides the
// body, so it is kept across every floor change, and is taken off at death.
type BlessedComponent struct{}

func (b *BlessedComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeBlessed
}
