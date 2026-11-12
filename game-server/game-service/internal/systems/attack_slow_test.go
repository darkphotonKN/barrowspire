package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	The attack slow (FS-JS7C8 §C R14–R20): a player whose cast resolves walks at
	0.45 × their move speed for the 0.6 s after it, and at full speed on the
	first tick after. Only a resolved cast slows; the parry and monsters never
	do; a charge in flight keeps its own speed; VelocityComponent.Speed, which
	the wire reports as direction.speed, is never touched.
*/

// The FS's starting values (R15, R16), pinned here so a test reads the rule.
const (
	slowFactorWant = 0.45
	slowTicks      = 36 // 0.6 s at the test's 1/60 s tick
)

var (
	fullStep   = constants.DefaultSpeed * tickSeconds
	slowedStep = slowFactorWant * constants.DefaultSpeed * tickSeconds
)

// steps ticks the world n times and reports how far e moved on each.
func steps(t *testing.T, w *dashWorld, e *ecs.Entity, n int) []float64 {
	t.Helper()
	out := make([]float64, 0, n)
	from := *transformOf(t, e)
	for range n {
		w.tick()
		at := transformOf(t, e)
		out = append(out, math.Hypot(at.X-from.X, at.Y-from.Y))
		from = *at
	}
	return out
}

// assertWalk checks each step: slowed for the first `slowed`, full after.
func assertWalk(t *testing.T, got []float64, slowed int, slow, full float64) {
	t.Helper()
	want := make([]float64, len(got))
	for i := range want {
		want[i] = full
		if i < slowed {
			want[i] = slow
		}
	}
	assert.InDeltaSlice(t, want, got, 1e-9, "each tick's step after the cast")
}

func speedOf(t *testing.T, e *ecs.Entity) float64 {
	t.Helper()
	vc, ok := e.GetComponent(ecs.ComponentTypeVelocity)
	require.True(t, ok)
	return vc.(*components.VelocityComponent).Speed
}

// Each slowing kind, resolved, slows its caster's walk for 0.6 s from the tick
// it resolves on; the first tick after, the walk is back to full. Speed, what
// the wire reports as direction.speed, never changes.
func TestAttackSlow_EachResolvedKindSlowsTheWalkFor0_6s(t *testing.T) {
	tests := []struct {
		name string
		cast func(em *ecs.EntityManager) *ecs.Entity
	}{
		{"targeted attack", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			target := dummy(em, 330, 300)
			intend(d, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
			return d
		}},
		{"slash", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			intend(d, components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 300})
			return d
		}},
		{"cut", func(em *ecs.EntityManager) *ecs.Entity {
			m := parryMerc(em, 300, 300)
			intend(m, components.AttackIntent{Kind: components.AttackCut, TargetX: 400, TargetY: 300})
			return m
		}},
		{"riposte", func(em *ecs.EntityManager) *ecs.Entity {
			m := riposteMerc(em, 300, 300, riposteParryCharges)
			intend(m, components.AttackIntent{Kind: components.AttackCut, TargetX: 400, TargetY: 300})
			return m
		}},
		{"arrow", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			intend(d, components.AttackIntent{Kind: components.AttackArrow, TargetX: 400, TargetY: 300})
			return d
		}},
		{"fireball", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			intend(d, components.AttackIntent{Kind: components.AttackFireball, TargetX: 400, TargetY: 300})
			return d
		}},
		{"shadow shot", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			intend(d, components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 400, TargetY: 300})
			return d
		}},
		{"triple fireball", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			intend(d, components.AttackIntent{Kind: components.AttackTripleFireball, TargetX: 400, TargetY: 300})
			return d
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newDashWorld()
			caster := walking(tt.cast(w.em), 0, 1)

			w.tick() // the walk's tick at full speed, then the cast resolves
			require.InDelta(t, 300+fullStep, transformOf(t, caster).Y, 1e-9)
			require.Positive(t, cooldownOf(caster, castKind(caster)), "the cast resolved")

			got := steps(t, w, caster, slowTicks+4)
			assertWalk(t, got, slowTicks, slowedStep, fullStep)
			assert.Equal(t, constants.DefaultSpeed, speedOf(t, caster), "Speed is never written by the slow")
		})
	}
}

// castKind is the cooldown slot a test caster's cast starts: a merc's cut (and
// the riposte it becomes) starts the cut's.
func castKind(e *ecs.Entity) components.AttackKind {
	cc, _ := e.GetComponent(ecs.ComponentTypeCooldown)
	for kind := range cc.(*components.CooldownComponent).Remaining {
		return kind
	}
	return ""
}

// A cast that does not resolve, refused for its cooldown, its cost or its
// target, slows nothing; nor does raising the parry stance.
func TestAttackSlow_RefusedCastsAndTheParryNeverSlow(t *testing.T) {
	tests := []struct {
		name string
		cast func(em *ecs.EntityManager) *ecs.Entity
	}{
		{"slash on cooldown", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			cc, _ := d.GetComponent(ecs.ComponentTypeCooldown)
			cc.(*components.CooldownComponent).Remaining[components.AttackSlash] = 10
			intend(d, components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 300})
			return d
		}},
		{"shadow shot short of stamina", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			resourceOf(d).Current = 50 // nothing regenerates in this world
			intend(d, components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 400, TargetY: 300})
			return d
		}},
		{"targeted attack out of reach", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			target := dummy(em, 700, 300)
			intend(d, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
			return d
		}},
		{"parry", func(em *ecs.EntityManager) *ecs.Entity {
			m := parryMerc(em, 300, 300)
			intend(m, components.AttackIntent{Kind: components.AttackParry})
			return m
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newDashWorld()
			caster := walking(tt.cast(w.em), 0, 1)

			w.tick()
			got := steps(t, w, caster, slowTicks+4)
			assertWalk(t, got, 0, slowedStep, fullStep)
		})
	}
}

// A monster's strike slows neither the monster that throws it nor the delver
// it lands on.
func TestAttackSlow_MonsterStrikeSlowsNobody(t *testing.T) {
	w := newDashWorld()
	g := ghoul(w.em, 300, 300, 100)
	gv, _ := g.GetComponent(ecs.ComponentTypeVelocity)
	gv.(*components.VelocityComponent).VY = 1
	g.AddComponent(components.NewAttackIntentComponent())
	// far enough apart that the two walking side by side never push each
	// other; the strike's own reach is measured by the AI, not here
	d := walking(delver(w.em, 400, 300), 0, 1)
	intend(g, components.AttackIntent{Kind: components.AttackMonsterStrike, TargetEntityID: d.ID})

	w.tick()
	require.Less(t, health(d), 150, "the strike landed")

	ghoulSteps := make([]float64, 0, slowTicks)
	delverSteps := make([]float64, 0, slowTicks)
	gFrom, dFrom := *transformOf(t, g), *transformOf(t, d)
	for range slowTicks {
		w.tick()
		gAt, dAt := transformOf(t, g), transformOf(t, d)
		ghoulSteps = append(ghoulSteps, math.Hypot(gAt.X-gFrom.X, gAt.Y-gFrom.Y))
		delverSteps = append(delverSteps, math.Hypot(dAt.X-dFrom.X, dAt.Y-dFrom.Y))
		gFrom, dFrom = *gAt, *dAt
	}
	assertWalk(t, ghoulSteps, 0, 0, 90*tickSeconds)
	assertWalk(t, delverSteps, 0, 0, fullStep)
}

// A second cast resolved inside the window restarts it at 0.6 s; slows never
// stack, so the walk never drops below 0.45 ×.
func TestAttackSlow_ASecondCastRestartsTheWindowWithoutStacking(t *testing.T) {
	w := newDashWorld()
	d := walking(delver(w.em, 300, 300), 0, 1)
	slash := components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 300}

	intend(d, slash)
	w.tick()
	first := steps(t, w, d, 20) // past the slash's 0.25 s cooldown
	intend(d, slash)
	rest := steps(t, w, d, slowTicks+4)

	assertWalk(t, first, 20, slowedStep, fullStep)
	// the recast resolves on the 21st tick's combat, after that tick's walk
	assertWalk(t, rest, slowTicks+1, slowedStep, fullStep)
}

// A dash's charge travels at its own speed, never slowed; the walk after it,
// still inside the window, is.
func TestAttackSlow_TheChargeKeepsItsSpeedAndTheWalkAfterItIsSlowed(t *testing.T) {
	w := newDashWorld()
	d := walking(delver(w.em, 300, 300), 1, 0)

	dashToward(d, 300+fullStep, 600) // straight down from where the walk's tick leaves it
	w.tick()
	charge := w.positions(t, d, dashTicks)
	for i, at := range charge {
		assert.InDelta(t, 300+fullStep, at[0], 1e-9, "tick %d: no walk under the charge", i+1)
	}
	require.InDelta(t, 300+dashDistance, charge[len(charge)-1][1], 1e-6, "the charge ran its full distance")
	require.False(t, dashing(d))

	after := steps(t, w, d, slowTicks-dashTicks+4)
	assertWalk(t, after, slowTicks-dashTicks, slowedStep, fullStep)
}

// The slow multiplies the player's own move speed, gear included: +20% worn
// move speed walks at 0.45 × 240 = 108 px/s while slowed.
func TestAttackSlow_ScalesFromWornMoveSpeed(t *testing.T) {
	w := newDashWorld()
	d := walking(delver(w.em, 300, 300), 0, 1)
	wear(w.em, d, legsSlot, types.ItemTypeArmor, affix(types.AffixMoveSpeed, 20))
	gear := NewGearSystem(w.em, testGearCaps, testUniqueEffects, vitalityAside)
	gear.Update(tickSeconds, w.em.GetAllEntities())
	require.InDelta(t, 240, speedOf(t, d), 1e-9)

	intend(d, components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 300})
	w.tick()
	got := make([]float64, 0, slowTicks+4)
	from := *transformOf(t, d)
	for range slowTicks + 4 {
		gear.Update(tickSeconds, w.em.GetAllEntities())
		w.tick()
		at := transformOf(t, d)
		got = append(got, math.Hypot(at.X-from.X, at.Y-from.Y))
		from = *at
	}

	assertWalk(t, got, slowTicks, 108*tickSeconds, 240*tickSeconds)
	assert.InDelta(t, 240, speedOf(t, d), 1e-9, "Speed stays the worn move speed")
}
