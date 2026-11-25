package systems

import (
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
TrapSystem springs a floor's traps (FS-5FZ4J §D R25-R28, R30). A spike plate,
dart wall, fire jet or tripwire fires at a body whose kind FiresTraps on the
tick its centre enters the trap's cell, while the trap is armed: it disarms,
re-arming RearmAfter seconds later, or, a tripwire, is spent for good. A gas
vent puffs on the tick a body whose kind Breathes first comes within
CloudRadius of its centre, then every PuffEvery seconds while any stays, at
every one in its cloud: a peaceful encounter NPC among them (FS-4EC7Z Edge
States). A trap that fires is detected from that tick.

The system only says what fired at whom: what a spring does, a hit, an ambush
or a poisoning, is the floor's (game's) to apply. Monsters fire nothing.
*/
type TrapSystem struct {
	CellSize    float64
	RearmAfter  float64
	CloudRadius float64
	PuffEvery   float64
}

// TrapSpring is one trap firing at one body this tick: a gas vent's puff is a
// spring at each body in its cloud.
type TrapSpring struct {
	Trap *ecs.Entity
	Kind components.TrapKind
	Body *ecs.Entity
}

// Update counts the tick on every trap and returns what fired, in the order
// met.
func (s *TrapSystem) Update(dt float64, entities []*ecs.Entity) []TrapSpring {
	if s.CellSize <= 0 {
		return nil
	}
	var traps, bodies, breathers []*ecs.Entity
	for _, e := range entities {
		if e.HasComponent(ecs.ComponentTypeTrap) {
			traps = append(traps, e)
			continue
		}
		if !e.HasComponent(ecs.ComponentTypeTransform) {
			continue
		}
		kind := BodyKindOf(e)
		if kind.FiresTraps() {
			bodies = append(bodies, e)
		}
		if kind.Breathes() {
			breathers = append(breathers, e)
		}
	}

	var springs []TrapSpring
	for _, e := range traps {
		tc, _ := e.GetComponent(ecs.ComponentTypeTrap)
		trap := tc.(*components.TrapComponent)
		trap.Age += dt
		if trap.Kind == components.TrapGasVent {
			springs = append(springs, s.cloud(dt, e, trap, breathers)...)
			continue
		}
		s.rearm(dt, trap)
		springs = append(springs, s.step(e, trap, bodies)...)
	}
	return springs
}

// rearm counts a fired trap's wait down, arming it once it has passed.
func (s *TrapSystem) rearm(dt float64, trap *components.TrapComponent) {
	if trap.Armed || trap.Spent {
		return
	}
	trap.RearmIn -= dt
	if trap.RearmIn <= 0 {
		trap.Armed, trap.RearmIn = true, 0
	}
}

// step fires an armed trap at the first body whose centre entered its cell
// this tick, and notes who stands on it now.
func (s *TrapSystem) step(e *ecs.Entity, trap *components.TrapComponent, bodies []*ecs.Entity) []TrapSpring {
	var on []uuid.UUID
	var springs []TrapSpring
	for _, body := range bodies {
		if s.cellOf(body) != trap.Cell {
			continue
		}
		on = append(on, body.ID)
		if trap.Armed && !slices.Contains(trap.On, body.ID) {
			s.fire(e, trap)
			springs = append(springs, TrapSpring{Trap: e, Kind: trap.Kind, Body: body})
		}
	}
	trap.On = on
	return springs
}

// fire disarms a trap that has just fired, for RearmAfter or, a tripwire, for
// good, and marks it detected.
func (s *TrapSystem) fire(e *ecs.Entity, trap *components.TrapComponent) {
	trap.Armed = false
	if trap.Kind == components.TrapTripwire {
		trap.Spent = true
	} else {
		trap.RearmIn = s.RearmAfter
	}
	detect(e)
}

// cloud runs a gas vent's cycle: a puff on the tick its cloud is first
// entered, then every PuffEvery while anyone stays in it, at everyone in it.
func (s *TrapSystem) cloud(dt float64, e *ecs.Entity, vent *components.TrapComponent, bodies []*ecs.Entity) []TrapSpring {
	in := s.inCloud(e, bodies)
	if len(in) == 0 {
		vent.Clouded = false
		return nil
	}
	if vent.Clouded {
		vent.PuffIn -= dt
		if vent.PuffIn > 0 {
			return nil
		}
		vent.PuffIn += s.PuffEvery
	} else {
		vent.Clouded, vent.PuffIn = true, s.PuffEvery
	}
	vent.Puffed, vent.PuffedAt = true, vent.Age
	detect(e)
	springs := make([]TrapSpring, len(in))
	for i, body := range in {
		springs[i] = TrapSpring{Trap: e, Kind: vent.Kind, Body: body}
	}
	return springs
}

// inCloud is the bodies whose centre stands within CloudRadius of the vent's.
func (s *TrapSystem) inCloud(vent *ecs.Entity, bodies []*ecs.Entity) []*ecs.Entity {
	vc, ok := vent.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return nil
	}
	at := vc.(*components.TransformComponent)
	var in []*ecs.Entity
	for _, body := range bodies {
		bc, _ := body.GetComponent(ecs.ComponentTypeTransform)
		b := bc.(*components.TransformComponent)
		if math.Hypot(b.X-at.X, b.Y-at.Y) <= s.CloudRadius {
			in = append(in, body)
		}
	}
	return in
}

// cellOf is the cell holding body's centre.
func (s *TrapSystem) cellOf(body *ecs.Entity) components.Cell {
	tc, _ := body.GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)
	return components.Cell{X: int(math.Floor(at.X / s.CellSize)), Y: int(math.Floor(at.Y / s.CellSize))}
}

// detect marks a trap detected for the floor's life (FS-5FZ4J §D R30).
func detect(e *ecs.Entity) {
	if dc, ok := e.GetComponent(ecs.ComponentTypeDetectable); ok {
		dc.(*components.DetectableComponent).Detected = true
	}
}
