package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	FS-E1ZDG §H R29–31, the Shadow Ranger's Shadow Shot: it hits every target
	in its line once and stops only at a wall, a closed door or its max
	flight, and each monster it hits refunds 8 stamina to the archer, capped
	at max, while the archer is in play. Every Shadow Shot here is fired by a
	rankedBody standing at (100, 100) toward +x, its 100 stamina already spent.
*/

var shadowRangerRanks = passivetree.Ranks{"archer.t6b": 1}

// shadowShot fires the body's Shadow Shot toward +x, leaves it in flight and
// returns the snapshot it carries.
func (w *kickerWorld) shadowShot(t *testing.T) components.AttackSnapshot {
	t.Helper()
	shots := w.fired(components.AttackShadowShot)
	require.Len(t, shots, 1)
	return shots[0].Attack
}

// flyWith steps flight and combat, player damage as given, until no
// projectile is left in the world or the ticks run out.
func (w *kickerWorld) flyWith(playerDamage PlayerDamage, ticks int) {
	w.combat.playerDamage = playerDamage
	flight := NewProjectileSystem(w.em, playerDamage)
	for range ticks {
		if len(projectileEntities(w.em)) == 0 {
			return
		}
		w.tick(flight.Update(tickSeconds, w.em.GetAllEntities())...)
	}
}

// ghoulsInLine stands n ghouls of 1000 HP along y = 100, 50 px apart from x = 200.
func ghoulsInLine(em *ecs.EntityManager, n int) []*ecs.Entity {
	var line []*ecs.Entity
	for i := range n {
		line = append(line, ghoul(em, 200+50*float64(i), 100, 1000))
	}
	return line
}

func wallAt(em *ecs.EntityManager, x, y, width, height float64) {
	wall := em.CreateEntity()
	wall.AddComponent(components.NewWallComponent(uuid.New(), uuid.New(), width, height))
	wall.AddComponent(components.NewTransformComponent(x, y))
}

func healths(line []*ecs.Entity) []int {
	var out []int
	for _, e := range line {
		out = append(out, health(e))
	}
	return out
}

// R29: through five monsters in a line it hits all five, each once, and flies
// on past them; a wall behind them stops it.
func TestShadowRanger_ShadowShotPiercesEveryMonsterInItsLine(t *testing.T) {
	w := newKickerWorld("archer", shadowRangerRanks, neverCrit)
	line := ghoulsInLine(w.em, 5)
	wallAt(w.em, 600, 50, 20, 100)
	behindWall := ghoul(w.em, 660, 100, 1000)
	shot := w.shadowShot(t)

	w.flyWith(PlayerDamageOff, 90) // 390 px: past the fifth at x = 400
	shots := projectileEntities(w.em)
	require.Len(t, shots, 1, "it flies on past the fifth")
	assert.Len(t, projectileOf(shots[0]).HitEntityIDs, 5)

	w.flyWith(PlayerDamageOff, 200)
	assert.Empty(t, projectileEntities(w.em))
	assert.Equal(t, 1000, health(behindWall), "the wall stops it")

	// each was hit once: the damage one Shadow Shot impact deals
	ref := ghoul(w.em, 100, 400, 1000)
	w.tick(Impact{Attack: shot, TargetEntityID: ref.ID})
	once := health(ref)
	require.Less(t, once, 1000)
	assert.Equal(t, []int{once, once, once, once, once}, healths(line))
}

// R29: with nothing in its way it still stops at its max flight, 650 px.
func TestShadowRanger_ShadowShotStopsAtItsMaxFlight(t *testing.T) {
	w := newKickerWorld("archer", shadowRangerRanks, neverCrit)
	within := ghoul(w.em, 700, 100, 1000)
	beyond := ghoul(w.em, 800, 100, 1000)
	w.shadowShot(t)

	w.flyWith(PlayerDamageOff, 300)

	assert.Empty(t, projectileEntities(w.em))
	assert.Less(t, health(within), 1000)
	assert.Equal(t, 1000, health(beyond))
}

// R30: each monster hit refunds 8 stamina, capped at max; nothing is banked.
func TestShadowRanger_EachMonsterHitRefunds8Stamina(t *testing.T) {
	t.Run("five monsters refund 40", func(t *testing.T) {
		w := newKickerWorld("archer", shadowRangerRanks, neverCrit)
		ghoulsInLine(w.em, 5)
		w.shadowShot(t)
		require.Equal(t, 0, pool(w.body), "the cast's 100 spent")

		w.flyWith(PlayerDamageOff, 300)

		assert.Equal(t, 40, pool(w.body))
	})
	t.Run("capped at max", func(t *testing.T) {
		w := newKickerWorld("archer", shadowRangerRanks, neverCrit)
		ghoulsInLine(w.em, 5)
		w.shadowShot(t)
		resourceOf(w.body).Current = 80

		w.flyWith(PlayerDamageOff, 300)

		assert.Equal(t, 100, pool(w.body))
	})
	t.Run("on the tick it hits", func(t *testing.T) {
		w := newKickerWorld("archer", shadowRangerRanks, neverCrit)
		g := ghoul(w.em, 300, 100, 1000)
		shot := w.shotOf(t, components.AttackShadowShot)

		w.tick(Impact{Attack: shot, TargetEntityID: g.ID})

		assert.Equal(t, 8, pool(w.body))
	})
}

// R30, Edge States: only a monster refunds. Delvers with player damage off
// are passed through as today, with player damage on they are hit and
// pierced, and a dummy is hit; none refunds.
func TestShadowRanger_OnlyAMonsterRefunds(t *testing.T) {
	t.Run("delvers, player damage off: passed through, no refund", func(t *testing.T) {
		w := newKickerWorld("archer", shadowRangerRanks, neverCrit)
		first, second := delver(w.em, 200, 100), delver(w.em, 250, 100)
		g := ghoul(w.em, 300, 100, 1000)
		w.shadowShot(t)

		w.flyWith(PlayerDamageOff, 300)

		assert.Equal(t, []int{150, 150}, healths([]*ecs.Entity{first, second}))
		assert.Less(t, health(g), 1000, "it flies on to the monster")
		assert.Equal(t, 8, pool(w.body), "the monster's 8 alone")
	})
	t.Run("delvers, player damage on: hit and pierced, no refund", func(t *testing.T) {
		w := newKickerWorld("archer", shadowRangerRanks, neverCrit)
		first, second := delver(w.em, 200, 100), delver(w.em, 250, 100)
		g := ghoul(w.em, 300, 100, 1000)
		w.shadowShot(t)

		w.flyWith(PlayerDamageOn, 300)

		assert.Less(t, health(first), 150)
		assert.Less(t, health(second), 150)
		assert.Less(t, health(g), 1000)
		assert.Equal(t, 8, pool(w.body))
	})
	t.Run("a dummy: hit, no refund", func(t *testing.T) {
		w := newKickerWorld("archer", shadowRangerRanks, neverCrit)
		d := dummy(w.em, 200, 100)
		w.shadowShot(t)

		w.flyWith(PlayerDamageOff, 300)

		assert.Less(t, health(d), 1000)
		assert.Equal(t, 0, pool(w.body))
	})
}

// R30: an archer out of play when it lands gets nothing back.
func TestShadowRanger_AnArcherOutOfPlayGetsNoRefund(t *testing.T) {
	w := newKickerWorld("archer", shadowRangerRanks, neverCrit)
	g := ghoul(w.em, 300, 100, 1000)
	shot := w.shotOf(t, components.AttackShadowShot)
	pc, _ := w.body.GetComponent(ecs.ComponentTypePlayer)
	pc.(*components.PlayerComponent).Escape = true

	w.tick(Impact{Attack: shot, TargetEntityID: g.ID})

	assert.Less(t, health(g), 1000, "the shot still lands")
	assert.Equal(t, 0, pool(w.body))
}

// R31: only the Shadow Ranger's Shadow Shot is changed. A Hunter's and an
// unspecialized archer's Shadow Shot stop at the first monster, or at the
// Lantern's pierce, and refund nothing; a Shadow Ranger's arrow is an arrow.
func TestShadowRanger_OnlyTheShadowRangersShadowShotPierces(t *testing.T) {
	tests := []struct {
		name    string
		ranks   passivetree.Ranks
		kind    components.AttackKind
		lantern bool
		hit     int
	}{
		{"a Hunter's Shadow Shot", hunterRanks, components.AttackShadowShot, false, 1},
		{"an unspecialized archer's Shadow Shot", passivetree.Ranks{"archer.t2a": 3}, components.AttackShadowShot, false, 1},
		{"a Hunter's Shadow Shot with the Lantern", hunterRanks, components.AttackShadowShot, true, 1 + testUniqueEffects.PierceExtraTargets},
		{"a Shadow Ranger's arrow", shadowRangerRanks, components.AttackArrow, false, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newKickerWorld("archer", tt.ranks, neverCrit)
			if tt.lantern {
				wearUnique(w.em, w.body, ring1Slot, types.ItemTypeRing, types.UniqueEffectPierce)
			}
			line := ghoulsInLine(w.em, 5)
			require.Len(t, w.fired(tt.kind), 1)
			spent := pool(w.body)

			w.flyWith(PlayerDamageOff, 300)

			hit := 0
			for _, g := range line {
				if health(g) < 1000 {
					hit++
				}
			}
			assert.Equal(t, tt.hit, hit)
			assert.Less(t, health(line[0]), 1000, "the first in line is hit")
			assert.Equal(t, spent, pool(w.body), "no refund")
		})
	}
}
