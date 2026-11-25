package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
DetectionSystem marks what the party has seen (FS-5FZ4J §F R38, §D R30): a
detectable thing, a secret door or a trap, is detected from the tick a body
whose kind Detects stands with its centre within Radius of one of its spots,
and stays detected for the floor's life. The run is one party (ADR-0035), so
one delver's detection is every member's: the serializer sends a detected
thing to all of them and an undetected one to none. A trap that fires marks
itself detected; this system only adds detections, never takes one away.
*/
type DetectionSystem struct {
	Radius float64
}

func NewDetectionSystem(radius float64) *DetectionSystem {
	return &DetectionSystem{Radius: radius}
}

// Update detects, this tick, every undetected thing a detecting body stands
// within Radius of.
func (s *DetectionSystem) Update(entities []*ecs.Entity) {
	var seers []*components.TransformComponent
	var unseen []*components.DetectableComponent
	for _, e := range entities {
		if dc, ok := e.GetComponent(ecs.ComponentTypeDetectable); ok && !dc.(*components.DetectableComponent).Detected {
			unseen = append(unseen, dc.(*components.DetectableComponent))
			continue
		}
		if !BodyKindOf(e).Detects() {
			continue
		}
		if tc, ok := e.GetComponent(ecs.ComponentTypeTransform); ok {
			seers = append(seers, tc.(*components.TransformComponent))
		}
	}
	for _, d := range unseen {
		d.Detected = s.seen(d, seers)
	}
}

// seen is whether any seer stands within Radius of one of d's spots.
func (s *DetectionSystem) seen(d *components.DetectableComponent, seers []*components.TransformComponent) bool {
	for _, at := range seers {
		for _, spot := range d.Spots {
			if math.Hypot(at.X-spot.X, at.Y-spot.Y) <= s.Radius {
				return true
			}
		}
	}
	return false
}
