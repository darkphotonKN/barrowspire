package systems

import (
	"fmt"
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	The attack pin (FS-JS7C8 §Change: Attacking pins the attacker, R49–R60): a
	player whose attacking cast resolves walks at full speed on that tick, then
	stands for 0.6 s (shortened by worn attack speed) with the direction they
	hold kept, then walks it on the first tick after. While pinned every cast
	on an attack-table row is refused as if on cooldown, the dash included; the
	parry is exempt. The dash never pins, nor do monsters. VelocityComponent,
	which the wire reports as direction, is never written by the pin.

	These tests tick at the world's own 30 Hz (worldTick), so the window reads
	in the FS's tick counts.
*/

// pinTicks is the unequipped pin at 30 Hz: 0.6 s, 18 ticks (R50).
const pinTicks = 18

var worldStep = constants.DefaultSpeed * worldTick

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

// assertStandsThenWalks checks each step: none for the first `pinned`, a full
// step after.
func assertStandsThenWalks(t *testing.T, got []float64, pinned int, full float64) {
	t.Helper()
	want := make([]float64, len(got))
	for i := range want {
		if i >= pinned {
			want[i] = full
		}
	}
	assert.InDeltaSlice(t, want, got, 1e-9, "each tick's step after the cast")
}

func pinned(e *ecs.Entity) bool {
	return e.HasComponent(ecs.ComponentTypeAttackPin)
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

// pinningCasts stands a caster of each pinning kind (R51) at (300, 300) with
// that cast queued toward +x.
var pinningCasts = []struct {
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

// Each pinning kind, resolved, walks at full speed on its own tick, then stands
// its caster for exactly 18 ticks with the held direction kept, then walks it
// at full speed. Speed, what the wire reports as direction.speed, never
// changes (R49, R50, R52, R60).
func TestAttackPin_EachPinningKindStandsTheCasterFor18Ticks(t *testing.T) {
	for _, tt := range pinningCasts {
		t.Run(tt.name, func(t *testing.T) {
			w := newDashWorldAt(worldTick)
			caster := walking(tt.cast(w.em), 0, 1)

			w.tick() // the walk's tick at full speed, then the cast resolves
			require.InDelta(t, 300+worldStep, transformOf(t, caster).Y, 1e-9)
			require.Positive(t, cooldownOf(caster, castKind(caster)), "the cast resolved")

			for i := range pinTicks {
				w.tick()
				require.InDelta(t, 300+worldStep, transformOf(t, caster).Y, 1e-9, "tick %d: pinned", i+1)
				v := velocityOf(t, caster)
				require.Equal(t, [2]float64{0, 1}, [2]float64{v.VX, v.VY}, "tick %d: the held direction kept", i+1)
			}
			assertStandsThenWalks(t, steps(t, w, caster, 3), 0, worldStep)
			assert.Equal(t, constants.DefaultSpeed, velocityOf(t, caster).Speed, "Speed is never written by the pin")
		})
	}
}

// Worn attack speed, already capped, shortens the pin as it shortens a
// cooldown: +50% (the cap) pins for 0.4 s, +20% for 0.5 s (R50).
func TestAttackPin_WornAttackSpeedShortensIt(t *testing.T) {
	tests := []struct {
		percent int
		ticks   int
	}{
		{0, pinTicks},
		{20, 15},
		{50, 12},
	}
	for _, tt := range tests {
		t.Run(fmt.Sprintf("+%d%%", tt.percent), func(t *testing.T) {
			w := newDashWorldAt(worldTick)
			d := walking(delver(w.em, 300, 300), 0, 1)
			d.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: tt.percent})
			intend(d, components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 300})

			w.tick()
			assertStandsThenWalks(t, steps(t, w, d, tt.ticks+3), tt.ticks, worldStep)
		})
	}
}

// pinRemaining is the seconds left on e's pin, 0 when it carries none.
func pinRemaining(e *ecs.Entity) float64 {
	pc, ok := e.GetComponent(ecs.ComponentTypeAttackPin)
	if !ok {
		return 0
	}
	return pc.(*components.AttackPinComponent).Remaining
}

// unhurt reports whether every body but the caster is still at full health.
func unhurt(em *ecs.EntityManager, caster *ecs.Entity) bool {
	for _, e := range em.GetAllEntities() {
		hc, ok := e.GetComponent(ecs.ComponentTypeHealth)
		if !ok || e.ID == caster.ID {
			continue
		}
		if h := hc.(*components.HealthComponent); h.CurrentHealth < h.MaxHealth {
			return false
		}
	}
	return true
}

// While pinned, every pinning kind and the dash is refused as a cast on
// cooldown is: no damage or projectile, the resource unchanged, no cooldown,
// no charge, and the pin neither restarted nor ended early (R53, R55).
func TestAttackPin_APinnedCastersCastsAreRefused(t *testing.T) {
	casts := append(pinningCasts, struct {
		name string
		cast func(em *ecs.EntityManager) *ecs.Entity
	}{"dash", func(em *ecs.EntityManager) *ecs.Entity {
		d := delver(em, 300, 300)
		dashToward(d, 400, 300)
		return d
	}})

	for _, tt := range casts {
		t.Run(tt.name, func(t *testing.T) {
			w := newDashWorldAt(worldTick)
			caster := tt.cast(w.em)
			dummy(w.em, 340, 300) // in reach of every cone and strike
			startAttackPin(caster, AttackPinDuration)
			resourceBefore := pool(caster)

			w.tick()

			assert.True(t, unhurt(w.em, caster), "no damage")
			assert.Empty(t, projectiles(w.em), "no projectile")
			assert.Equal(t, resourceBefore, pool(caster), "nothing spent")
			assert.Empty(t, castKind(caster), "no cooldown started")
			assert.False(t, dashing(caster), "no charge")
			assert.InDelta(t, AttackPinDuration-worldTick, pinRemaining(caster), 1e-9, "the pin runs on untouched")
		})
	}
}

// Two casts queued on one tick: the first resolves and pins, the second is
// refused (R53).
func TestAttackPin_TheSecondOfTwoCastsOnOneTickIsRefused(t *testing.T) {
	w := newDashWorldAt(worldTick)
	d := delver(w.em, 300, 300)
	intend(d, components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 300})
	intend(d, components.AttackIntent{Kind: components.AttackArrow, TargetX: 400, TargetY: 300})

	w.tick()

	assert.Positive(t, cooldownOf(d, components.AttackSlash), "the slash resolved")
	assert.InDelta(t, AttackPinDuration, pinRemaining(d), 1e-9, "and pinned")
	assert.Zero(t, cooldownOf(d, components.AttackArrow), "the arrow was refused")
	assert.Empty(t, projectiles(w.em), "and fired nothing")
}

// A cast refused for its cooldown, its cost or its target starts no pin; nor
// does raising the parry stance (R51, R54).
func TestAttackPin_RefusedCastsAndTheParryNeverPin(t *testing.T) {
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
			castParry(m)
			return m
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newDashWorldAt(worldTick)
			caster := walking(tt.cast(w.em), 0, 1)

			w.tick()
			assert.False(t, pinned(caster))
			assertStandsThenWalks(t, steps(t, w, caster, pinTicks+2), 0, worldStep)
		})
	}
}

// A parry while pinned opens the stance as it does unpinned, and leaves the
// pin as it was (R54).
func TestAttackPin_AParryWhilePinnedOpensTheStance(t *testing.T) {
	w := newDashWorldAt(worldTick)
	m := parryMerc(w.em, 300, 300)
	startAttackPin(m, AttackPinDuration)
	castParry(m)

	w.tick()

	assert.True(t, parryOf(m).Open, "the stance is up")
	assert.InDelta(t, AttackPinDuration-worldTick, pinRemaining(m), 1e-9, "the pin runs on untouched")
}

// A resolved dash starts no pin, so the walk right after its charge is at full
// speed; a pinning cast resolving while a charge is in flight stops the charge
// where the body stands and pins (R55).
func TestAttackPin_TheDashNeverPinsAndACastDuringItsChargeStopsItAndPins(t *testing.T) {
	t.Run("the walk after the charge is at full speed", func(t *testing.T) {
		w := newDashWorldAt(worldTick)
		d := walking(delver(w.em, 300, 300), 1, 0)
		dashToward(d, 300+worldStep, 600) // straight down from where the walk's tick leaves it

		w.tick()
		require.True(t, dashing(d))
		assert.False(t, pinned(d), "the dash never pins")
		for dashing(d) {
			w.tick()
		}
		assertStandsThenWalks(t, steps(t, w, d, 3), 0, worldStep)
	})

	t.Run("a slash during the charge stops it and pins", func(t *testing.T) {
		w := newDashWorldAt(worldTick)
		d := delver(w.em, 300, 300)
		dashToward(d, 300, 600)
		w.ticks(3) // the cast, then two steps of the charge
		require.True(t, dashing(d))

		intend(d, components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 300})
		w.tick()
		stoppedAt := *transformOf(t, d)

		assert.False(t, dashing(d), "the charge is over")
		assert.InDelta(t, AttackPinDuration, pinRemaining(d), 1e-9, "and the slash pins")
		w.ticks(3)
		assert.Equal(t, stoppedAt, *transformOf(t, d), "it stands where the charge stopped")
	})
}

// A monster's strike neither ends nor extends a delver's pin, and pins neither
// the monster nor the delver (R57).
func TestAttackPin_MonsterStrikesNeverTouchThePin(t *testing.T) {
	t.Run("on a pinned delver", func(t *testing.T) {
		w := newDashWorldAt(worldTick)
		d := delver(w.em, 300, 300)
		g := ghoul(w.em, 330, 300, 100)
		g.AddComponent(components.NewAttackIntentComponent())
		startAttackPin(d, AttackPinDuration)
		strikeOn(g, d)

		w.tick()
		require.Less(t, health(d), 150, "the strike landed")
		assert.InDelta(t, AttackPinDuration-worldTick, pinRemaining(d), 1e-9, "the pin runs on untouched")
		assert.False(t, pinned(g), "the monster carries no pin")
	})

	t.Run("on an unpinned delver", func(t *testing.T) {
		w := newDashWorldAt(worldTick)
		d := delver(w.em, 300, 300)
		g := ghoul(w.em, 330, 300, 100)
		g.AddComponent(components.NewAttackIntentComponent())
		strikeOn(g, d)

		w.tick()
		require.Less(t, health(d), 150, "the strike landed")
		assert.False(t, pinned(d), "the strike pins nobody")
		assert.False(t, pinned(g))
	})
}

// A move during the pin changes the held direction, never the position; once
// the pin is over the body walks the latest direction, or stands if it was a
// stop. Nothing earlier replays (R52).
func TestAttackPin_AMoveDuringThePinIsWalkedAfterIt(t *testing.T) {
	tests := []struct {
		name   string
		vx, vy float64
		step   float64
	}{
		{"a changed direction", 1, 0, worldStep},
		{"a stop", 0, 0, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newDashWorldAt(worldTick)
			d := walking(delver(w.em, 300, 300), 0, 1)
			intend(d, components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 300})
			w.tick()
			w.ticks(5)
			at := *transformOf(t, d)

			v := velocityOf(t, d)
			v.VX, v.VY = tt.vx, tt.vy // what handleMove writes for a move
			w.ticks(pinTicks - 5)
			require.Equal(t, at, *transformOf(t, d), "the move never moved the pinned body")

			w.tick()
			assert.InDelta(t, at.X+tt.vx*tt.step, transformOf(t, d).X, 1e-9)
			assert.InDelta(t, at.Y, transformOf(t, d).Y, 1e-9, "the old direction does not replay")
		})
	}
}
