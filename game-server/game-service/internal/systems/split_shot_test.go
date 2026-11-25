package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	FS-E1ZDG §G R25–28, the Hunter's Split Shot: a left-click arrow that crits
	a monster fires one split arrow from it toward the nearest other living
	monster within 220 px, at 60% of the arrow's raw damage, rolling its own
	crit, never splitting, carrying no pierce.
*/

var hunterRanks = passivetree.Ranks{"archer.t6a": 1}

// shotOf casts kind from the body toward +x and returns the snapshot its
// projectile carries, the projectile itself cleared from the world.
func (w *kickerWorld) shotOf(t *testing.T, kind components.AttackKind) components.AttackSnapshot {
	t.Helper()
	shots := w.fired(kind)
	require.Len(t, shots, 1)
	clearShots(w.em)
	return shots[0].Attack
}

// projectileEntities is every projectile in the world, with its place and
// velocity.
func projectileEntities(em *ecs.EntityManager) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range em.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeProjectile) {
			out = append(out, e)
		}
	}
	return out
}

func projectileOf(e *ecs.Entity) *components.ProjectileComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeProjectile)
	return c.(*components.ProjectileComponent)
}

// flyAll steps flight and combat until no projectile is left in the world.
func (w *kickerWorld) flyAll() {
	flight := NewProjectileSystem(w.em, PlayerDamageOff)
	for range 200 {
		if len(projectileEntities(w.em)) == 0 {
			return
		}
		w.tick(flight.Update(tickSeconds, w.em.GetAllEntities())...)
	}
}

// rollsOf draws each value given in turn, then the last one for ever after.
func rollsOf(values ...float64) func() float64 {
	return func() float64 {
		r := values[0]
		if len(values) > 1 {
			values = values[1:]
		}
		return r
	}
}

// R25, R26, R28: a crit on A with B at 150 px and C at 200 px fires one split
// arrow from A straight at B: an ordinary arrow at an arrow's speed and max
// flight, 60% of the arrow's coefficient, its crit chance, no pierce, A
// already hit.
func TestSplitShot_AnArrowCritSplitsTowardTheNearestOtherMonster(t *testing.T) {
	w := newKickerWorld("archer", hunterRanks, alwaysCrit)
	arrow := w.shotOf(t, components.AttackArrow)
	struck := ghoul(w.em, 300, 100, 1000)
	ghoul(w.em, 300, 250, 1000) // B, 150 px below
	ghoul(w.em, 500, 100, 1000) // C, 200 px right

	w.tick(Impact{Attack: arrow, TargetEntityID: struck.ID})

	shots := projectileEntities(w.em)
	require.Len(t, shots, 1)
	split := projectileOf(shots[0])
	x, y := standsAt(shots[0])
	assert.Equal(t, [2]float64{300, 100}, [2]float64{x, y}, "fired from A's position")
	vc, _ := shots[0].GetComponent(ecs.ComponentTypeVelocity)
	velocity := vc.(*components.VelocityComponent)
	assert.InDelta(t, 0, velocity.VX, 1e-9, "straight at B")
	assert.InDelta(t, 480*constants.PaceScale, velocity.VY, 1e-9, "at an arrow's speed")

	assert.Equal(t, "arrow", split.ProjectileType)
	assert.Equal(t, 480*constants.PaceScale, split.Speed)
	assert.Equal(t, 550.0, split.MaxDistance)
	assert.Equal(t, w.body.ID, split.OwnerEntityID)
	assert.InDelta(t, arrow.Coefficient*0.6, split.Attack.Coefficient, 1e-9)
	assert.Equal(t, arrow.Power, split.Attack.Power)
	assert.Equal(t, arrow.ScalingStat, split.Attack.ScalingStat)
	assert.Equal(t, arrow.CritChance, split.Attack.CritChance, "it rolls its own crit")
	assert.Equal(t, components.AttackArrow, split.Attack.Kind)
	assert.True(t, split.Attack.Split, "marked never to split")
	assert.Zero(t, split.PierceLeft)
	assert.Zero(t, split.Attack.Pierce)
	assert.Equal(t, []uuid.UUID{struck.ID}, split.HitEntityIDs)
}

// R25: no other living monster within 220 px, no split: one at 221 px, a
// dead one, a delver and a dummy are no mark.
func TestSplitShot_NothingInReachNoSplit(t *testing.T) {
	w := newKickerWorld("archer", hunterRanks, alwaysCrit)
	arrow := w.shotOf(t, components.AttackArrow)
	struck := ghoul(w.em, 300, 100, 1000)
	ghoul(w.em, 521, 100, 1000)
	ghoul(w.em, 320, 100, 0)
	delver(w.em, 300, 130)
	dummy(w.em, 300, 70)

	w.tick(Impact{Attack: arrow, TargetEntityID: struck.ID})

	assert.Less(t, health(struck), 1000)
	assert.Empty(t, projectileEntities(w.em))
}

// R25: 220 px is within; a killing crit still splits, and the nearest of
// several is the mark.
func TestSplitShot_AKillingCritSplitsAt220px(t *testing.T) {
	w := newKickerWorld("archer", hunterRanks, alwaysCrit)
	arrow := w.shotOf(t, components.AttackArrow)
	struck := ghoul(w.em, 300, 100, 5)
	ghoul(w.em, 300, 320, 1000)

	kills := w.tick(Impact{Attack: arrow, TargetEntityID: struck.ID})

	assert.Len(t, kills, 1)
	shots := projectileEntities(w.em)
	require.Len(t, shots, 1)
	vc, _ := shots[0].GetComponent(ecs.ComponentTypeVelocity)
	assert.InDelta(t, math.Pi/2, math.Atan2(vc.(*components.VelocityComponent).VY, vc.(*components.VelocityComponent).VX), 1e-9)
}

// R26: in flight, the split arrow deals 60% of the arrow's raw damage, rolls
// its own crit, never hits A, stops at its first hit, and its crit never
// splits.
func TestSplitShot_TheSplitArrowsHit(t *testing.T) {
	splitRaw := func(arrow components.AttackSnapshot) float64 {
		return RawDamage(arrow.Power, arrow.Coefficient*0.6, arrow.ScalingStat)
	}

	t.Run("no crit: 60% of the arrow's raw damage, A spared, the first hit stops it", func(t *testing.T) {
		w := newKickerWorld("archer", hunterRanks, rollsOf(0, 0.999))
		arrow := w.shotOf(t, components.AttackArrow)
		struck := ghoul(w.em, 300, 100, 1000)
		mark := ghoul(w.em, 300, 250, 1000)
		behind := ghoul(w.em, 300, 290, 1000)

		w.tick(Impact{Attack: arrow, TargetEntityID: struck.ID})
		hitA := health(struck)
		w.flyAll()

		assert.Equal(t, hitA, health(struck), "it never hits the monster it split from")
		assert.Equal(t, 1000-int(math.Round(splitRaw(arrow))), health(mark))
		assert.Equal(t, 1000, health(behind), "no pierce: it stops at its first hit")
	})

	t.Run("a crit: 1.5×, and no further split", func(t *testing.T) {
		w := newKickerWorld("archer", hunterRanks, alwaysCrit)
		arrow := w.shotOf(t, components.AttackArrow)
		struck := ghoul(w.em, 300, 100, 1000)
		mark := ghoul(w.em, 300, 250, 1000)
		beyond := ghoul(w.em, 450, 250, 1000) // 150 px from the mark, 212 from A

		w.tick(Impact{Attack: arrow, TargetEntityID: struck.ID})
		require.Len(t, projectileEntities(w.em), 1)
		w.flyAll()

		assert.Equal(t, 1000-int(math.Round(splitRaw(arrow)*CritMultiplier)), health(mark))
		assert.Equal(t, 1000, health(beyond), "the split arrow's crit never splits")
	})
}

// R27: an arrow that pierces splits on each impact that crits.
func TestSplitShot_APiercingArrowSplitsOnEachCrit(t *testing.T) {
	w := newKickerWorld("archer", hunterRanks, alwaysCrit)
	arrow := w.shotOf(t, components.AttackArrow)
	arrow.Pierce = 1
	first := ghoul(w.em, 300, 100, 1000)
	second := ghoul(w.em, 340, 100, 1000)

	w.tick(Impact{Attack: arrow, TargetEntityID: first.ID})
	w.tick(Impact{Attack: arrow, TargetEntityID: second.ID})

	shots := projectileEntities(w.em)
	require.Len(t, shots, 2)
	var from []uuid.UUID
	for _, s := range shots {
		from = append(from, projectileOf(s).HitEntityIDs...)
	}
	assert.ElementsMatch(t, []uuid.UUID{first.ID, second.ID}, from)
}

// R25, R27: only a Hunter's left-click arrow crit on a monster splits: not a
// non-crit, not a Shadow Shot, not a Shadow Ranger's or an unspecialized
// archer's arrow.
func TestSplitShot_OnlyAHuntersArrowCritSplits(t *testing.T) {
	tests := []struct {
		name  string
		ranks passivetree.Ranks
		kind  components.AttackKind
		roll  func() float64
	}{
		{"a non-crit arrow", hunterRanks, components.AttackArrow, neverCrit},
		{"a Shadow Shot crit", hunterRanks, components.AttackShadowShot, alwaysCrit},
		{"a Shadow Ranger's arrow crit", passivetree.Ranks{"archer.t6b": 1}, components.AttackArrow, alwaysCrit},
		{"an unspecialized archer's arrow crit", passivetree.Ranks{"archer.t2a": 3}, components.AttackArrow, alwaysCrit},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newKickerWorld("archer", tt.ranks, tt.roll)
			shot := w.shotOf(t, tt.kind)
			struck := ghoul(w.em, 300, 100, 1000)
			ghoul(w.em, 300, 200, 1000)

			w.tick(Impact{Attack: shot, TargetEntityID: struck.ID})

			assert.Less(t, health(struck), 1000)
			assert.Empty(t, projectileEntities(w.em))
		})
	}
}

// R25: an arrow crit on a delver, player damage on, never splits.
func TestSplitShot_ACritOnADelverNeverSplits(t *testing.T) {
	w := newKickerWorld("archer", hunterRanks, alwaysCrit)
	w.combat.playerDamage = PlayerDamageOn
	arrow := w.shotOf(t, components.AttackArrow)
	struck := delver(w.em, 300, 100)
	ghoul(w.em, 300, 200, 1000)

	w.tick(Impact{Attack: arrow, TargetEntityID: struck.ID})

	assert.Less(t, health(struck), 150)
	assert.Empty(t, projectileEntities(w.em))
}
