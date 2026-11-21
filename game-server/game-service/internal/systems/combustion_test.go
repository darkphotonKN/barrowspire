package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
)

/*
	FS-E1ZDG §F R22–24, the Pyromancer's Combustion: a fireball crit on a
	monster explodes on every other monster within 60 px of it for half the
	crit's damage, unmitigated, never a crit, never an explosion itself.
*/

// pyromancerRanks lives in arcane_ward_test.go.

// pyroFireball is a fireball of kind cast by body that deals 40 on a crit to
// a target with nothing to mitigate with (40 × 2/3 × 1.5), and 27 without.
func pyroFireball(body *ecs.Entity, kind components.AttackKind) components.AttackSnapshot {
	pc, _ := body.GetComponent(ecs.ComponentTypePlayer)
	return components.AttackSnapshot{
		AttackerEntityID: body.ID,
		AttackerMemberID: pc.(*components.PlayerComponent).MemberID,
		Kind:             kind,
		DamageType:       components.DamageMagic,
		Power:            40,
		Coefficient:      2.0 / 3,
		CritChance:       0.5,
	}
}

func TestCombustion_ACritExplodesOnTheOtherMonstersWithin60px(t *testing.T) {
	w := newKickerWorld("mage", pyromancerRanks, alwaysCrit)
	w.combat.playerDamage = PlayerDamageOn
	struck := ghoul(w.em, 300, 100, 1000)
	near := ghoul(w.em, 359, 100, 1000)
	edge := ghoul(w.em, 300, 160, 1000)
	far := ghoul(w.em, 361, 100, 1000)
	ally := delver(w.em, 330, 100)
	crate := dummy(w.em, 300, 130)

	w.tick(Impact{Attack: pyroFireball(w.body, components.AttackFireball), TargetEntityID: struck.ID})

	assert.Equal(t, 960, health(struck), "the crit's 40, and the struck monster is not hit again")
	assert.Equal(t, 980, health(near), "59 px: half the crit")
	assert.Equal(t, 980, health(edge), "60 px is within")
	assert.Equal(t, 1000, health(far), "61 px: out of reach")
	assert.Equal(t, 150, health(ally), "a delver is never hit, player damage on")
	assert.Equal(t, 1000, health(crate), "only monsters take it")
}

// R22: each of triple fireball's fireballs, cast and landed, explodes on its
// own crit.
func TestCombustion_EachTripleFireballExplodesOnItsOwnCrit(t *testing.T) {
	w := newKickerWorld("mage", pyromancerRanks, alwaysCrit)
	struck := ghoul(w.em, 300, 100, 1000)
	shots := w.fired(components.AttackTripleFireball)
	assert.Len(t, shots, 3)
	near := ghoul(w.em, 300, 140, 1000)

	for i, shot := range shots {
		before, nearBefore := health(struck), health(near)
		w.tick(Impact{Attack: shot.Attack, TargetEntityID: struck.ID})
		crit := before - health(struck)
		assert.Equal(t, whole(float64(crit)*0.5), nearBefore-health(near), "fireball %d", i)
	}
}

// R23: the explosion is unmitigated and never a crit, never explodes in turn,
// and its kill is the Pyromancer's.
func TestCombustion_TheExplosionNeverCritsNeverChainsAndCreditsThePyromancer(t *testing.T) {
	w := newKickerWorld("mage", pyromancerRanks, alwaysCrit)
	struck := ghoul(w.em, 300, 100, 1000)
	near := ghoul(w.em, 350, 100, 1000)
	near.AddComponent(&components.CombatComponent{Attack: 8, MagicResistance: 50})
	chained := ghoul(w.em, 400, 100, 1000) // 50 px from near, 100 from struck
	doomed := ghoul(w.em, 300, 50, 15)

	kills := w.tick(Impact{Attack: pyroFireball(w.body, components.AttackFireball), TargetEntityID: struck.ID})

	assert.Equal(t, 980, health(near), "20 exactly: no crit, no magic resistance")
	assert.Equal(t, 1000, health(chained), "the explosion sets off no explosion")
	assert.Equal(t, 0, health(doomed))
	pc, _ := w.body.GetComponent(ecs.ComponentTypePlayer)
	if assert.Len(t, kills, 1) {
		assert.Equal(t, doomed.ID, kills[0].MonsterEntityID)
		assert.Equal(t, pc.(*components.PlayerComponent).MemberID, kills[0].KillerMemberID)
	}
}

// R24: a crit that kills its target still explodes, at half what it dealt
// before the clamp; a non-crit never does.
func TestCombustion_AKillingCritExplodesAndANonCritNever(t *testing.T) {
	t.Run("a killing crit", func(t *testing.T) {
		w := newKickerWorld("mage", pyromancerRanks, alwaysCrit)
		struck := ghoul(w.em, 300, 100, 10)
		near := ghoul(w.em, 330, 100, 1000)
		kills := w.tick(Impact{Attack: pyroFireball(w.body, components.AttackFireball), TargetEntityID: struck.ID})
		assert.Equal(t, 0, health(struck))
		assert.Len(t, kills, 1)
		assert.Equal(t, 980, health(near), "half the crit's 40, not of the 10 it took")
	})
	t.Run("a non-crit", func(t *testing.T) {
		w := newKickerWorld("mage", pyromancerRanks, neverCrit)
		struck := ghoul(w.em, 300, 100, 1000)
		near := ghoul(w.em, 330, 100, 1000)
		w.tick(Impact{Attack: pyroFireball(w.body, components.AttackFireball), TargetEntityID: struck.ID})
		assert.Equal(t, 973, health(struck))
		assert.Equal(t, 1000, health(near))
	})
}

// R24: a fireball crit on a delver, player damage on, never explodes.
func TestCombustion_ACritOnADelverNeverExplodes(t *testing.T) {
	w := newKickerWorld("mage", pyromancerRanks, alwaysCrit)
	w.combat.playerDamage = PlayerDamageOn
	struck := delver(w.em, 300, 100)
	near := ghoul(w.em, 330, 100, 1000)
	w.tick(Impact{Attack: pyroFireball(w.body, components.AttackFireball), TargetEntityID: struck.ID})
	assert.Less(t, health(struck), 150)
	assert.Equal(t, 1000, health(near))
}

// R22: only the Pyromancer's fireballs explode: not a Spellwarden's, not a
// mage's before the pick.
func TestCombustion_OnlyThePyromancersCritsExplode(t *testing.T) {
	for name, ranks := range map[string]passivetree.Ranks{
		"a spellwarden":       {"mage.t6a": 1},
		"before the pick":     {"mage.t2a": 3},
		"another tier-6 node": {"warrior.t6b": 1},
	} {
		t.Run(name, func(t *testing.T) {
			w := newKickerWorld("mage", ranks, alwaysCrit)
			struck := ghoul(w.em, 300, 100, 1000)
			near := ghoul(w.em, 330, 100, 1000)
			w.tick(Impact{Attack: pyroFireball(w.body, components.AttackFireball), TargetEntityID: struck.ID})
			assert.Equal(t, 960, health(struck))
			assert.Equal(t, 1000, health(near))
		})
	}
}
