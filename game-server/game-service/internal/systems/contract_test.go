package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	FS-4EC7Z §E R18-R19 in the systems: Contract Settled's damage, kept to
	the delver's life and never stacked, and a mark's poison blades.
*/

// FS-4EC7Z §E R19: a delver holding Contract Settled deals 15% more raw
// damage with their own hits, crit and mitigation aside; settling twice
// keeps one.
func TestContractSettled_OwnHitsDealFifteenPercentMore(t *testing.T) {
	dealt := func(settles int) int {
		w := newKickerWorld("warrior", nil, neverCrit)
		for range settles {
			SettleContract(w.body, 1.15)
		}
		target := dummy(w.em, 140, 100)
		w.cast(components.AttackSlash, 200, 100)
		return 1000 - health(target)
	}

	assert.Equal(t, whole(RawDamage(12, 1.5, 8)), dealt(0))
	assert.Equal(t, whole(RawDamage(12, 1.5*1.15, 8)), dealt(1))
	assert.Equal(t, dealt(1), dealt(2), "never stacks")
}

// FS-4EC7Z §E R19: a delver holding Contract Settled who dies loses it on the
// tick of death.
func TestEliminationSystem_DeadDelverLosesContractSettled(t *testing.T) {
	em := ecs.NewEntityManager()
	d := pooled(em, components.ResourceStamina, 0, 100, 20)
	SettleContract(d, 1.15)
	require.True(t, ContractSettled(d))
	healthOf(d).CurrentHealth = 0

	NewEliminationSystem().Update(worldTick, em.GetAllEntities(), uuid.New())

	assert.False(t, ContractSettled(d))
}

// FS-4EC7Z §E R18: a hit carrying poison blades poisons the target when it
// costs health, for the blades' time; one that costs none (a dead target's,
// refused) poisons nothing.
func TestApplyHit_PoisonBlades_PoisonOnlyWhenHealthIsCost(t *testing.T) {
	w := newKickerWorld("warrior", nil, neverCrit)
	striker := w.em.CreateEntity()
	striker.AddComponent(&components.MonsterComponent{PoisonSeconds: 60})
	strike := components.AttackSnapshot{AttackerEntityID: striker.ID, FromMonster: true, TrueDamage: 5, PoisonSeconds: 60}

	require.True(t, w.combat.applyHit(strike, w.body))
	left, poisoned := PoisonedFor(w.body)
	assert.True(t, poisoned)
	assert.Equal(t, 60.0, left)

	CurePoison(w.body)
	healthOf(w.body).CurrentHealth = 0
	w.combat.applyHit(strike, w.body)
	_, poisoned = PoisonedFor(w.body)
	assert.False(t, poisoned, "no health cost, no poison")
}
