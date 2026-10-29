package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// ResourceKind names a class resource. The wire carries the same strings.
// FS-8AY7S §Requirements 2.
type ResourceKind string

const (
	ResourceMana         ResourceKind = "mana"
	ResourceStamina      ResourceKind = "stamina"
	ResourceParryCharges ResourceKind = "parry_charges"
)

// ResourceSubUnitsPerPoint is how finely regen accrues: one whole point is this
// many sub-units. It divides evenly at 30 and 60 ticks a second, so whole
// seconds of regen land on whole points with nothing lost to rounding.
const ResourceSubUnitsPerPoint = 6000

// ResourceComponent is a delver's class resource: the one pool their ability
// spends. Every delver carries exactly one; nothing else carries any.
// FS-8AY7S §Requirements 1–6.
type ResourceComponent struct {
	Kind ResourceKind
	// Current and Max are whole points; Current never leaves 0..Max.
	Current int
	Max     int
	// RegenPerSecond is how many points the pool gains each second in play.
	RegenPerSecond int
	// Accrued is regen not yet a whole point, in ResourceSubUnitsPerPoint, so a
	// fractional pool reads as Current, its value rounded down.
	Accrued int
}

func (r *ResourceComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeResource
}

func NewResourceComponent(kind ResourceKind, current, maximum, regenPerSecond int) *ResourceComponent {
	return &ResourceComponent{Kind: kind, Current: current, Max: maximum, RegenPerSecond: regenPerSecond}
}
