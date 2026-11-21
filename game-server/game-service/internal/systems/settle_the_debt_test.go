package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// settleMerc stands a mercenary at (100, 100) naming Settle the Debt and
// holding the mercenary tree's tier-3 node, with parryCharges of the pool's
// max.
func settleMerc(em *ecs.EntityManager, parryCharges, maxCharges int) *ecs.Entity {
	e := parryMerc(em, 100, 100)
	e.AddComponent(components.NewResourceComponent(components.ResourceParryCharges, parryCharges, maxCharges, 0))
	e.AddComponent(components.NewTreeAbilityComponent(components.AttackSettleTheDebt, "mercenary.t3"))
	e.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"mercenary.t3": 1}))
	return e
}

// settle queues a Settle the Debt aimed +x; the aim is ignored.
func settle(e *ecs.Entity) {
	intend(e, components.AttackIntent{Kind: components.AttackSettleTheDebt, TargetX: 400, TargetY: 100})
}

// flurryDamage is a level-1 merc's unequipped flurry at n parry charges, no
// crit, no mitigation: 12 × 1.0 × n × (1 + 7/20).
func flurryDamage(n int) int {
	return int(RawDamage(12, 1.0*float64(n), 7) + 0.5)
}

// At 3 parry charges the flurry hits each monster within 90 px once at
// coefficient 3.0, behind the merc as well as before, spends all 3 and starts
// the cut's 0.25 s slot. FS-04EEA §F R30–R31, R33.
func TestCombatSystem_SettleTheDebt_ThreeChargesHitsAllRoundAtThreeAndStartsTheCutsSlot(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := settleMerc(em, 3, 3)
	near := dummyOffAim(em, 40, 180)
	far := dummyOffAim(em, 80, 180)

	settle(merc)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 1000-flurryDamage(3), health(near))
	assert.Equal(t, 1000-flurryDamage(3), health(far))
	assert.Equal(t, 0, pool(merc), "every parry charge spent")
	assert.InDelta(t, 0.25, cooldownsOf(merc)[components.AttackCut], 1e-9, "the cut's slot")
	assert.NotContains(t, cooldownsOf(merc), components.AttackSettleTheDebt, "no slot of its own")
}

// At any count the pool held, 1 up to its max (5 on a Sellsword's pool), the
// flurry spends them all and hits each valid target within 90 px once at
// coefficient n × 1.0; one at 91 px is untouched. FS-04EEA §F R30–R32;
// §Edge States "Settle the Debt at 5 charges".
func TestCombatSystem_SettleTheDebt_SpendsEveryChargeAndHitsAtOnePerCharge(t *testing.T) {
	for _, tt := range []struct{ n, maxCharges int }{{1, 3}, {3, 3}, {5, 5}} {
		em := ecs.NewEntityManager()
		merc := settleMerc(em, tt.n, tt.maxCharges)
		inReach := []*ecs.Entity{
			dummyOffAim(em, 89, 0),
			dummyOffAim(em, 60, 90),
			dummyOffAim(em, 89, 180),
			dummyOffAim(em, 30, 270),
		}
		tooFar := dummyOffAim(em, 91, 45)

		settle(merc)
		NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

		for i, target := range inReach {
			assert.Equal(t, 1000-flurryDamage(tt.n), health(target), "n=%d, target #%d", tt.n, i)
		}
		assert.Equal(t, 1000, health(tooFar), "n=%d, past 90 px", tt.n)
		assert.Equal(t, 150, health(merc), "never its own caster")
		assert.Equal(t, 0, pool(merc), "n=%d, every charge spent", tt.n)
	}
}

// The flurry is physical on the cut's hybrid scaling, worn Strength and
// Agility included, its coefficient 1.0 per charge. FS-04EEA §F R31;
// FS-MAMHR §Requirements 7.
func TestCombatSystem_SettleTheDebt_PhysicalOnTheCutsHybridScaling(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := settleMerc(em, 3, 3)
	merc.AddComponent(&components.GearBonusComponent{Strength: 4, Agility: 2})
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	attack := combat.snapshot(merc, spendAll(attackTable[components.AttackSettleTheDebt], 3))
	assert.Equal(t, components.DamagePhysical, attack.DamageType)
	assert.Equal(t, 3.0, attack.Coefficient)
	assert.Equal(t, 10.0, attack.ScalingStat, "(7 + 7) / 2 + worn (4 + 2) / 2")
}

// Each target takes its own crit roll. FS-04EEA §F R31.
func TestCombatSystem_SettleTheDebt_EachTargetRollsItsOwnCrit(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := settleMerc(em, 3, 3)
	first := dummyOffAim(em, 40, 0)
	second := dummyOffAim(em, 40, 180)
	rolls := []float64{0, 0.999} // the first hit crits, the second does not
	roll := func() float64 { r := rolls[0]; rolls = rolls[1:]; return r }

	settle(merc)
	NewCombatSystem(em, roll, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, []*ecs.Entity{merc, first, second}, nil)

	assert.Less(t, health(first), 1000-flurryDamage(3), "crit")
	assert.Equal(t, 1000-flurryDamage(3), health(second), "its own roll, no crit")
}

// With nothing in range every parry charge is still spent and the cut's slot
// still starts. FS-04EEA §F R30.
func TestCombatSystem_SettleTheDebt_HittingNothingStillSpendsEveryCharge(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := settleMerc(em, 2, 3)

	settle(merc)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 0, pool(merc))
	assert.InDelta(t, 0.25, cooldownsOf(merc)[components.AttackCut], 1e-9)
	assert.True(t, merc.HasComponent(ecs.ComponentTypeAttackSlow))
}

// At 0 parry charges, or inside the cut's slot, the flurry does nothing and
// spends nothing. FS-04EEA §F R29; §Edge States "Settle the Debt at 0 charges".
func TestCombatSystem_SettleTheDebt_RefusedAtZeroChargesOrInsideTheCutsSlot(t *testing.T) {
	t.Run("0 parry charges", func(t *testing.T) {
		em := ecs.NewEntityManager()
		merc := settleMerc(em, 0, 3)
		target := dummyOffAim(em, 40, 0)

		settle(merc)
		NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

		assert.Equal(t, 1000, health(target))
		assert.Zero(t, cooldownsOf(merc)[components.AttackCut], "no slot started")
		assert.False(t, merc.HasComponent(ecs.ComponentTypeAttackSlow))
	})
	t.Run("inside the cut's slot", func(t *testing.T) {
		em := ecs.NewEntityManager()
		merc := settleMerc(em, 3, 3)
		target := dummyOffAim(em, 40, 0)
		cooldownsOf(merc)[components.AttackCut] = 0.1

		settle(merc)
		NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

		assert.Equal(t, 1000, health(target))
		assert.Equal(t, 3, pool(merc), "nothing spent")
	})
}

// Inside the 0.25 s a flurry starts, a cut is refused and a second flurry is
// too. FS-04EEA §F R33.
func TestCombatSystem_SettleTheDebt_ACutOrASecondFlurryInsideItsSlotIsRefused(t *testing.T) {
	t.Run("a cut", func(t *testing.T) {
		w := newStanceWorld(tickSeconds)
		merc := settleMerc(w.em, 1, 3)
		settle(merc)
		w.tick()
		target := dummyOffAim(w.em, 40, 0)

		castCut(merc)
		w.tick()

		assert.Equal(t, 1000, health(target), "refused")
	})
	t.Run("a second flurry", func(t *testing.T) {
		w := newStanceWorld(tickSeconds)
		merc := settleMerc(w.em, 1, 3)
		settle(merc)
		w.tick()
		target := dummyOffAim(w.em, 40, 0)
		resourceOf(merc).Current = 2

		settle(merc)
		w.tick()

		assert.Equal(t, 1000, health(target), "refused")
		assert.Equal(t, 2, pool(merc), "nothing spent")
	})
}

// Worn attack speed shortens the cut's slot the flurry starts.
// FS-04EEA §A R6, §F R33.
func TestCombatSystem_SettleTheDebt_WornAttackSpeedShortensTheCutsSlot(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := settleMerc(em, 1, 3)
	merc.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: 50})

	settle(merc)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	remaining, total := cooldownState(merc, components.AttackCut)
	assert.InDelta(t, 0.25/1.5, remaining, 1e-9)
	assert.InDelta(t, 0.25/1.5, total, 1e-9)
}

// Cast at 3 parry charges the flurry spends the riposte's charges: the next
// cut is a plain cut. FS-04EEA §F R34; §Edge States "Settle the Debt vs the
// riposte at 3 charges".
func TestCombatSystem_SettleTheDebt_AtThreeChargesDisarmsTheRiposte(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	merc := settleMerc(w.em, 3, 3)
	settle(merc)
	w.tick()
	w.ticks(15) // the cut's slot runs out
	near := dummyOffAim(w.em, 40, 0)
	far := dummyOffAim(w.em, 80, 0) // inside the riposte's 90, past the cut's 55

	castCut(merc)
	w.tick()

	assert.Equal(t, 1000-29, health(near), "a plain cut")
	assert.Equal(t, 1000, health(far), "no riposte")
	assert.Equal(t, 0, pool(merc))
}

// The flurry leaves an open parry stance open and a whiff lockout running.
// FS-04EEA §F R34.
func TestCombatSystem_SettleTheDebt_LeavesTheStanceAndTheLockoutAsTheyAre(t *testing.T) {
	t.Run("an open stance", func(t *testing.T) {
		w := newStanceWorld(tickSeconds)
		merc := settleMerc(w.em, 2, 3)
		castParry(merc)
		w.tick()
		require.True(t, parryOf(merc).Open)

		settle(merc)
		w.tick()

		assert.True(t, parryOf(merc).Open, "still open")
		assert.InDelta(t, tickSeconds, parryOf(merc).OpenFor, 1e-9, "its window runs on")
		assert.Equal(t, 0, pool(merc))
	})
	t.Run("a lockout", func(t *testing.T) {
		w := newStanceWorld(tickSeconds)
		merc := settleMerc(w.em, 2, 3)
		parryOf(merc).LockoutRemaining, parryOf(merc).LockoutTotal = 0.5, 1.0

		settle(merc)
		w.tick()

		assert.InDelta(t, 0.5-tickSeconds, parryOf(merc).LockoutRemaining, 1e-9, "runs on")
		assert.InDelta(t, 1.0, parryOf(merc).LockoutTotal, 1e-9)
		assert.Equal(t, 0, pool(merc))
	})
}

// Without the node, or from another class, a settle_the_debt cast does
// nothing: no hit, nothing spent, no slot, no slow. FS-04EEA §A R3.
func TestCombatSystem_SettleTheDebt_RefusedWithoutTheNodeOrForAnotherClass(t *testing.T) {
	for _, tt := range []struct {
		name   string
		caster func(em *ecs.EntityManager) *ecs.Entity
	}{
		{"a merc without the node", func(em *ecs.EntityManager) *ecs.Entity {
			e := settleMerc(em, 3, 3)
			e.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"mercenary.t1a": 2}))
			return e
		}},
		{"a warrior holding its own node", func(em *ecs.EntityManager) *ecs.Entity {
			e := earthbreakerWarrior(em, 100, 100, true)
			e.AddComponent(components.NewResourceComponent(components.ResourceParryCharges, 3, 3, 0))
			return e
		}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			caster := tt.caster(em)
			target := dummyOffAim(em, 40, 0)

			settle(caster)
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			assert.Equal(t, 1000, health(target))
			assert.Equal(t, 3, pool(caster))
			assert.Zero(t, cooldownsOf(caster)[components.AttackCut])
			assert.False(t, caster.HasComponent(ecs.ComponentTypeAttackSlow))
		})
	}
}
