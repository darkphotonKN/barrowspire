package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
)

// riposteMerc stands a mercenary at (x, y) holding the given parry charges.
func riposteMerc(em *ecs.EntityManager, x, y float64, parryCharges int) *ecs.Entity {
	e := parryMerc(em, x, y)
	resourceOf(e).Current = parryCharges
	return e
}

// castCut queues a cut toward +x of a merc standing at (100, 100).
func castCut(e *ecs.Entity) {
	intend(e, components.AttackIntent{Kind: components.AttackCut, TargetX: 200, TargetY: 100})
}

// A level-1 riposte, unequipped, no crit, no mitigation: 12 × 3.0 × (1 + 7/20)
// = 48.6 → 49 on every target in the arc. FS-MAMHR §Requirements 23, 26.
const riposteDamage = 49

// At 3 parry charges the cut resolves as the riposte: every valid target within
// 90 px inside 240° of the aim is hit at coefficient 3.0, and all 3 parry
// charges are spent. FS-MAMHR §Requirements 23.
func TestCombatSystem_Riposte_CleavesEveryTargetInTheArcAndSpendsAllParryCharges(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := riposteMerc(em, 100, 100, 3)

	inArc := []*ecs.Entity{
		dummyOffAim(em, 80, -100),
		dummyOffAim(em, 80, 0),
		dummyOffAim(em, 80, 100),
		dummyOffAim(em, 89, 119),
	}
	outside := []*ecs.Entity{
		dummyOffAim(em, 80, 121),  // just past the 120° half-arc
		dummyOffAim(em, 80, 180),  // behind
		dummyOffAim(em, 91, 0),    // just past 90 px
		dummyOffAim(em, 80, -125), // the other side, past the arc
	}

	castCut(merc)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	for i, target := range inArc {
		assert.Equal(t, 1000-riposteDamage, health(target), "in the arc #%d", i)
	}
	for i, target := range outside {
		assert.Equal(t, 1000, health(target), "outside the arc #%d", i)
	}
	assert.Equal(t, 0, pool(merc), "all 3 parry charges spent")
	assert.Equal(t, 150, health(merc), "never hits its own swinger")
}

// dummyOffAim stands a dummy dist px from (100, 100), deg degrees off a +x aim.
func dummyOffAim(em *ecs.EntityManager, dist, deg float64) *ecs.Entity {
	x, y := offAim(100, 100, dist, deg)
	return dummy(em, x, y)
}

func cooldownsOf(e *ecs.Entity) map[components.AttackKind]float64 {
	c, _ := e.GetComponent(ecs.ComponentTypeCooldown)
	return c.(*components.CooldownComponent).Remaining
}

// A riposte into empty air still spends all 3 parry charges, and starts the
// cut's 0.25 s cooldown, not one of its own. FS-MAMHR §Requirements 23, 25;
// Edge States "Riposte armed, next cut hits nothing".
func TestCombatSystem_Riposte_IntoEmptyAirSpendsAllParryChargesOnTheCutsCooldown(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := riposteMerc(em, 100, 100, 3)

	castCut(merc)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 0, pool(merc))
	assert.InDelta(t, 0.25, cooldownsOf(merc)[components.AttackCut], 1e-9)
	assert.NotContains(t, cooldownsOf(merc), components.AttackRiposte, "no slot of its own")
}

// A cut refused by its cooldown at 3 parry charges is not a riposte and spends
// nothing; the next cut that resolves is. FS-MAMHR §Requirements 24; Edge States
// "Riposte armed, cut refused by cooldown".
func TestCombatSystem_Riposte_CutRefusedByCooldownSpendsNothingAndTheNextResolvedCutIsIt(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	merc := riposteMerc(w.em, 100, 100, 3)
	target := dummyOffAim(w.em, 80, 0) // beyond the cut's 55 px, inside the riposte's 90
	cooldownsOf(merc)[components.AttackCut] = 0.25

	castCut(merc)
	w.tick()

	assert.Equal(t, 1000, health(target), "refused")
	assert.Equal(t, 3, pool(merc), "nothing spent")

	w.ticks(15) // the cut's 0.25 s run out
	castCut(merc)
	w.tick()

	assert.Equal(t, 1000-riposteDamage, health(target), "the riposte")
	assert.Equal(t, 0, pool(merc))
}

// Below 3 parry charges a cut is a plain cut: its own reach and damage, and
// nothing spent. FS-MAMHR §Requirements 23.
func TestCombatSystem_Riposte_BelowThreeParryChargesACutIsAPlainCut(t *testing.T) {
	for _, parryCharges := range []int{0, 1, 2} {
		em := ecs.NewEntityManager()
		merc := riposteMerc(em, 100, 100, parryCharges)
		near := dummyOffAim(em, 40, 0)
		far := dummyOffAim(em, 80, 0)

		castCut(merc)
		NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

		assert.Equal(t, 1000-29, health(near), "a cut at %d parry charges", parryCharges)
		assert.Equal(t, 1000, health(far), "past the cut's reach at %d parry charges", parryCharges)
		assert.Equal(t, parryCharges, pool(merc), "nothing spent")
	}
}

// Only parry charges arm a riposte: another class's cut, whatever its pool, is
// a plain cut and spends nothing. FS-MAMHR §Requirements 23.
func TestCombatSystem_Riposte_OnlyParryChargesArmIt(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := delver(em, 100, 100) // 100 stamina
	far := dummyOffAim(em, 80, 0)

	castCut(warrior)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 1000, health(far))
	assert.Equal(t, 100, pool(warrior))
}

// A riposte thrown with the stance open leaves the stance open.
// FS-MAMHR §Requirements 13; Edge States "Stance open when a cut or riposte resolves".
func TestCombatSystem_Riposte_ThrownWithTheStanceOpenLeavesItOpen(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	merc := riposteMerc(w.em, 100, 100, 3)
	target := dummyOffAim(w.em, 80, 0)

	castParry(merc)
	w.tick()
	castCut(merc)
	w.tick()

	assert.Equal(t, 1000-riposteDamage, health(target))
	assert.Equal(t, 0, pool(merc))
	assert.True(t, parryOf(merc).Open)
}
