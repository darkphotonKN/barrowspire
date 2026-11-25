package systems

import (
	"math"
	"sort"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	FS-8RZ51 §F R29, the warrior's and the mage's kickers: each node's stat at
	R1, R2 and R3, and its R3 rule only at R3. Every test body is a rankedBody:
	Attack 12, Strength 8, Intelligence 9, own max HP 200, nothing worn.
*/

// kickerWorld is a world with one ranked body standing at (100, 100).
type kickerWorld struct {
	em     *ecs.EntityManager
	body   *ecs.Entity
	move   *MovementSystem
	combat *CombatSystem
}

func newKickerWorld(class string, ranks passivetree.Ranks, roll func() float64) *kickerWorld {
	em := ecs.NewEntityManager()
	return &kickerWorld{
		em:     em,
		body:   rankedBody(em, class, ranks),
		move:   NewMovementSystem(),
		combat: NewCombatSystem(em, roll, PlayerDamageOff, testUniqueEffects),
	}
}

// tick steps combat alone, so no body is pushed off where it stands.
func (w *kickerWorld) tick(impacts ...Impact) []KillRecord {
	return w.combat.Update(tickSeconds, w.em.GetAllEntities(), impacts)
}

// step steps movement then combat, the order a world steps them in, so a
// charge runs.
func (w *kickerWorld) step() {
	w.move.Update(tickSeconds, w.em.GetAllEntities())
	w.combat.Update(tickSeconds, w.em.GetAllEntities(), nil)
}

func (w *kickerWorld) ticks(n int) {
	for range n {
		w.tick()
	}
}

// cast queues kind aimed at (x, y) and resolves it on one tick.
func (w *kickerWorld) cast(kind components.AttackKind, x, y float64) []KillRecord {
	intend(w.body, components.AttackIntent{Kind: kind, TargetX: x, TargetY: y})
	return w.tick()
}

// slashDamage is a rankedBody's unmitigated, non-crit slash at a coefficient
// percent more.
func slashDamage(percent float64) int {
	return int(math.Round(RawDamage(12, 1.5*(1+percent/100), 8)))
}

// Heavy Hand: +6% slash damage a rank; at R3 a slash hitting 2 or more
// monsters refunds 5 stamina.
func TestKicker_HeavyHand(t *testing.T) {
	t.Run("the stat, each rank", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t2a": rank}, neverCrit)
			target := dummy(w.em, 140, 100)
			w.cast(components.AttackSlash, 200, 100)
			assert.Equal(t, 1000-slashDamage(6*float64(rank)), health(target), "rank %d", rank)
		}
	})

	twoGhouls := func(w *kickerWorld) {
		ghoul(w.em, 140, 100, 1000)
		ghoul(w.em, 130, 120, 1000)
	}

	t.Run("R3: a slash on two monsters refunds 5", func(t *testing.T) {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t2a": 3}, neverCrit)
		twoGhouls(w)
		resourceOf(w.body).Current = 50
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, 55, pool(w.body))
	})

	t.Run("R3: a slash on one monster refunds nothing", func(t *testing.T) {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t2a": 3}, neverCrit)
		ghoul(w.em, 140, 100, 1000)
		dummy(w.em, 130, 120)
		resourceOf(w.body).Current = 50
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, 50, pool(w.body), "a dummy is no monster")
	})

	t.Run("R2: no rule", func(t *testing.T) {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t2a": 2}, neverCrit)
		twoGhouls(w)
		resourceOf(w.body).Current = 50
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, 50, pool(w.body))
	})

	t.Run("R3: a refund at a full pool leaves it at max", func(t *testing.T) {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t2a": 3}, neverCrit)
		twoGhouls(w)
		resourceOf(w.body).Current = 98
		w.cast(components.AttackSlash, 200, 100)
		require.Equal(t, 100, resourceOf(w.body).Max)
		assert.Equal(t, 100, pool(w.body))
	})
}

// a monster's strike of 100 raw: 83 through a rankedBody's 10 defense.
func monsterBlow() components.AttackSnapshot {
	return components.AttackSnapshot{
		AttackerEntityID: uuid.New(), DamageType: components.DamagePhysical,
		Power: 100, Coefficient: 1, CritChance: BaseCritChance, FromMonster: true,
	}
}

const monsterBlowTaken = 83

// Thick Skin: +4% max HP a rank; at R3, below half max HP, damage taken is
// 10% less.
func TestKicker_ThickSkin(t *testing.T) {
	t.Run("the stat, each rank", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t2b": rank}, neverCrit)
			assert.Equal(t, ownMaxHealth+8*rank, healthOf(w.body).MaxHealth, "rank %d", rank)
			assert.Equal(t, ownMaxHealth+8*rank, healthOf(w.body).CurrentHealth, "rank %d", rank)
		}
	})

	struck := func(rank, current int) int {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t2b": rank}, neverCrit)
		healthOf(w.body).CurrentHealth = current
		w.tick(Impact{Attack: monsterBlow(), TargetEntityID: w.body.ID})
		return current - healthOf(w.body).CurrentHealth
	}

	// R3's max is 224: below half is under 112
	t.Run("R3: below half, 10% less", func(t *testing.T) {
		assert.Equal(t, 75, struck(3, 111), "83 × 0.9 = 74.7")
	})
	t.Run("R3: at half or above, as it is", func(t *testing.T) {
		assert.Equal(t, monsterBlowTaken, struck(3, 112))
		assert.Equal(t, monsterBlowTaken, struck(3, 224))
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, monsterBlowTaken, struck(2, 100), "below half of 216")
	})
}

// regenOf is what a class body holding ranks regains from empty in 2.5 s.
func regenOf(class string, ranks passivetree.Ranks) int {
	return statsOfClass(class, ranks).Regen
}

// Long Wind: +10% stamina regen a rank; at R3 a kill refunds 15 stamina.
func TestKicker_LongWind(t *testing.T) {
	t.Run("the stat, each rank", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			assert.Equal(t, 50+5*rank, regenOf("warrior", passivetree.Ranks{"warrior.t5a": rank}), "20/s over 2.5 s, rank %d", rank)
		}
	})

	killWith := func(rank, stamina int) int {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t5a": rank}, neverCrit)
		ghoul(w.em, 140, 100, 1)
		resourceOf(w.body).Current = stamina
		require.Len(t, w.cast(components.AttackSlash, 200, 100), 1)
		return pool(w.body)
	}

	t.Run("R3: a kill refunds 15", func(t *testing.T) {
		assert.Equal(t, 65, killWith(3, 50))
	})
	t.Run("R3: a refund at a full pool leaves it at max", func(t *testing.T) {
		assert.Equal(t, 100, killWith(3, 90))
	})
	t.Run("R3: someone else's kill refunds nothing", func(t *testing.T) {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t5a": 3}, neverCrit)
		g := ghoul(w.em, 140, 100, 1)
		resourceOf(w.body).Current = 50
		require.Len(t, w.tick(Impact{Attack: lethal(uuid.New()), TargetEntityID: g.ID}), 1)
		assert.Equal(t, 50, pool(w.body))
	})
	t.Run("R3: a hit that leaves it alive refunds nothing", func(t *testing.T) {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t5a": 3}, neverCrit)
		ghoul(w.em, 140, 100, 1000)
		resourceOf(w.body).Current = 50
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, 50, pool(w.body))
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, 50, killWith(2, 50))
	})
}

// Bull Rush: the dash costs 3 less stamina a rank; at R3 the warrior's first
// hit after a dash ends is a forced crit, if it lands within 3 s.
func TestKicker_BullRush(t *testing.T) {
	t.Run("the stat, each rank: affordable at the lowered cost", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t5b": rank}, neverCrit)
			cost := 25 - 3*rank
			assert.Equal(t, cost, CastCost(w.body, components.AttackDash), "rank %d", rank)

			resourceOf(w.body).Current = cost
			w.cast(components.AttackDash, 400, 100)
			assert.True(t, dashing(w.body), "rank %d: %d stamina pays for it", rank, cost)
			assert.Equal(t, 0, pool(w.body), "rank %d", rank)
		}
	})
	t.Run("short of the lowered cost, refused", func(t *testing.T) {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t5b": 3}, neverCrit)
		resourceOf(w.body).Current = 15
		w.cast(components.AttackDash, 400, 100)
		assert.False(t, dashing(w.body))
		assert.Equal(t, 15, pool(w.body))
	})

	crit := int(math.Round(RawDamage(12, 1.5, 8) * CritMultiplier))
	plain := slashDamage(0)

	// dashed dashes the body out and ticks until its charge has ended, then
	// waits ticks more and slashes a dummy twice, a cooldown apart, returning
	// each slash's damage.
	dashed := func(rank, wait int) (first, second int) {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t5b": rank}, neverCrit)
		w.cast(components.AttackDash, 400, 100)
		for dashing(w.body) {
			w.step()
		}
		w.ticks(wait)
		at := transformOf(t, w.body)
		target := dummy(w.em, at.X+40, at.Y)
		w.cast(components.AttackSlash, at.X+100, at.Y)
		first = 1000 - health(target)
		w.ticks(37) // past the 0.6 s attack pin (FS-JS7C8)
		w.cast(components.AttackSlash, at.X+100, at.Y)
		return first, 1000 - first - health(target)
	}

	t.Run("R3: the first hit after the dash crits, the next does not", func(t *testing.T) {
		first, second := dashed(3, 0)
		assert.Equal(t, crit, first)
		assert.Equal(t, plain, second)
	})
	t.Run("R3: within 3 s", func(t *testing.T) {
		first, _ := dashed(3, 173) // the slash lands 2.9 s after
		assert.Equal(t, crit, first)
	})
	t.Run("R3: 3 s on, no crit", func(t *testing.T) {
		first, _ := dashed(3, 179) // the slash lands 3 s after
		assert.Equal(t, plain, first)
	})
	t.Run("R2: no rule", func(t *testing.T) {
		first, _ := dashed(2, 0)
		assert.Equal(t, plain, first)
	})
	t.Run("R3: no dash, no crit", func(t *testing.T) {
		w := newKickerWorld("warrior", passivetree.Ranks{"warrior.t5b": 3}, neverCrit)
		target := dummy(w.em, 140, 100)
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, 1000-plain, health(target))
	})
}

// fired casts kind toward +x and returns what it fired.
func (w *kickerWorld) fired(kind components.AttackKind) []*components.ProjectileComponent {
	w.cast(kind, 400, 100)
	return projectiles(w.em)
}

// Kindling: +6% left-click fireball damage a rank; at R3 a left-click
// fireball's crit refunds 5 mana.
func TestKicker_Kindling(t *testing.T) {
	t.Run("the stat, each rank: the left-click fireball only", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			ranks := passivetree.Ranks{"mage.t2a": rank}
			shots := newKickerWorld("mage", ranks, neverCrit).fired(components.AttackFireball)
			require.Len(t, shots, 1)
			assert.InDelta(t, 1.1*(1+0.06*float64(rank)), shots[0].Attack.Coefficient, 1e-9, "rank %d", rank)

			for _, shot := range newKickerWorld("mage", ranks, neverCrit).fired(components.AttackTripleFireball) {
				assert.InDelta(t, 0.9, shot.Attack.Coefficient, 1e-9, "rank %d: the volley is not the left-click", rank)
			}
		}
	})

	// landed fires kind with the roll given and lands its first fireball on a
	// ghoul, returning the mage's mana after
	landed := func(rank int, kind components.AttackKind, roll func() float64, mana int) int {
		w := newKickerWorld("mage", passivetree.Ranks{"mage.t2a": rank}, roll)
		g := ghoul(w.em, 300, 100, 1000)
		shot := w.fired(kind)[0]
		resourceOf(w.body).Current = mana
		w.tick(Impact{Attack: shot.Attack, TargetEntityID: g.ID})
		return pool(w.body)
	}

	t.Run("R3: a crit refunds 5", func(t *testing.T) {
		assert.Equal(t, 55, landed(3, components.AttackFireball, alwaysCrit, 50))
	})
	t.Run("R3: a refund at a full pool leaves it at max", func(t *testing.T) {
		assert.Equal(t, 150, landed(3, components.AttackFireball, alwaysCrit, 148))
	})
	t.Run("R3: no crit, no refund", func(t *testing.T) {
		assert.Equal(t, 50, landed(3, components.AttackFireball, neverCrit, 50))
	})
	t.Run("R3: a volley fireball's crit refunds nothing", func(t *testing.T) {
		assert.Equal(t, 50, landed(3, components.AttackTripleFireball, alwaysCrit, 50))
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, 50, landed(2, components.AttackFireball, alwaysCrit, 50))
	})
}

// manaOver4s is what a mage holding ranks regains from empty in 4 s.
func manaOver4s(ranks passivetree.Ranks) int {
	em := ecs.NewEntityManager()
	mage := rankedBody(em, "mage", ranks)
	resourceOf(mage).Current = 0
	regenTicks(em, 120, worldTick)
	return resourceOf(mage).Current
}

// Deep Well: +15 max mana a rank; at R3 mana regen is 25% more.
func TestKicker_DeepWell(t *testing.T) {
	t.Run("the stat, each rank", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newKickerWorld("mage", passivetree.Ranks{"mage.t2b": rank}, neverCrit)
			assert.Equal(t, 150+15*rank, resourceOf(w.body).Max, "rank %d", rank)
			assert.Equal(t, 150+15*rank, pool(w.body), "rank %d: a full bar stays full", rank)
		}
	})
	t.Run("R3: 25% more regen", func(t *testing.T) {
		assert.Equal(t, 20, manaOver4s(passivetree.Ranks{"mage.t2b": 3}), "4/s × 1.25 over 4 s")
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, 16, manaOver4s(passivetree.Ranks{"mage.t2b": 2}))
	})
}

// shotAngles is every projectile's flight angle and speed, in angle order.
func shotAngles(em *ecs.EntityManager) (angles, speeds []float64) {
	for _, e := range em.GetAllEntities() {
		if !e.HasComponent(ecs.ComponentTypeProjectile) {
			continue
		}
		vc, _ := e.GetComponent(ecs.ComponentTypeVelocity)
		v := vc.(*components.VelocityComponent)
		angles = append(angles, math.Atan2(v.VY, v.VX))
		speeds = append(speeds, math.Hypot(v.VX, v.VY))
	}
	sort.Float64s(angles)
	return angles, speeds
}

// Wide Volley: the triple fireball costs 2 less mana a rank; at R3 it throws
// 5 fireballs, one more step either side.
func TestKicker_WideVolley(t *testing.T) {
	t.Run("the stat, each rank: affordable at the lowered cost", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			w := newKickerWorld("mage", passivetree.Ranks{"mage.t5a": rank}, neverCrit)
			cost := 15 - 2*rank
			assert.Equal(t, cost, CastCost(w.body, components.AttackTripleFireball), "rank %d", rank)

			resourceOf(w.body).Current = cost
			assert.NotEmpty(t, w.fired(components.AttackTripleFireball), "rank %d: %d mana pays for it", rank, cost)
			assert.Equal(t, 0, pool(w.body), "rank %d", rank)
		}
	})
	t.Run("short of the lowered cost, refused", func(t *testing.T) {
		w := newKickerWorld("mage", passivetree.Ranks{"mage.t5a": 3}, neverCrit)
		resourceOf(w.body).Current = 8
		assert.Empty(t, w.fired(components.AttackTripleFireball))
		assert.Equal(t, 8, pool(w.body))
	})

	t.Run("R3: five fireballs, one more step either side", func(t *testing.T) {
		w := newKickerWorld("mage", passivetree.Ranks{"mage.t5a": 3}, neverCrit)
		w.fired(components.AttackTripleFireball)
		angles, _ := shotAngles(w.em)
		require.Len(t, angles, 5)
		for i, want := range []float64{-0.52, -0.26, 0, 0.26, 0.52} {
			assert.InDelta(t, want, angles[i], 1e-9)
		}
		assert.Equal(t, []float64{-0.26, 0, 0.26}, attackTable[components.AttackTripleFireball].projectile.spread, "the row is never written")
	})
	t.Run("R3: the left-click still throws one", func(t *testing.T) {
		w := newKickerWorld("mage", passivetree.Ranks{"mage.t5a": 3}, neverCrit)
		assert.Len(t, w.fired(components.AttackFireball), 1)
	})
	t.Run("R2: no rule", func(t *testing.T) {
		w := newKickerWorld("mage", passivetree.Ranks{"mage.t5a": 2}, neverCrit)
		assert.Len(t, w.fired(components.AttackTripleFireball), 3)
	})
}

// Searing: +8% flight speed a rank on both fireball kinds; at R3 they pierce
// one more monster, on top of a worn Lantern's.
func TestKicker_Searing(t *testing.T) {
	t.Run("the stat, each rank", func(t *testing.T) {
		for rank := 0; rank <= 3; rank++ {
			for kind, base := range map[components.AttackKind]float64{components.AttackFireball: 350 * constants.PaceScale, components.AttackTripleFireball: 360 * constants.PaceScale} {
				w := newKickerWorld("mage", passivetree.Ranks{"mage.t5b": rank}, neverCrit)
				w.fired(kind)
				_, speeds := shotAngles(w.em)
				require.NotEmpty(t, speeds)
				for _, speed := range speeds {
					assert.InDelta(t, base*(1+0.08*float64(rank)), speed, 1e-9, "%s at rank %d", kind, rank)
				}
				for _, shot := range projectiles(w.em) {
					assert.InDelta(t, base*(1+0.08*float64(rank)), shot.Speed, 1e-9, "%s at rank %d", kind, rank)
				}
			}
		}
	})

	pierceOf := func(rank int, kind components.AttackKind, lantern bool) []int {
		w := newKickerWorld("mage", passivetree.Ranks{"mage.t5b": rank}, neverCrit)
		if lantern {
			wearUnique(w.em, w.body, ring1Slot, types.ItemTypeRing, types.UniqueEffectPierce)
		}
		var out []int
		for _, shot := range w.fired(kind) {
			out = append(out, shot.PierceLeft)
		}
		return out
	}

	t.Run("R3: both kinds pierce one more", func(t *testing.T) {
		assert.Equal(t, []int{1}, pierceOf(3, components.AttackFireball, false))
		assert.Equal(t, []int{1, 1, 1}, pierceOf(3, components.AttackTripleFireball, false))
	})
	t.Run("R3: on top of a worn Lantern's", func(t *testing.T) {
		assert.Equal(t, []int{testUniqueEffects.PierceExtraTargets + 1}, pierceOf(3, components.AttackFireball, true))
	})
	t.Run("R2: no rule", func(t *testing.T) {
		assert.Equal(t, []int{0}, pierceOf(2, components.AttackFireball, false))
	})
}
