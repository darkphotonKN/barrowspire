package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	FS-8RZ51 §F R29, the archer's and the mercenary's kickers: each node's
	stat at R1, R2 and R3, and its R3 rule only at R3. Every body is a
	rankedBody (kickers_test.go) standing at (100, 100).
*/

// cooldownTicks outlasts every left-click's 0.25 s cooldown on 1/60 s ticks.
const cooldownTicks = 16

// volley fires n arrows toward +x, a cooldown apart, and returns each one's
// pierce in firing order. Each arrow is cleared once read.
func (w *kickerWorld) volley(t *testing.T, n int) []int {
	var pierce []int
	for range n {
		shots := w.fired(components.AttackArrow)
		require.Len(t, shots, 1)
		pierce = append(pierce, shots[0].PierceLeft)
		clearShots(w.em)
		w.ticks(cooldownTicks)
	}
	return pierce
}

func clearShots(em *ecs.EntityManager) {
	for _, e := range em.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeProjectile) {
			em.RemoveEntity(e.ID)
		}
	}
}

// Quick Draw: +4% attack speed a rank, inside the cap; at R3 every 4th arrow
// fired in the world pierces one more monster, on top of a worn Lantern's.
func TestKicker_QuickDraw(t *testing.T) {
	t.Run("the stat, each rank: the arrow's cooldown shortens", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newKickerWorld("archer", passivetree.Ranks{"archer.t2a": rank}, neverCrit)
			gearPass(w.em)
			assert.Equal(t, 4*rank, gearOf(w.body).AttackSpeedPercent, "rank %d", rank)
			w.cast(components.AttackArrow, 400, 100)
			assert.InDelta(t, 0.25/(1+0.04*float64(rank)), cooldownsOf(w.body)[components.AttackArrow], 1e-9, "rank %d", rank)
		}
	})
	t.Run("the stat at R3 and worn attack speed never pass the cap", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t2a": 3}, neverCrit)
		wear(w.em, w.body, glovesSlot, types.ItemTypeArmor, affix(types.AffixAttackSpeed, testGearCaps.AttackSpeedPercent))
		gearPass(w.em)
		assert.Equal(t, testGearCaps.AttackSpeedPercent, gearOf(w.body).AttackSpeedPercent)
	})

	t.Run("R3: every 4th arrow pierces one more", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t2a": 3}, neverCrit)
		assert.Equal(t, []int{0, 0, 0, 1, 0, 0, 0, 1}, w.volley(t, 8))
	})
	t.Run("R3: on top of a worn Lantern's", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t2a": 3}, neverCrit)
		wearUnique(w.em, w.body, ring1Slot, types.ItemTypeRing, types.UniqueEffectPierce)
		lantern := testUniqueEffects.PierceExtraTargets
		assert.Equal(t, []int{lantern, lantern, lantern, lantern + 1}, w.volley(t, 4))
	})
	t.Run("R3: Shadow Shot is no arrow and is not counted", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t2a": 3}, neverCrit)
		w.volley(t, 3)
		shots := w.fired(components.AttackShadowShot)
		require.Len(t, shots, 1)
		assert.Equal(t, 0, shots[0].PierceLeft)
		clearShots(w.em)
		assert.Equal(t, []int{1}, w.volley(t, 1), "the 4th arrow, the Shadow Shot between")
	})
	t.Run("R3: the 4th arrow hits both ghouls in a line", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t2a": 3}, neverCrit)
		near, far := ghoul(w.em, 160, 100, 1000), ghoul(w.em, 200, 100, 1000)
		flight := NewProjectileSystem(w.em, PlayerDamageOff)
		for i := range 4 {
			w.cast(components.AttackArrow, 400, 100)
			for len(projectiles(w.em)) > 0 {
				w.tick(flight.Update(tickSeconds, w.em.GetAllEntities())...)
			}
			hitFar := health(far) < 1000
			assert.Equal(t, i == 3, hitFar, "arrow %d", i+1)
			w.ticks(cooldownTicks)
		}
		assert.Less(t, health(near), 1000)
	})
	t.Run("R2: no rule", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t2a": 2}, neverCrit)
		assert.Equal(t, []int{0, 0, 0, 0}, w.volley(t, 4))
	})
}

// gearPass runs one gear pass over the world: the tree's speeds and crit
// summed with gear's.
func gearPass(em *ecs.EntityManager) {
	NewGearSystem(em, testGearCaps, testUniqueEffects, vitalityAside).Update(worldTick, em.GetAllEntities())
}

// countedRoll draws value every time and counts the draws.
type countedRoll struct {
	value float64
	draws int
}

func (r *countedRoll) roll() float64 {
	r.draws++
	return r.value
}

// Sidestep's roll: under 0.10 the strike misses. A draw of 0.05 sidesteps (and
// would crit, were a crit rolled); 0.5 lands and never crits.
const (
	sidestepDraw = 0.05
	landDraw     = 0.5
)

// Fleet Foot: +3% move speed a rank, inside the cap; at R3 Sidestep: 10% of
// monster strikes (melee or shot) on the archer miss, negated like a parry
// but granting nothing, and the archer's casts keep the attack slow.
func TestKicker_FleetFoot(t *testing.T) {
	t.Run("the stat, each rank", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newKickerWorld("archer", passivetree.Ranks{"archer.t2b": rank}, neverCrit)
			gearPass(w.em)
			assert.Equal(t, 3*rank, gearOf(w.body).MoveSpeedPercent, "rank %d", rank)
		}
	})
	t.Run("the stat at R3 and worn move speed never pass the cap", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t2b": 3}, neverCrit)
		wear(w.em, w.body, legsSlot, types.ItemTypeArmor, affix(types.AffixMoveSpeed, testGearCaps.MoveSpeedPercent))
		gearPass(w.em)
		assert.Equal(t, testGearCaps.MoveSpeedPercent, gearOf(w.body).MoveSpeedPercent)
	})

	// struck has a striker strike the archer, or a monster shot land on them,
	// with the roll given, and returns the damage taken and the draws made
	struck := func(rank int, draw float64, shot bool) (taken, draws int, w *kickerWorld) {
		r := &countedRoll{value: draw}
		w = newKickerWorld("archer", passivetree.Ranks{"archer.t2b": rank}, r.roll)
		resourceOf(w.body).Current = 40
		troll := striker(w.em, 140, 100, 200)
		before := healthOf(w.body).CurrentHealth
		if shot {
			blow := monsterBlow()
			blow.AttackerEntityID, blow.Kind = troll.ID, components.AttackMonsterShot
			w.tick(Impact{Attack: blow, TargetEntityID: w.body.ID})
		} else {
			strikeOn(troll, w.body)
			w.tick()
		}
		return before - healthOf(w.body).CurrentHealth, r.draws, w
	}

	for _, shot := range []bool{false, true} {
		name := map[bool]string{false: "a strike", true: "a shot"}[shot]

		t.Run("R3: "+name+" forced to miss deals nothing, rolls no crit, changes nothing", func(t *testing.T) {
			taken, draws, w := struck(3, sidestepDraw, shot)
			assert.Equal(t, 0, taken)
			assert.Equal(t, 1, draws, "the Sidestep roll, and no crit roll")
			assert.Equal(t, 40, pool(w.body))
			assert.False(t, w.body.HasComponent(ecs.ComponentTypeParry), "no stance")
		})
		t.Run("R3: "+name+" forced to land resolves as today", func(t *testing.T) {
			taken, draws, _ := struck(3, landDraw, shot)
			_, todayDraws, _ := struck(0, landDraw, shot)
			assert.Positive(t, taken)
			assert.Equal(t, todayDraws+1, draws, "the Sidestep roll, then the crit roll")
			todayTaken, _, _ := struck(0, landDraw, shot)
			assert.Equal(t, todayTaken, taken)
		})
		t.Run("R2: "+name+" is never negated", func(t *testing.T) {
			taken, draws, _ := struck(2, sidestepDraw, shot)
			assert.Positive(t, taken)
			assert.Equal(t, 1, draws, "the crit roll alone")
		})
	}

	t.Run("R3: a sidestepped strike is not reflected", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t2b": 3}, func() float64 { return sidestepDraw })
		wearUnique(w.em, w.body, chestSlot, types.ItemTypeArmor, types.UniqueEffectMeleeReflect)
		troll := striker(w.em, 140, 100, 200)
		strikeOn(troll, w.body)
		w.tick()
		assert.Equal(t, 200, health(troll))
	})
	t.Run("R3: the archer's casts keep the attack slow", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t2b": 3}, neverCrit)
		w.cast(components.AttackArrow, 400, 100)
		assert.True(t, w.body.HasComponent(ecs.ComponentTypeAttackSlow))
	})
	t.Run("R3: a delver's hit on the archer rolls no Sidestep", func(t *testing.T) {
		r := &countedRoll{value: sidestepDraw}
		em := ecs.NewEntityManager()
		archer := rankedBody(em, "archer", passivetree.Ranks{"archer.t2b": 3})
		NewCombatSystem(em, r.roll, PlayerDamageOn, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(),
			[]Impact{{Attack: lethal(memberOf(rankedBody(em, "warrior", nil))), TargetEntityID: archer.ID}})
		assert.Equal(t, 0, health(archer))
	})
}

// Eagle Eye: +3 crit points a rank, summed with gear's; at R3 every Shadow
// Shot is a forced crit, its hit rolled at 100%.
func TestKicker_EagleEye(t *testing.T) {
	t.Run("the stat, each rank", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newKickerWorld("archer", passivetree.Ranks{"archer.t5a": rank}, neverCrit)
			gearPass(w.em)
			assert.Equal(t, 3*rank, gearOf(w.body).CritChance, "rank %d", rank)
			shots := w.fired(components.AttackArrow)
			require.Len(t, shots, 1)
			assert.InDelta(t, BaseCritChance+0.03*float64(rank), shots[0].Attack.CritChance, 1e-9, "rank %d", rank)
		}
	})
	t.Run("the stat sums with worn crit", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t5a": 2}, neverCrit)
		wear(w.em, w.body, ring1Slot, types.ItemTypeRing, affix(types.AffixCritChance, 10))
		gearPass(w.em)
		assert.Equal(t, 16, gearOf(w.body).CritChance)
	})

	// shadowShot fires a Shadow Shot on a ghoul and returns the damage it took
	shadowShot := func(rank int) int {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t5a": rank}, neverCrit)
		g := ghoul(w.em, 300, 100, 1000)
		shots := w.fired(components.AttackShadowShot)
		require.Len(t, shots, 1)
		w.tick(Impact{Attack: shots[0].Attack, TargetEntityID: g.ID})
		return 1000 - health(g)
	}
	plain := int(math.Round(RawDamage(12, 3.2, 8)))
	crit := int(math.Round(RawDamage(12, 3.2, 8) * CritMultiplier))

	t.Run("R3: a Shadow Shot crits on a roll that never crits", func(t *testing.T) {
		assert.Equal(t, crit, shadowShot(3))
	})
	t.Run("R3: an arrow does not", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t5a": 3}, neverCrit)
		shots := w.fired(components.AttackArrow)
		require.Len(t, shots, 1)
		assert.Less(t, shots[0].Attack.CritChance, 1.0)
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, plain, shadowShot(2))
	})
}

// Hunter's Breath: +10% stamina regen a rank; at R3 a kill refunds Shadow
// Shot's cost from the attack table.
func TestKicker_HuntersBreath(t *testing.T) {
	t.Run("the stat, each rank", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			assert.Equal(t, 50+5*rank, regenOf("archer", passivetree.Ranks{"archer.t5b": rank}), "20/s over 2.5 s, rank %d", rank)
		}
	})

	killWith := func(rank, stamina int) int {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t5b": rank}, neverCrit)
		g := ghoul(w.em, 300, 100, 1)
		shots := w.fired(components.AttackArrow)
		require.Len(t, shots, 1)
		resourceOf(w.body).Current = stamina
		require.Len(t, w.tick(Impact{Attack: shots[0].Attack, TargetEntityID: g.ID}), 1)
		return pool(w.body)
	}

	t.Run("R3: a kill refunds Shadow Shot's cost", func(t *testing.T) {
		require.Equal(t, 90, AttackCost(components.AttackShadowShot))
		assert.Equal(t, 95, killWith(3, 5))
	})
	t.Run("R3: a refund at a full pool leaves it at max", func(t *testing.T) {
		assert.Equal(t, 100, killWith(3, 50))
	})
	t.Run("R3: a hit that leaves it alive refunds nothing", func(t *testing.T) {
		w := newKickerWorld("archer", passivetree.Ranks{"archer.t5b": 3}, neverCrit)
		g := ghoul(w.em, 300, 100, 1000)
		shots := w.fired(components.AttackArrow)
		resourceOf(w.body).Current = 5
		w.tick(Impact{Attack: shots[0].Attack, TargetEntityID: g.ID})
		assert.Equal(t, 5, pool(w.body))
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, 5, killWith(2, 5))
	})
}

// newMercWorld seats a mercenary holding ranks, with charges parry charges
// (of 3) and a parry stance to raise.
func newMercWorld(ranks passivetree.Ranks, roll func() float64, charges int) *kickerWorld {
	w := newKickerWorld("mercenary", ranks, roll)
	resourceOf(w.body).Current = charges
	w.body.AddComponent(components.NewAbilityComponent(components.AttackParry))
	w.body.AddComponent(components.NewParryComponent())
	return w
}

// cutDamage is a rankedBody mercenary's unmitigated cut at a coefficient
// percent more, crit or not.
func cutDamage(percent float64, crit bool) int {
	raw := RawDamage(12, 1.8*(1+percent/100), 8)
	if crit {
		raw *= CritMultiplier
	}
	return int(math.Round(raw))
}

// mercRiposte is a rankedBody mercenary's unmitigated, non-crit riposte at a
// coefficient percent more.
func mercRiposte(percent float64) int {
	return int(math.Round(RawDamage(12, 3.0*(1+percent/100), 8)))
}

// Keen Edge: +6% cut damage a rank; at R3 a cut on a monster in its wind-up
// is a forced crit.
func TestKicker_KeenEdge(t *testing.T) {
	t.Run("the stat, each rank: the cut, not the riposte", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newMercWorld(passivetree.Ranks{"mercenary.t2a": rank}, neverCrit, 0)
			target := dummy(w.em, 140, 100)
			w.cast(components.AttackCut, 200, 100)
			assert.Equal(t, 1000-cutDamage(6*float64(rank), false), health(target), "rank %d", rank)

			w = newMercWorld(passivetree.Ranks{"mercenary.t2a": rank}, neverCrit, 3)
			target = dummy(w.em, 140, 100)
			w.cast(components.AttackCut, 200, 100)
			assert.Equal(t, 1000-mercRiposte(0), health(target), "rank %d: the riposte as it is", rank)
		}
	})

	// cutOn cuts a ghoul, winding up or not, and returns the damage it took
	cutOn := func(rank int, windingUp bool) int {
		w := newMercWorld(passivetree.Ranks{"mercenary.t2a": rank}, neverCrit, 0)
		g := ghoul(w.em, 140, 100, 1000)
		if windingUp {
			monster(g).WindUpRemaining = 0.3
		}
		w.cast(components.AttackCut, 200, 100)
		return 1000 - health(g)
	}

	t.Run("R3: a cut on a monster winding up crits on a roll that never crits", func(t *testing.T) {
		assert.Equal(t, cutDamage(18, true), cutOn(3, true))
	})
	t.Run("R3: a cut on a monster not winding up does not", func(t *testing.T) {
		assert.Equal(t, cutDamage(18, false), cutOn(3, false))
	})
	t.Run("R3: a riposte on a monster winding up does not", func(t *testing.T) {
		w := newMercWorld(passivetree.Ranks{"mercenary.t2a": 3}, neverCrit, 3)
		g := ghoul(w.em, 140, 100, 1000)
		monster(g).WindUpRemaining = 0.3
		w.cast(components.AttackCut, 200, 100)
		assert.Equal(t, mercRiposte(0), 1000-health(g))
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, cutDamage(12, false), cutOn(2, true))
	})
}

// parryNow raises the mercenary's stance on one tick.
func (w *kickerWorld) parryNow() {
	castParry(w.body)
	w.tick()
}

// Practiced Guard: +0.02 s parry window a rank; at R3 a strike negated in the
// first half of the lengthened window grants 2 parry charges, the cap holding.
func TestKicker_PracticedGuard(t *testing.T) {
	t.Run("the stat, each rank: the stance stays open 0.02 s longer", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newMercWorld(passivetree.Ranks{"mercenary.t2b": rank}, neverCrit, 0)
			w.parryNow()
			// 1/60 s ticks: 0.25 s is 15 of them, each 0.02 s a tick more
			w.ticks(15 + rank)
			assert.True(t, parryOf(w.body).Open, "rank %d: open at %d/60 s", rank, 15+rank)
			w.tick()
			assert.False(t, parryOf(w.body).Open, "rank %d: closed at %d/60 s", rank, 16+rank)
		}
	})
	t.Run("the stat: a whiff's lockout still counts from the window's end", func(t *testing.T) {
		w := newMercWorld(passivetree.Ranks{"mercenary.t2b": 3}, neverCrit, 0)
		w.parryNow()
		w.ticks(19)
		require.False(t, parryOf(w.body).Open)
		assert.InDelta(t, parryLockout-(19.0/60-0.31), parryOf(w.body).LockoutRemaining, 1e-9)
	})

	// parriedAfter raises the stance, waits ticks, then has a strike land on
	// it, returning the parry charges after
	parriedAfter := func(rank, wait, charges int) int {
		w := newMercWorld(passivetree.Ranks{"mercenary.t2b": rank}, neverCrit, charges)
		troll := striker(w.em, 140, 100, 200)
		w.parryNow()
		w.ticks(wait)
		strikeOn(troll, w.body)
		w.tick()
		require.Equal(t, ownMaxHealth, health(w.body), "negated")
		return pool(w.body)
	}

	// R3's window is 0.31 s: its first half runs to 0.155 s
	t.Run("R3: negated in the first half, 2 charges", func(t *testing.T) {
		assert.Equal(t, 2, parriedAfter(3, 0, 0), "at 1/60 s")
		assert.Equal(t, 2, parriedAfter(3, 8, 0), "at 0.15 s: past the base window's half, inside the lengthened one's")
	})
	t.Run("R3: negated in the second half, 1 charge", func(t *testing.T) {
		assert.Equal(t, 1, parriedAfter(3, 9, 0), "at 1/6 s")
	})
	t.Run("R3: 2 charges never pass the cap", func(t *testing.T) {
		assert.Equal(t, 3, parriedAfter(3, 0, 2))
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, 1, parriedAfter(2, 0, 0))
	})
}

// Bloodied Riposte: +8% riposte damage a rank; at R3 a riposte that hits
// heals 5% of max HP, once per riposte.
func TestKicker_BloodiedRiposte(t *testing.T) {
	t.Run("the stat, each rank: the riposte, not the cut", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newMercWorld(passivetree.Ranks{"mercenary.t5a": rank}, neverCrit, 3)
			target := dummy(w.em, 140, 100)
			w.cast(components.AttackCut, 200, 100)
			assert.Equal(t, 1000-mercRiposte(8*float64(rank)), health(target), "rank %d", rank)

			w = newMercWorld(passivetree.Ranks{"mercenary.t5a": rank}, neverCrit, 0)
			target = dummy(w.em, 140, 100)
			w.cast(components.AttackCut, 200, 100)
			assert.Equal(t, 1000-cutDamage(0, false), health(target), "rank %d: the cut as it is", rank)
		}
	})

	// riposteOn throws a riposte at the merc on hp of 200 into ghouls, returning
	// the merc's health after
	riposteOn := func(rank, hp, ghouls, charges int) int {
		w := newMercWorld(passivetree.Ranks{"mercenary.t5a": rank}, neverCrit, charges)
		healthOf(w.body).CurrentHealth = hp
		for i := range ghouls {
			ghoul(w.em, 140, 90+float64(10*i), 1000)
		}
		w.cast(components.AttackCut, 200, 100)
		return health(w.body)
	}

	t.Run("R3: a riposte that hits heals 5% of max HP", func(t *testing.T) {
		assert.Equal(t, 110, riposteOn(3, 100, 1, 3), "5% of 200")
	})
	t.Run("R3: once per riposte, however many it hits", func(t *testing.T) {
		assert.Equal(t, 110, riposteOn(3, 100, 3, 3))
	})
	t.Run("R3: never past max HP", func(t *testing.T) {
		assert.Equal(t, ownMaxHealth, riposteOn(3, 195, 1, 3))
	})
	t.Run("R3: a riposte into empty air heals nothing", func(t *testing.T) {
		assert.Equal(t, 100, riposteOn(3, 100, 0, 3))
	})
	t.Run("R3: a cut heals nothing", func(t *testing.T) {
		assert.Equal(t, 100, riposteOn(3, 100, 1, 0))
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, 100, riposteOn(2, 100, 1, 3))
	})
}

// Steady Hand: the cut's cooldown 4% shorter a rank; at R3 a cut that kills
// grants 1 parry charge, capped.
func TestKicker_SteadyHand(t *testing.T) {
	t.Run("the stat, each rank: the cut's cooldown", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newMercWorld(passivetree.Ranks{"mercenary.t5b": rank}, neverCrit, 0)
			w.cast(components.AttackCut, 200, 100)
			assert.InDelta(t, 0.25*(1-0.04*float64(rank)), cooldownsOf(w.body)[components.AttackCut], 1e-9, "rank %d", rank)
		}
	})
	t.Run("the stat: with worn attack speed on top", func(t *testing.T) {
		w := newMercWorld(passivetree.Ranks{"mercenary.t5b": 3}, neverCrit, 0)
		wear(w.em, w.body, glovesSlot, types.ItemTypeArmor, affix(types.AffixAttackSpeed, 20))
		gearPass(w.em)
		w.cast(components.AttackCut, 200, 100)
		assert.InDelta(t, 0.25*0.88/1.2, cooldownsOf(w.body)[components.AttackCut], 1e-9)
	})
	t.Run("the stat: the riposte's cooldown is its own row's", func(t *testing.T) {
		w := newMercWorld(passivetree.Ranks{"mercenary.t5b": 3}, neverCrit, 3)
		w.cast(components.AttackCut, 200, 100)
		assert.InDelta(t, 0.25, cooldownsOf(w.body)[components.AttackCut], 1e-9)
	})

	// cutKilling cuts ghouls of hp, returning the merc's parry charges after
	cutKilling := func(rank, charges, ghouls, hp int) int {
		w := newMercWorld(passivetree.Ranks{"mercenary.t5b": rank}, neverCrit, charges)
		for i := range ghouls {
			ghoul(w.em, 140, 95+float64(10*i), hp)
		}
		w.cast(components.AttackCut, 200, 100)
		return pool(w.body)
	}

	t.Run("R3: a cut that kills grants 1 parry charge", func(t *testing.T) {
		assert.Equal(t, 1, cutKilling(3, 0, 1, 1))
	})
	t.Run("R3: once per cut, however many it kills", func(t *testing.T) {
		assert.Equal(t, 2, cutKilling(3, 1, 2, 1))
	})
	t.Run("R3: a cut that kills nothing grants none", func(t *testing.T) {
		assert.Equal(t, 0, cutKilling(3, 0, 1, 1000))
	})
	t.Run("R3: a riposte that kills grants none", func(t *testing.T) {
		assert.Equal(t, 0, cutKilling(3, 3, 1, 1), "all 3 spent")
	})
	t.Run("R3: never past the cap", func(t *testing.T) {
		// a cut throws only below 3 charges (at 3 it is the riposte), so its
		// kill at 2 is the highest it reaches
		assert.Equal(t, 3, cutKilling(3, 2, 1, 1))
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, 0, cutKilling(2, 0, 1, 1))
	})
}
