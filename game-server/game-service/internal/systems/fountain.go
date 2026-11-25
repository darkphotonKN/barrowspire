package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
FountainSystem is a floor's healing fountains on the tick (FS-5FZ4J §G R41):
each delver in play whose body centre is within Radius of a fountain's centre
gains PercentPerSecond of their max health a second, a fraction a tick, never
above their max, drawn from the fountain's one shared pool. A delver at full
health draws nothing. A fountain whose pool reaches 0 is dry for the floor's
life. It is no cure: poison runs on beside it.
*/
type FountainSystem struct {
	Radius           float64
	PercentPerSecond float64
}

func NewFountainSystem(radius, percentPerSecond float64) *FountainSystem {
	return &FountainSystem{Radius: radius, PercentPerSecond: percentPerSecond}
}

// fountainEpsilon absorbs the float drift of summing a tick's fraction.
const fountainEpsilon = 1e-9

// Update heals every delver beside a fountain that is not dry.
func (s *FountainSystem) Update(dt float64, entities []*ecs.Entity) {
	for _, e := range entities {
		fc, isFountain := e.GetComponent(ecs.ComponentTypeFountain)
		tc, placed := e.GetComponent(ecs.ComponentTypeTransform)
		if !isFountain || !placed {
			continue
		}
		fountain, at := fc.(*components.FountainComponent), tc.(*components.TransformComponent)
		for _, delver := range entities {
			if fountain.Dry {
				break
			}
			if s.beside(delver, at) {
				s.heal(fountain, delver, dt)
			}
		}
	}
}

// beside is whether delver is in play with their body centre within the
// fountain's radius of at.
func (s *FountainSystem) beside(delver *ecs.Entity, at *components.TransformComponent) bool {
	if !InPlay(delver) {
		return false
	}
	tc, ok := delver.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return false
	}
	body := tc.(*components.TransformComponent)
	return math.Hypot(body.X-at.X, body.Y-at.Y) <= s.Radius
}

// heal gives delver the tick's share of their heal from fountain's pool: what
// they are owed in whole points, cut to what they lack and what the pool
// holds. A delver at full health is owed nothing.
func (s *FountainSystem) heal(fountain *components.FountainComponent, delver *ecs.Entity, dt float64) {
	hc, ok := delver.GetComponent(ecs.ComponentTypeHealth)
	if !ok {
		return
	}
	health := hc.(*components.HealthComponent)
	lacks := health.MaxHealth - health.CurrentHealth
	if lacks <= 0 {
		delete(fountain.Owed, delver.ID)
		return
	}

	owed := fountain.Owed[delver.ID] + float64(health.MaxHealth)*s.PercentPerSecond/100*dt
	whole := math.Floor(owed + fountainEpsilon)
	fountain.Owed[delver.ID] = max(owed-whole, 0)

	gain := min(int(whole), lacks, fountain.Pool)
	health.CurrentHealth += gain
	fountain.Pool -= gain
	if fountain.Pool <= 0 {
		fountain.Pool, fountain.Dry = 0, true
	}
}
