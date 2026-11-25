package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
)

const (
	fountainRadius  = 160.0
	fountainPercent = 4.0
	fountainTick    = 1.0 / 30
)

// fountainAt stands a healing fountain at (x, y) holding pool.
func fountainAt(em *ecs.EntityManager, x, y float64, pool int) *components.FountainComponent {
	e := em.CreateEntity()
	e.AddComponent(components.NewTransformComponent(x, y))
	fountain := components.NewFountainComponent(pool)
	e.AddComponent(fountain)
	return fountain
}

func tickFountains(em *ecs.EntityManager, seconds float64) {
	sys := NewFountainSystem(fountainRadius, fountainPercent)
	for range int(seconds*30 + 0.5) {
		sys.Update(fountainTick, em.GetAllEntities())
	}
}

// FS-5FZ4J §G R41: a delver at half health within 2 cells of a full fountain
// gains 4% of their max health over one second, drawn from its pool.
func TestFountain_HealsFourPercentASecondWithinTwoCells(t *testing.T) {
	em := ecs.NewEntityManager()
	fountain := fountainAt(em, 0, 0, 300)
	delver := bodyAt(em, 150, 0)
	healthOf(delver).MaxHealth, healthOf(delver).CurrentHealth = 200, 100

	tickFountains(em, 1)

	assert.Equal(t, 108, healthOf(delver).CurrentHealth, "4% of 200 in a second")
	assert.Equal(t, 292, fountain.Pool, "drawn from the pool")
	assert.False(t, fountain.Dry)
}

// FS-5FZ4J §G R41: a delver beyond 2 cells is not healed.
func TestFountain_BeyondTwoCells_HealsNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	fountain := fountainAt(em, 0, 0, 300)
	delver := bodyAt(em, 170, 0)
	healthOf(delver).MaxHealth, healthOf(delver).CurrentHealth = 200, 100

	tickFountains(em, 1)

	assert.Equal(t, 100, healthOf(delver).CurrentHealth)
	assert.Equal(t, 300, fountain.Pool)
}

// FS-5FZ4J §G R41: healing a delver at full health draws nothing, and no heal
// takes a delver above their max.
func TestFountain_FullHealthDrawsNothing_NeverAboveMax(t *testing.T) {
	em := ecs.NewEntityManager()
	fountain := fountainAt(em, 0, 0, 300)
	full := bodyAt(em, 10, 0)
	healthOf(full).MaxHealth, healthOf(full).CurrentHealth = 200, 200
	nearly := bodyAt(em, -10, 0)
	healthOf(nearly).MaxHealth, healthOf(nearly).CurrentHealth = 200, 197

	tickFountains(em, 2)

	assert.Equal(t, 200, healthOf(full).CurrentHealth)
	assert.Equal(t, 200, healthOf(nearly).CurrentHealth, "topped up, never above max")
	assert.Equal(t, 297, fountain.Pool, "only the 3 the second delver lacked")
}

// FS-5FZ4J §G R41: when the pool reaches 0 the fountain is dry for good and
// heals no one after.
func TestFountain_DryAtZero(t *testing.T) {
	em := ecs.NewEntityManager()
	fountain := fountainAt(em, 0, 0, 10)
	delver := bodyAt(em, 0, 0)
	healthOf(delver).MaxHealth, healthOf(delver).CurrentHealth = 200, 50

	tickFountains(em, 5)

	assert.Equal(t, 60, healthOf(delver).CurrentHealth, "the pool's 10 and no more")
	assert.Zero(t, fountain.Pool)
	assert.True(t, fountain.Dry)
}

// A delver out of play, dead or escaped, draws nothing from the fountain.
func TestFountain_OutOfPlay_HealsNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	fountain := fountainAt(em, 0, 0, 300)
	dead := bodyAt(em, 0, 0)
	healthOf(dead).MaxHealth, healthOf(dead).CurrentHealth = 200, 0
	healthOf(dead).IsEliminated = true

	tickFountains(em, 1)

	assert.Zero(t, healthOf(dead).CurrentHealth)
	assert.Equal(t, 300, fountain.Pool)
}
