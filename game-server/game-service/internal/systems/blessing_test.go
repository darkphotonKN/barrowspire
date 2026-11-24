package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const blessedRegen = 5.0

func blessedRegenTicks(em *ecs.EntityManager, n int) {
	sys := NewResourceSystem(blessedRegen)
	for range n {
		sys.Update(worldTick, em.GetAllEntities())
	}
}

// FS-5FZ4J §G R44: a blessed delver's class resource regenerates 5% faster:
// 20 stamina a second reads 21 after a second, an unblessed delver's 20.
func TestResourceSystem_BlessedRegensFivePercentMore(t *testing.T) {
	em := ecs.NewEntityManager()
	blessed := pooled(em, components.ResourceStamina, 0, 100, 20)
	Bless(blessed)
	plain := pooled(em, components.ResourceStamina, 0, 100, 20)

	blessedRegenTicks(em, 30)

	assert.Equal(t, 21, resourceOf(blessed).Current)
	assert.Equal(t, 20, resourceOf(plain).Current)
}

// FS-5FZ4J §G R44: the Blessing's 5% is summed beside the passive tree's
// bonus, never written into it: 10% from the tree and the Blessing's 5% read
// 23 of 20 a second, and the passive bonus still says 10.
func TestResourceSystem_BlessingSumsBesideThePassiveBonus(t *testing.T) {
	em := ecs.NewEntityManager()
	d := pooled(em, components.ResourceStamina, 0, 100, 20)
	d.AddComponent(&components.PassiveBonusComponent{RegenPercent: 10})
	Bless(d)

	blessedRegenTicks(em, 30)

	assert.Equal(t, 23, resourceOf(d).Current)
	assert.InDelta(t, 10, passiveBonus(d).RegenPercent, 1e-9, "the passive bonus is untouched")
}

// FS-5FZ4J §G R44: blessing a blessed delver changes nothing, it never stacks.
func TestBless_NeverStacks(t *testing.T) {
	em := ecs.NewEntityManager()
	d := pooled(em, components.ResourceStamina, 0, 100, 20)
	Bless(d)
	Bless(d)

	blessedRegenTicks(em, 30)

	assert.True(t, Blessed(d))
	assert.Equal(t, 21, resourceOf(d).Current)
}

// FS-5FZ4J §G R44: a blessed delver who dies loses the Blessing on the tick of
// death.
func TestEliminationSystem_DeadDelverLosesTheBlessing(t *testing.T) {
	em := ecs.NewEntityManager()
	d := pooled(em, components.ResourceStamina, 0, 100, 20)
	Bless(d)
	healthOf(d).CurrentHealth = 0

	eliminated := NewEliminationSystem().Update(worldTick, em.GetAllEntities(), uuid.New())

	require.Len(t, eliminated, 1)
	assert.False(t, Blessed(d))
}
