package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	trapCell   = 80.0
	trapTick   = 1.0 / 30
	trapRearm  = 10.0
	ventRadius = 160.0
	ventEvery  = 6.0
)

func newTrapSystem() *TrapSystem {
	return &TrapSystem{CellSize: trapCell, RearmAfter: trapRearm, CloudRadius: ventRadius, PuffEvery: ventEvery}
}

// trapOn is an armed, undetected trap of kind on cell, its Transform on the
// cell's centre.
func trapOn(em *ecs.EntityManager, kind components.TrapKind, cell components.Cell) (*ecs.Entity, *components.TrapComponent) {
	e := em.CreateEntity()
	trap := &components.TrapComponent{Kind: kind, Cell: cell, Armed: true}
	e.AddComponent(trap)
	e.AddComponent(components.NewTransformComponent((float64(cell.X)+0.5)*trapCell, (float64(cell.Y)+0.5)*trapCell))
	e.AddComponent(&components.DetectableComponent{})
	return e, trap
}

// standAt puts body's centre on cell's centre.
func standAt(body *ecs.Entity, cell components.Cell) {
	tc, _ := body.GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)
	at.X, at.Y = (float64(cell.X)+0.5)*trapCell, (float64(cell.Y)+0.5)*trapCell
}

func detectedTrap(e *ecs.Entity) bool {
	dc, _ := e.GetComponent(ecs.ComponentTypeDetectable)
	return dc.(*components.DetectableComponent).Detected
}

// FS-5FZ4J §D R25, R30: a delver's body centre entering an armed spike
// plate's, dart wall's or fire jet's cell fires it at that body: it disarms
// and is detected from that tick.
func TestTrapSystem_ADelverEnteringTheCellFiresIt(t *testing.T) {
	for _, kind := range []components.TrapKind{components.TrapSpikePlate, components.TrapDartWall, components.TrapFireJet, components.TrapTripwire} {
		t.Run(string(kind), func(t *testing.T) {
			em := ecs.NewEntityManager()
			e, trap := trapOn(em, kind, components.Cell{X: 5, Y: 5})
			delver := bodyAt(em, 0, 0)
			sys := newTrapSystem()

			assert.Empty(t, sys.Update(trapTick, em.GetAllEntities()), "off the cell: nothing")

			standAt(delver, components.Cell{X: 5, Y: 5})
			springs := sys.Update(trapTick, em.GetAllEntities())

			require.Len(t, springs, 1)
			assert.Equal(t, TrapSpring{Trap: e, Kind: kind, Body: delver}, springs[0])
			assert.False(t, trap.Armed)
			assert.True(t, detectedTrap(e), "a trap that fires is detected")
		})
	}
}

// FS-5FZ4J §D R25: monsters never fire a trap, nor a dead delver.
func TestTrapSystem_AMonsterOrADeadDelverFiresNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	_, trap := trapOn(em, components.TrapSpikePlate, components.Cell{X: 2, Y: 2})
	monster := em.CreateEntity()
	monster.AddComponent(&components.MonsterComponent{})
	monster.AddComponent(components.NewHealthComponent(50, 50))
	monster.AddComponent(components.NewTransformComponent(0, 0))
	dead := bodyAt(em, 0, 0)
	hc, _ := dead.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	sys := newTrapSystem()
	sys.Update(trapTick, em.GetAllEntities())

	standAt(monster, components.Cell{X: 2, Y: 2})
	standAt(dead, components.Cell{X: 2, Y: 2})

	assert.Empty(t, sys.Update(trapTick, em.GetAllEntities()))
	assert.True(t, trap.Armed)
}

// FS-5FZ4J §D R25, Edge States: a fired spike plate re-arms 10 s later, and
// fires again only on a body entering it, never on one standing on it as it
// re-arms. A tripwire fires once and is spent.
func TestTrapSystem_ReArmsAfterTenSeconds_ATripwireIsSpent(t *testing.T) {
	ticksOf := func(seconds float64) int { return int(seconds*30) + 1 }
	for _, tc := range []struct {
		kind   components.TrapKind
		rearms bool
	}{{components.TrapSpikePlate, true}, {components.TrapTripwire, false}} {
		t.Run(string(tc.kind), func(t *testing.T) {
			em := ecs.NewEntityManager()
			cell := components.Cell{X: 3, Y: 3}
			_, trap := trapOn(em, tc.kind, cell)
			delver := bodyAt(em, 0, 0)
			sys := newTrapSystem()
			sys.Update(trapTick, em.GetAllEntities())
			standAt(delver, cell)
			require.Len(t, sys.Update(trapTick, em.GetAllEntities()), 1)

			for range ticksOf(trapRearm) {
				assert.Empty(t, sys.Update(trapTick, em.GetAllEntities()), "standing on it fires nothing")
			}
			assert.Equal(t, tc.rearms, trap.Armed, "armed again after 10 s")

			standAt(delver, components.Cell{X: 0, Y: 0})
			sys.Update(trapTick, em.GetAllEntities())
			standAt(delver, cell)
			springs := sys.Update(trapTick, em.GetAllEntities())
			if tc.rearms {
				assert.Len(t, springs, 1, "off and on again fires it")
			} else {
				assert.Empty(t, springs, "a tripwire fires once")
				assert.True(t, trap.Spent)
			}
		})
	}
}

// FS-5FZ4J §D R28: a gas vent puffs on the tick a delver first comes within 2
// cells of its centre, poisoning every delver in the cloud, then every 6 s
// while anyone stays; one who walks in mid-cycle starts no puff of their own.
// Out of the cloud, the cycle starts again on the next entry. Its PuffedAt is
// its age at each puff; it stays armed.
func TestTrapSystem_GasVentPuffsOnEntryThenEverySixSeconds(t *testing.T) {
	em := ecs.NewEntityManager()
	cell := components.Cell{X: 10, Y: 10}
	vent, trap := trapOn(em, components.TrapGasVent, cell)
	a := bodyAt(em, 0, 0)
	b := bodyAt(em, 0, 0)
	sys := newTrapSystem()
	assert.Empty(t, sys.Update(trapTick, em.GetAllEntities()))

	// a stands 2 cells off the vent's centre: in the cloud
	standAt(a, components.Cell{X: 12, Y: 10})
	springs := sys.Update(trapTick, em.GetAllEntities())
	require.Len(t, springs, 1)
	assert.Equal(t, TrapSpring{Trap: vent, Kind: components.TrapGasVent, Body: a}, springs[0])
	assert.True(t, trap.Puffed)
	first := trap.PuffedAt
	assert.InDelta(t, 2*trapTick, first, 1e-9)

	standAt(b, components.Cell{X: 10, Y: 11})
	puffs := 0
	for range 6*30 + 1 {
		for _, s := range sys.Update(trapTick, em.GetAllEntities()) {
			puffs++
			assert.Contains(t, []*ecs.Entity{a, b}, s.Body)
		}
	}
	assert.Equal(t, 2, puffs, "one puff 6 s on, on both in the cloud; b's entry started none")
	assert.InDelta(t, first+ventEvery, trap.PuffedAt, trapTick+1e-9)
	assert.True(t, trap.Armed)
	assert.True(t, detectedTrap(vent))

	standAt(a, components.Cell{X: 0, Y: 0})
	standAt(b, components.Cell{X: 0, Y: 0})
	assert.Empty(t, sys.Update(trapTick, em.GetAllEntities()))
	standAt(a, cell)
	assert.Len(t, sys.Update(trapTick, em.GetAllEntities()), 1, "a fresh entry puffs at once")
}

// Two delvers entering one plate on one tick: the first firing disarms it, so
// only one is fired at.
func TestTrapSystem_TwoEnteringOnOneTick_OnlyTheFirstIsFiredAt(t *testing.T) {
	em := ecs.NewEntityManager()
	cell := components.Cell{X: 1, Y: 1}
	trapOn(em, components.TrapSpikePlate, cell)
	a, b := bodyAt(em, 0, 0), bodyAt(em, 0, 0)
	sys := newTrapSystem()
	sys.Update(trapTick, em.GetAllEntities())
	standAt(a, cell)
	standAt(b, cell)

	assert.Len(t, sys.Update(trapTick, em.GetAllEntities()), 1, "one firing disarms it")
}
