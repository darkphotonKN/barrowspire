package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §Requirements 22–23, D10, D11. I-X2F2H-4.

var fieldArrival = struct{ X, Y float64 }{180, 500}

const riseAfter = 3.0

func respawnSystem() *FieldRespawnSystem {
	return NewFieldRespawnSystem(fieldArrival.X, fieldArrival.Y, riseAfter)
}

// fall kills the body and runs the tick it falls on: its wait starts there.
func fall(sys *FieldRespawnSystem, entities []*ecs.Entity, body *ecs.Entity) {
	killDelver(body)
	sys.Update(tickSeconds, entities)
}

// fallFor ticks the system for this many seconds, at the world's tick rate.
func fallFor(sys *FieldRespawnSystem, entities []*ecs.Entity, seconds float64) {
	for range int(seconds/tickSeconds + 0.5) {
		sys.Update(tickSeconds, entities)
	}
}

func positionOf(e *ecs.Entity) (float64, float64) {
	c, _ := e.GetComponent(ecs.ComponentTypeTransform)
	t := c.(*components.TransformComponent)
	return t.X, t.Y
}

// A fallen player stays fallen where they lie until the delay has run, then
// stands at the arrival point in play, at full health and full mana.
func TestFieldRespawnSystem_RisesAtTheArrivalAfterTheDelay(t *testing.T) {
	em := ecs.NewEntityManager()
	body := delver(em, 900, 420)
	mc, _ := body.GetComponent(ecs.ComponentTypeMana)
	mc.(*components.ManaComponent).CurrentMana = 7
	sys := respawnSystem()
	entities := em.GetAllEntities()

	fall(sys, entities, body)
	fallFor(sys, entities, riseAfter-0.1)
	assert.False(t, InPlay(body), "still fallen before the delay runs")
	x, y := positionOf(body)
	assert.Equal(t, 900.0, x, "the fallen lie where they fell")
	assert.Equal(t, 420.0, y)

	fallFor(sys, entities, 0.1)
	require.True(t, InPlay(body), "in play again once the delay ran")
	x, y = positionOf(body)
	assert.Equal(t, fieldArrival.X, x)
	assert.Equal(t, fieldArrival.Y, y)
	assert.Equal(t, 150, health(body), "full health")
	assert.Equal(t, 100, mana(body), "full mana")
	assert.False(t, body.HasComponent(ecs.ComponentTypeRespawn), "nothing left counting down")
}

// The living, and anything that is not a player, are left alone.
func TestFieldRespawnSystem_LeavesTheLivingAlone(t *testing.T) {
	em := ecs.NewEntityManager()
	alive := delver(em, 900, 420)
	hc, _ := alive.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 40
	corpse := ghoul(em, 300, 300, 0)

	fallFor(respawnSystem(), em.GetAllEntities(), riseAfter+1)

	x, y := positionOf(alive)
	assert.Equal(t, 900.0, x)
	assert.Equal(t, 420.0, y)
	assert.Equal(t, 40, health(alive), "no free heal for the living")
	assert.False(t, alive.HasComponent(ecs.ComponentTypeRespawn))
	assert.Zero(t, health(corpse), "a monster never rises by this")
}

// Each death is its own delay: a player who falls again after rising waits the
// full delay again.
func TestFieldRespawnSystem_EveryDeathWaitsTheFullDelay(t *testing.T) {
	em := ecs.NewEntityManager()
	body := delver(em, 900, 420)
	sys := respawnSystem()
	entities := em.GetAllEntities()

	fall(sys, entities, body)
	fallFor(sys, entities, riseAfter)
	require.True(t, InPlay(body))

	fall(sys, entities, body)
	fallFor(sys, entities, riseAfter-0.1)
	assert.False(t, InPlay(body), "the second fall waits its own delay")
	fallFor(sys, entities, 0.1)
	assert.True(t, InPlay(body))
}
