package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
)

// rainArcher stands an archer at (100, 100) naming Arrow Rain and holding the
// archer tree's tier-3 node, with a full 100-point stamina pool.
func rainArcher(em *ecs.EntityManager) *ecs.Entity {
	e := delver(em, 100, 100)
	e.AddComponent(components.NewTreeAbilityComponent(components.AttackArrowRain, "archer.t3"))
	e.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"archer.t3": 1}))
	return e
}

// rainOn queues the archer's Arrow Rain aimed at (x, y).
func rainOn(archer *ecs.Entity, x, y float64) {
	intend(archer, components.AttackIntent{Kind: components.AttackArrowRain, TargetX: x, TargetY: y})
}

// hitTicks runs the world tick by tick for seconds after the tick it is on,
// and reports the ticks, counted from the one after it, on which target lost
// health.
func hitTicks(em *ecs.EntityManager, combat *CombatSystem, dt, seconds float64, target *ecs.Entity) []int {
	var hits []int
	for i := 1; float64(i)*dt <= seconds+1e-9; i++ {
		before := health(target)
		combat.Update(dt, em.GetAllEntities(), nil)
		if health(target) < before {
			hits = append(hits, i)
		}
	}
	return hits
}

// volleyDamage is a level-1 archer's unequipped volley, no crit, no
// mitigation: 12 × 0.5 × (1 + 8/20).
func volleyDamage() int {
	return int(RawDamage(12, 0.5, 8) + 0.5)
}

// A monster 50 px from the circle's centre is hit by each of the 5 volleys
// once: on the ticks at 0.3, 0.6, 0.9, 1.2 and 1.5 s after the cast resolves,
// on 60 Hz and 30 Hz ticks alike, and never after. FS-04EEA §E R24–R25.
func TestCombatSystem_ArrowRain_FiveVolleysOnTheirTicks(t *testing.T) {
	for _, tt := range []struct {
		name string
		hz   int
	}{{"60 Hz", 60}, {"30 Hz", 30}} {
		t.Run(tt.name, func(t *testing.T) {
			dt := 1.0 / float64(tt.hz)
			em := ecs.NewEntityManager()
			archer := rainArcher(em)
			target := dummy(em, 250, 100) // the centre at (200, 100)
			combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

			rainOn(archer, 200, 100)
			combat.Update(dt, em.GetAllEntities(), nil)
			assert.Equal(t, 1000, health(target), "nothing lands on the resolving tick")

			hits := hitTicks(em, combat, dt, 3, target)

			step := tt.hz * 3 / 10 // 0.3 s in ticks
			assert.Equal(t, []int{step, 2 * step, 3 * step, 4 * step, 5 * step}, hits)
			assert.Equal(t, 1000-5*volleyDamage(), health(target), "each volley at 0.5 on Agility")
		})
	}
}

// rains is every Arrow Rain still falling.
func rains(em *ecs.EntityManager) []*components.ArrowRainComponent {
	var out []*components.ArrowRainComponent
	for _, e := range em.GetAllEntities() {
		if c, ok := e.GetComponent(ecs.ComponentTypeArrowRain); ok {
			out = append(out, c.(*components.ArrowRainComponent))
		}
	}
	return out
}

// A resolving Arrow Rain spends 55 stamina, starts a 12 s cooldown and the
// attack pin, and centres a 70 px circle on the target, or 300 px along the
// line toward it when the target is further. FS-04EEA §E R23, §A R4–R5.
func TestCombatSystem_ArrowRain_CentresTheCircleWithin300AndPaysItsCost(t *testing.T) {
	tests := []struct {
		name         string
		toX, toY     float64
		wantX, wantY float64
	}{
		{"200 px away: on the target", 300, 100, 300, 100},
		{"300 px away: on the target", 100, 400, 100, 400},
		{"500 px away: 300 along the line", 100 + 500*0.6, 100 - 500*0.8, 100 + 300*0.6, 100 - 300*0.8},
		{"under the archer: on the archer", 100, 100, 100, 100},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			archer := rainArcher(em)

			rainOn(archer, tt.toX, tt.toY)
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			got := rains(em)
			if assert.Len(t, got, 1) {
				assert.InDelta(t, tt.wantX, got[0].X, 1e-9)
				assert.InDelta(t, tt.wantY, got[0].Y, 1e-9)
				assert.Equal(t, 70.0, got[0].Radius)
			}
			assert.Equal(t, 45, pool(archer))
			remaining, total := cooldownState(archer, components.AttackArrowRain)
			assert.InDelta(t, 12, remaining, 1e-9)
			assert.InDelta(t, 12, total, 1e-9)
			assert.True(t, archer.HasComponent(ecs.ComponentTypeAttackPin))
		})
	}
}

// Worn attack speed shortens Arrow Rain's cooldown as every cooldown's.
// FS-04EEA §A R6.
func TestCombatSystem_ArrowRain_WornAttackSpeedShortensItsCooldown(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := rainArcher(em)
	archer.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: 50})

	rainOn(archer, 200, 100)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	remaining, total := cooldownState(archer, components.AttackArrowRain)
	assert.InDelta(t, 12/1.5, remaining, 1e-9)
	assert.InDelta(t, 12/1.5, total, 1e-9)
}

// The wire's tree-ability cost reads Arrow Rain's 55. FS-04EEA §A R5;
// FS-Q18Q3 §A R5.
func TestTreeAbilityCost_ArrowRain(t *testing.T) {
	assert.Equal(t, 55, TreeAbilityCost(components.AttackArrowRain))
}

// runRain casts the archer's Arrow Rain at (x, y) and runs the world for the
// rain's whole 1.5 s and a tick past it, on 1/60 s ticks.
func runRain(em *ecs.EntityManager, combat *CombatSystem, archer *ecs.Entity, x, y float64) {
	rainOn(archer, x, y)
	for range 92 {
		combat.Update(tickSeconds, em.GetAllEntities(), nil)
	}
}

// Each volley hits every valid target whose centre is within 70 px of the
// circle's centre once; one 75 px out, a delver with player damage off and
// the archer standing in their own circle are untouched. FS-04EEA §E R24.
func TestCombatSystem_ArrowRain_HitsEachValidTargetInsideTheCircle(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := rainArcher(em)
	inside := []*ecs.Entity{
		dummy(em, 150, 100), // the centre
		dummy(em, 150+69, 100),
		dummy(em, 150, 100-69),
	}
	outside := dummy(em, 150+75, 100)
	ally := delver(em, 150-30, 100)

	runRain(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), archer, 150, 100)

	for i, target := range inside {
		assert.Equal(t, 1000-5*volleyDamage(), health(target), "target #%d, once per volley", i)
	}
	assert.Equal(t, 1000, health(outside), "75 px out")
	assert.Equal(t, 150, health(ally), "no player damage")
	assert.Equal(t, 150, health(archer), "never its own archer")
	assert.Empty(t, rains(em), "gone after its fifth volley")
}

// Each volley's hit on each target rolls its own crit.
// FS-04EEA §E R24–R25.
func TestCombatSystem_ArrowRain_EachHitRollsItsOwnCrit(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := rainArcher(em)
	dummy(em, 150, 100)
	dummy(em, 180, 100)
	rolls := 0
	countingRoll := func() float64 { rolls++; return 0.999 }

	runRain(em, NewCombatSystem(em, countingRoll, PlayerDamageOff, testUniqueEffects), archer, 150, 100)

	assert.Equal(t, 10, rolls, "2 targets × 5 volleys")
}

// Each volley tests the circle at that moment: a monster that walks in after
// the second volley is hit by the last three only. FS-04EEA §Edge States
// "Arrow Rain on a monster that walks in or out".
func TestCombatSystem_ArrowRain_AMonsterWalkingInMidRainTakesTheLaterVolleys(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := rainArcher(em)
	walker := ghoul(em, 400, 100, 1000)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	rainOn(archer, 150, 100)
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	hits := 0
	for i := 1; i <= 91; i++ {
		if i == 40 { // after the second volley at 0.6 s
			c, _ := walker.GetComponent(ecs.ComponentTypeTransform)
			c.(*components.TransformComponent).X = 170
		}
		before := health(walker)
		combat.Update(tickSeconds, em.GetAllEntities(), nil)
		if health(walker) < before {
			hits++
		}
	}

	assert.Equal(t, 3, hits)
}

// Two archers' rains on one monster: each lands its own volleys.
// FS-04EEA §Edge States "Two archers' rains overlapping".
func TestCombatSystem_ArrowRain_TwoRainsOverlappingBothLand(t *testing.T) {
	em := ecs.NewEntityManager()
	first, second := rainArcher(em), rainArcher(em)
	target := dummy(em, 150, 100)

	rainOn(first, 140, 100)
	runRain(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), second, 160, 100)

	assert.Equal(t, 1000-10*volleyDamage(), health(target))
}

// A wall between the archer and the circle stops nothing.
// FS-04EEA §E R27; §Edge States "Arrow Rain through a wall".
func TestCombatSystem_ArrowRain_HitsThroughAWall(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := rainArcher(em)
	addWall(em, 150, 0, 20, 400)
	behind := dummy(em, 250, 100)

	runRain(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), archer, 250, 100)

	assert.Equal(t, 1000-5*volleyDamage(), health(behind))
}

// A rain keeps falling after its archer dies and credits them with the kill
// it makes. FS-04EEA §E R25–R26; §Edge States "Archer dies mid-rain".
func TestCombatSystem_ArrowRain_KeepsFallingAndCreditsTheArcherAfterTheyDie(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := rainArcher(em)
	g := ghoul(em, 150, 100, 2*volleyDamage()+1) // the third volley kills
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	rainOn(archer, 150, 100)
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	hc, _ := archer.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0

	var kills []KillRecord
	for range 91 {
		kills = append(kills, combat.Update(tickSeconds, em.GetAllEntities(), nil)...)
	}

	assert.Equal(t, 0, health(g))
	if assert.Len(t, kills, 1) {
		pc, _ := archer.GetComponent(ecs.ComponentTypePlayer)
		assert.Equal(t, pc.(*components.PlayerComponent).MemberID, kills[0].KillerMemberID)
	}
}

// Arrow Rain is refused, with nothing spent, no cooldown and no rain, from a
// caster whose class names another tree ability, an archer without the node,
// one short of 55 stamina and one inside its cooldown. FS-04EEA §A R3–R4.
func TestCombatSystem_ArrowRain_RefusedDoesNothing(t *testing.T) {
	tests := []struct {
		name    string
		caster  func(em *ecs.EntityManager) *ecs.Entity
		stamina int
	}{
		{"a warrior naming Earthbreaker", func(em *ecs.EntityManager) *ecs.Entity {
			e := delver(em, 100, 100)
			e.AddComponent(components.NewTreeAbilityComponent(components.AttackEarthbreaker, "warrior.t3"))
			e.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"warrior.t3": 1}))
			return e
		}, 100},
		{"an archer without the node", func(em *ecs.EntityManager) *ecs.Entity {
			e := delver(em, 100, 100)
			e.AddComponent(components.NewTreeAbilityComponent(components.AttackArrowRain, "archer.t3"))
			return e
		}, 100},
		{"54 stamina", rainArcher, 54},
		{"inside its cooldown", func(em *ecs.EntityManager) *ecs.Entity {
			e := rainArcher(em)
			c, _ := e.GetComponent(ecs.ComponentTypeCooldown)
			startCooldown(c.(*components.CooldownComponent), components.AttackArrowRain, 5)
			return e
		}, 100},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			caster := tt.caster(em)
			resourceOf(caster).Current = tt.stamina
			_, cooldownBefore := cooldownState(caster, components.AttackArrowRain)
			target := dummy(em, 150, 100)

			runRain(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), caster, 150, 100)

			assert.Empty(t, rains(em))
			assert.Equal(t, 1000, health(target))
			assert.Equal(t, tt.stamina, pool(caster))
			_, cooldownAfter := cooldownState(caster, components.AttackArrowRain)
			assert.Equal(t, cooldownBefore, cooldownAfter)
		})
	}
}
