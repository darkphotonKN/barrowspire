package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// FloorComponent is which floor of a run the party is on. It sits on the
// run-level entity, beside match progress, so it survives every floor change and
// any system can read it from the entity list. FS-F6F88 §Requirements 1–3.
type FloorComponent struct {
	// Depth is the current floor, 1-based. It only ever goes up.
	Depth int
	// Count is how many floors the run has; Depth == Count is the top.
	Count int
	// CellSize is the edge, in world px, of the cell grid the current floor
	// is built on: a dungeon floor's (ADR-0061). 0 on a floor of buildings,
	// which has no grid. A dungeon floor's snapshots are cut per recipient by
	// distance (FS-KE075 §G, ADR-0060 Decision 4); whoever builds a floor sets
	// it, and clears it for a floor of buildings.
	CellSize float64
}

func (f *FloorComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeFloor
}

func NewFloorComponent(depth, count int) *FloorComponent {
	return &FloorComponent{Depth: depth, Count: count}
}
