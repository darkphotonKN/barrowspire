package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	poisonFor     = 60.0
	poisonPercent = 1.0
	poisonTick    = 1.0 / 30
)

func tickPoison(em *ecs.EntityManager, seconds float64) {
	sys := NewPoisonSystem(poisonPercent)
	for range int(seconds*30 + 0.5) {
		sys.Update(poisonTick, em.GetAllEntities())
	}
}

// FS-5FZ4J §D R29: a poisoned delver loses 1% of their max health a second,
// a fraction a tick, for 60 s, then the poison is gone.
func TestPoison_OnePercentASecondForSixtySeconds(t *testing.T) {
	em := ecs.NewEntityManager()
	delver := bodyAt(em, 0, 0)
	healthOf(delver).MaxHealth, healthOf(delver).CurrentHealth = 200, 200
	Poison(delver, poisonFor)

	tickPoison(em, 1)
	assert.Equal(t, 198, healthOf(delver).CurrentHealth, "2 of 200 in a second")
	left, poisoned := PoisonedFor(delver)
	require.True(t, poisoned)
	assert.InDelta(t, 59, left, 1e-6)

	tickPoison(em, 59)
	assert.InDelta(t, 80, healthOf(delver).CurrentHealth, 1, "120 of 200 over the 60 s")
	tickPoison(em, 1)
	_, poisoned = PoisonedFor(delver)
	assert.False(t, poisoned, "run out")
	assert.False(t, delver.HasComponent(ecs.ComponentTypePoison))
}

// A second poisoning refreshes the time left to 60 s; it never stacks.
func TestPoison_ASecondPoisoningRefreshes_NeverStacks(t *testing.T) {
	em := ecs.NewEntityManager()
	delver := bodyAt(em, 0, 0)
	Poison(delver, poisonFor)
	tickPoison(em, 30)
	health := healthOf(delver).CurrentHealth

	Poison(delver, poisonFor)
	left, _ := PoisonedFor(delver)
	assert.InDelta(t, 60, left, 1e-9)
	tickPoison(em, 1)
	assert.Equal(t, health-1, healthOf(delver).CurrentHealth, "still 1% a second")
}

// Poison is lethal: it takes a delver to 0, and their poison goes with them.
// A delver resolved some other way, escaped, sheds it too.
func TestPoison_IsLethal_AndEndsWithTheDelversPlay(t *testing.T) {
	em := ecs.NewEntityManager()
	dying := bodyAt(em, 0, 0)
	healthOf(dying).CurrentHealth = 1
	escaped := bodyAt(em, 0, 0)
	Poison(dying, poisonFor)
	Poison(escaped, poisonFor)
	pc, _ := escaped.GetComponent(ecs.ComponentTypePlayer)
	pc.(*components.PlayerComponent).Escape = true

	tickPoison(em, 1)

	assert.Equal(t, 0, healthOf(dying).CurrentHealth)
	assert.False(t, dying.HasComponent(ecs.ComponentTypePoison), "the dead are no longer poisoned")
	assert.False(t, escaped.HasComponent(ecs.ComponentTypePoison), "nor the escaped")
	assert.Equal(t, 100, healthOf(escaped).CurrentHealth)
}

// CurePoison ends a poisoning and says so; on a delver who is not poisoned
// it does nothing and says that (an antidote is then not spent, FS-9JV5K).
func TestCurePoison_EndsIt(t *testing.T) {
	em := ecs.NewEntityManager()
	delver := bodyAt(em, 0, 0)
	assert.False(t, CurePoison(delver), "not poisoned")

	Poison(delver, poisonFor)
	assert.True(t, CurePoison(delver))
	_, poisoned := PoisonedFor(delver)
	assert.False(t, poisoned)
	tickPoison(em, 1)
	assert.Equal(t, 100, healthOf(delver).CurrentHealth)
}
