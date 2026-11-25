package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// allyNPC stands a hired ally of 1000 health at (x, y).
func allyNPC(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := encounterNPC(em, x, y, components.StanceAlly)
	nc, _ := e.GetComponent(ecs.ComponentTypeEncounterNPC)
	nc.(*components.EncounterNPCComponent).HirerID = uuid.New()
	return e
}

// FS-4EC7Z §C R9: a hired ally is a body of its own kind to the ground: it
// weighs on a plate, fires a trap and breathes a cloud as a delver does, is
// hunted, and pushes no block and detects nothing. A peaceful NPC breathes a
// cloud and nothing else; a caged one, nothing (Edge States).
func TestBodyKindOf_AnAllyWeighsAndFires(t *testing.T) {
	em := ecs.NewEntityManager()
	cases := []struct {
		name                            string
		entity                          *ecs.Entity
		want                            BodyKind
		weighs, fires, breathes, hunted bool
	}{
		{"a hired ally", allyNPC(em, 0, 0), BodyAlly, true, true, true, true},
		{"a peaceful pilgrim", pilgrim(em, 0, 0), BodyEncounterNPC, false, false, true, true},
		{"a caged captive", encounterNPC(em, 0, 0, components.StanceCaged), BodyCaptive, false, false, false, false},
		{"a delver in play", bodyAt(em, 0, 0), BodyDelver, true, true, true, true},
		{"a live monster", hunter(em, 0, 0), BodyMonster, false, false, false, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			kind := BodyKindOf(c.entity)
			assert.Equal(t, c.want, kind)
			assert.Equal(t, c.weighs, kind.Weighs())
			assert.Equal(t, c.fires, kind.FiresTraps())
			assert.Equal(t, c.breathes, kind.Breathes())
			assert.Equal(t, c.hunted, kind.Hunted())
			if c.want != BodyDelver {
				assert.False(t, kind.Pushes())
				assert.False(t, kind.Detects())
			}
		})
	}
}

// FS-4EC7Z §C R9: an ally stepping onto an armed spike plate fires it at
// itself; a peaceful pilgrim standing there fires nothing.
func TestTrapSystem_AnAllyFiresASteppingTrap_APilgrimDoesNot(t *testing.T) {
	cell := components.Cell{X: 4, Y: 4}
	t.Run("an ally", func(t *testing.T) {
		em := ecs.NewEntityManager()
		trap, _ := trapOn(em, components.TrapSpikePlate, cell)
		a := allyNPC(em, 0, 0)
		sys := newTrapSystem()
		sys.Update(trapTick, em.GetAllEntities())
		standAt(a, cell)
		springs := sys.Update(trapTick, em.GetAllEntities())
		require.Len(t, springs, 1)
		assert.Equal(t, TrapSpring{Trap: trap, Kind: components.TrapSpikePlate, Body: a}, springs[0])
	})
	t.Run("a pilgrim", func(t *testing.T) {
		em := ecs.NewEntityManager()
		_, trap := trapOn(em, components.TrapSpikePlate, cell)
		p := pilgrim(em, 0, 0)
		sys := newTrapSystem()
		sys.Update(trapTick, em.GetAllEntities())
		standAt(p, cell)
		assert.Empty(t, sys.Update(trapTick, em.GetAllEntities()))
		assert.True(t, trap.Armed)
	})
}

// FS-4EC7Z §C R9, Edge States: a gas vent's cloud counts an ally and a
// peaceful NPC as it counts a delver, puffing at each in it; a caged captive
// in it is passed by.
func TestTrapSystem_AGasCloudCountsAlliesAndPeacefulNPCs(t *testing.T) {
	cell := components.Cell{X: 10, Y: 10}
	for _, c := range []struct {
		name  string
		make  func(em *ecs.EntityManager) *ecs.Entity
		puffs bool
	}{
		{"an ally", func(em *ecs.EntityManager) *ecs.Entity { return allyNPC(em, 0, 0) }, true},
		{"a peaceful pilgrim", func(em *ecs.EntityManager) *ecs.Entity { return pilgrim(em, 0, 0) }, true},
		{"a caged captive", func(em *ecs.EntityManager) *ecs.Entity {
			return encounterNPC(em, 0, 0, components.StanceCaged)
		}, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			vent, _ := trapOn(em, components.TrapGasVent, cell)
			body := c.make(em)
			sys := newTrapSystem()
			sys.Update(trapTick, em.GetAllEntities())
			standAt(body, components.Cell{X: 11, Y: 10})
			springs := sys.Update(trapTick, em.GetAllEntities())
			if !c.puffs {
				assert.Empty(t, springs)
				return
			}
			require.Len(t, springs, 1)
			assert.Equal(t, TrapSpring{Trap: vent, Kind: components.TrapGasVent, Body: body}, springs[0])
		})
	}
}

// FS-4EC7Z §C R9, Edge States: poison takes its tick from an ally and a
// peaceful NPC as from a delver, and a peaceful one can die of it.
func TestPoison_TakesAlliesAndPeacefulNPCs(t *testing.T) {
	em := ecs.NewEntityManager()
	a := allyNPC(em, 0, 0)
	p := pilgrim(em, 0, 0)
	Poison(a, poisonFor)
	Poison(p, poisonFor)
	tickPoison(em, 1)
	assert.Equal(t, 990, health(a), "10 of 1000 in a second")
	assert.Equal(t, 990, health(p))
	_, poisoned := PoisonedFor(a)
	assert.True(t, poisoned)

	healthOf(p).CurrentHealth = 5
	tickPoison(em, 1)
	assert.Equal(t, 0, health(p), "a peaceful one can die of it")
	assert.False(t, p.HasComponent(ecs.ComponentTypePoison))
}
