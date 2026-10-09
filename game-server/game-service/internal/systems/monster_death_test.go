package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const corpseLifetime = 4.0

func kill(e *ecs.Entity) {
	c, _ := e.GetComponent(ecs.ComponentTypeHealth)
	c.(*components.HealthComponent).CurrentHealth = 0
}

func TestMonsterDeathSystem_ZeroHealthMonsterLiesDeadThatTick(t *testing.T) {
	em := ecs.NewEntityManager()
	g := ghoul(em, 140, 100, 30)
	m := monster(g)
	m.Action = components.MonsterActionAttack
	m.Target = uuid.New()
	m.WindUpRemaining = 0.3
	vc, _ := g.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).VX = 1
	kill(g)

	NewMonsterDeathSystem(em, corpseLifetime).Update(tickSeconds, em.GetAllEntities())

	assert.Equal(t, components.MonsterActionDead, m.Action)
	assert.Equal(t, uuid.Nil, m.Target, "a corpse chases nobody")
	assert.Zero(t, m.WindUpRemaining, "a strike mid-wind-up never lands")
	assert.False(t, g.HasComponent(ecs.ComponentTypeVelocity), "a corpse neither moves nor collides")
	_, stillThere := em.GetEntity(g.ID)
	assert.True(t, stillThere)
}

func TestMonsterDeathSystem_LivingMonstersAreLeftAlone(t *testing.T) {
	em := ecs.NewEntityManager()
	g := ghoul(em, 140, 100, 30)

	NewMonsterDeathSystem(em, corpseLifetime).Update(tickSeconds, em.GetAllEntities())

	assert.Equal(t, components.MonsterActionIdle, monster(g).Action)
	assert.True(t, g.HasComponent(ecs.ComponentTypeVelocity))
}

// The corpse lies for its lifetime, so every client can play the death, then it
// is removed.
func TestMonsterDeathSystem_CorpseIsRemovedAfterItsLifetime(t *testing.T) {
	em := ecs.NewEntityManager()
	g := ghoul(em, 140, 100, 30)
	kill(g)
	deaths := NewMonsterDeathSystem(em, corpseLifetime)

	// the tick it dies on, then its lifetime less one tick
	ticks := int(math.Round(corpseLifetime * 60))
	for i := 0; i < ticks; i++ {
		deaths.Update(tickSeconds, em.GetAllEntities())
	}
	_, ok := em.GetEntity(g.ID)
	require.True(t, ok, "still lying there just short of its lifetime")

	deaths.Update(tickSeconds, em.GetAllEntities())
	deaths.Update(tickSeconds, em.GetAllEntities())
	_, ok = em.GetEntity(g.ID)
	assert.False(t, ok, "gone once its lifetime is up")
}

// Delvers and anything else at no health are not the monster death step's.
func TestMonsterDeathSystem_IgnoresWhatIsNotAMonster(t *testing.T) {
	em := ecs.NewEntityManager()
	d := delver(em, 100, 100)
	d.AddComponent(components.NewVelocityComponent(0, 0, 200))
	kill(d)

	deaths := NewMonsterDeathSystem(em, corpseLifetime)
	for i := 0; i < int(2*corpseLifetime/tickSeconds); i++ {
		deaths.Update(tickSeconds, em.GetAllEntities())
	}

	_, ok := em.GetEntity(d.ID)
	assert.True(t, ok)
	assert.True(t, d.HasComponent(ecs.ComponentTypeVelocity))
}
