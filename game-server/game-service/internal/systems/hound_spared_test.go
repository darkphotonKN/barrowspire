package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §Change: The archer's wolf, W3–W5 (the hound in code, a wolf to
// players): no hit a delver or a hired ally is the source of lands on it,
// whatever made it and whatever the player-damage setting; a monster's strike
// and shot still do. I-X2CMM-29.

// spareWorld is one source's world: the player-damage setting it runs under,
// and whether the wolf standing in it is the attacker's own or another
// archer's (FS edge state "Two archers' wolves").
type spareWorld struct {
	t      *testing.T
	em     *ecs.EntityManager
	damage PlayerDamage
	own    bool
}

// combat is the world's combat at the roll given, under its player damage.
func (w *spareWorld) combat(roll func() float64) *CombatSystem {
	return NewCombatSystem(w.em, roll, w.damage, testUniqueEffects)
}

// wolfAt calls a wolf at (x, y) as Call the Hound sets one down: the
// attacker's own when the world says so and the attacker is a delver, else
// another archer's, standing far off.
func (w *spareWorld) wolfAt(attacker *ecs.Entity, x, y float64) *ecs.Entity {
	archer := attacker
	if !w.own || attacker == nil || !attacker.HasComponent(ecs.ComponentTypePlayer) {
		archer = delver(w.em, 2000, 2000)
	}
	resolveCallTheHound(w.em, BookCast{Caster: archer, TargetX: x, TargetY: y, CellSize: testCell})
	wolf, ok := houndOfArcher(w.em, archer)
	require.True(w.t, ok, "the wolf is called")
	return wolf
}

// flyOut steps flight and combat until no projectile is left in the world.
func (w *spareWorld) flyOut(combat *CombatSystem) {
	flight := NewProjectileSystem(w.em, w.damage)
	for range 600 {
		if len(projectileEntities(w.em)) == 0 {
			return
		}
		combat.Update(tickSeconds, w.em.GetAllEntities(), flight.Update(tickSeconds, w.em.GetAllEntities()))
	}
	w.t.Fatal("a projectile is still flying")
}

// damageName names a player-damage setting for a subtest.
func damageName(damage PlayerDamage) string {
	if damage == PlayerDamageOn {
		return "player damage on"
	}
	return "player damage off"
}

// spareSource is one W3 source run in its world: it returns the wolf standing
// in it, and a witness the same source lands on, so the test knows it fired.
type spareSource struct {
	name string
	run  func(w *spareWorld) (wolf, witness *ecs.Entity)
}

// shotThrough fires kind from a delver at (100, 100) along +x: the wolf
// stands in its path at 180 px, a witness beyond it at 300 px.
func shotThrough(kind components.AttackKind) func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
	return func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		a := delver(w.em, 100, 100)
		wolf := w.wolfAt(a, 180, 100)
		witness := dummy(w.em, 300, 100)
		combat := w.combat(neverCrit)
		intend(a, components.AttackIntent{Kind: kind, TargetX: 400, TargetY: 100})
		combat.Update(tickSeconds, w.em.GetAllEntities(), nil)
		w.flyOut(combat)
		return wolf, witness
	}
}

var spareSources = []spareSource{
	{"a delver's slash", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		a := delver(w.em, 100, 100)
		wolf := w.wolfAt(a, 140, 100)
		witness := dummy(w.em, 130, 125)
		intend(a, components.AttackIntent{Kind: components.AttackSlash, TargetX: 200, TargetY: 100})
		w.combat(neverCrit).Update(tickSeconds, w.em.GetAllEntities(), nil)
		return wolf, witness
	}},
	{"a mercenary's cut", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		m := riposteMerc(w.em, 100, 100, 0)
		wolf := w.wolfAt(m, 140, 100)
		witness := dummy(w.em, 145, 110)
		castCut(m)
		w.combat(neverCrit).Update(tickSeconds, w.em.GetAllEntities(), nil)
		return wolf, witness
	}},
	{"a mercenary's riposte", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		m := riposteMerc(w.em, 100, 100, 3)
		wolf := w.wolfAt(m, 160, 100)
		witness := dummyOffAim(w.em, 80, -100)
		castCut(m)
		w.combat(neverCrit).Update(tickSeconds, w.em.GetAllEntities(), nil)
		assert.Equal(w.t, 0, pool(m), "it was the riposte")
		return wolf, witness
	}},
	{"an arrow", shotThrough(components.AttackArrow)},
	{"a fireball", shotThrough(components.AttackFireball)},
	{"a Shadow Shot", shotThrough(components.AttackShadowShot)},
	{"a Hunter's split arrow", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		hunter := rankedBody(w.em, "archer", hunterRanks)
		combat := w.combat(alwaysCrit)
		ghoul(w.em, 300, 100, 1000)            // the arrow crits it and splits
		witness := ghoul(w.em, 300, 250, 1000) // where the split arrow flies
		wolf := w.wolfAt(hunter, 300, 175)     // between them
		intend(hunter, components.AttackIntent{Kind: components.AttackArrow, TargetX: 400, TargetY: 100})
		combat.Update(tickSeconds, w.em.GetAllEntities(), nil)
		w.flyOut(combat)
		return wolf, witness
	}},
	{"Arrow Rain, the wolf called under it", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		a := rainArcher(w.em)
		combat := w.combat(neverCrit)
		rainOn(a, 150, 100)
		combat.Update(tickSeconds, w.em.GetAllEntities(), nil)
		require.Len(w.t, rains(w.em), 1)
		wolf := w.wolfAt(a, 150, 100) // under the rain's circle from its first tick
		witness := dummy(w.em, 160, 110)
		for range 92 {
			combat.Update(tickSeconds, w.em.GetAllEntities(), nil)
		}
		return wolf, witness
	}},
	{"Earthbreaker", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		a := earthbreakerWarrior(w.em, 100, 100, true)
		wolf := w.wolfAt(a, 160, 100)
		witness := dummy(w.em, 40, 100)
		slam(a)
		w.combat(neverCrit).Update(tickSeconds, w.em.GetAllEntities(), nil)
		return wolf, witness
	}},
	{"Settle the Debt", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		m := settleMerc(w.em, 3, 3)
		wolf := w.wolfAt(m, 150, 100)
		witness := ghoul(w.em, 60, 100, 1000)
		settle(m)
		w.combat(neverCrit).Update(tickSeconds, w.em.GetAllEntities(), nil)
		return wolf, witness
	}},
	{"a burning trail", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		wearer := delver(w.em, 100, 100)
		wearUnique(w.em, wearer, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)
		witness := ghoul(w.em, 200, 125, 1000)
		combat := w.combat(neverCrit)
		intend(wearer, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
		dashThrough(w.em, combat, wearer)
		require.Len(w.t, trails(w.em), 1)
		wolf := w.wolfAt(wearer, 240, 125) // on the trail as it burns
		for range int(math.Round(4 / tickSeconds)) {
			combat.Update(tickSeconds, w.em.GetAllEntities(), nil)
		}
		return wolf, witness
	}},
	{"a hired ally's strike", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		ally := fightingAlly(w.em, 100, 100, uuid.New(), 20)
		wolf := w.wolfAt(nil, 140, 100)
		witness := ghoul(w.em, 130, 100, 1000)
		intend(ally, components.AttackIntent{Kind: components.AttackAllyStrike, TargetEntityID: wolf.ID})
		intend(ally, components.AttackIntent{Kind: components.AttackAllyStrike, TargetEntityID: witness.ID})
		w.combat(neverCrit).Update(tickSeconds, w.em.GetAllEntities(), nil)
		return wolf, witness
	}},
	{"a Gravewarden's reflect", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		wearer := delver(w.em, 100, 100)
		wearUnique(w.em, wearer, chestSlot, types.ItemTypeArmor, types.UniqueEffectMeleeReflect)
		wolf := w.wolfAt(wearer, 140, 100)
		witness := ghoul(w.em, 60, 100, 1000)
		combat := w.combat(neverCrit)
		// the reflect answers whoever the strike names: the wolf, then a monster
		for _, from := range []*ecs.Entity{wolf, witness} {
			combat.reflect(components.AttackSnapshot{
				AttackerEntityID: from.ID, DamageType: components.DamagePhysical, FromMonster: true,
			}, wearer, 30)
		}
		return wolf, witness
	}},
	{"a kicker: Kindling's fireball crit refund", func(w *spareWorld) (*ecs.Entity, *ecs.Entity) {
		mage := rankedBody(w.em, "mage", passivetree.Ranks{"mage.t2a": 3})
		combat := w.combat(alwaysCrit)
		wolf := w.wolfAt(mage, 300, 100)
		witness := ghoul(w.em, 300, 300, 1000)
		intend(mage, components.AttackIntent{Kind: components.AttackFireball, TargetX: 400, TargetY: 100})
		combat.Update(tickSeconds, w.em.GetAllEntities(), nil)
		shots := projectiles(w.em)
		require.Len(w.t, shots, 1)
		fireball := shots[0].Attack
		clearShots(w.em)

		// the crit lands on the gate itself, past any flight's own check
		resourceOf(mage).Current = 50
		combat.Update(tickSeconds, w.em.GetAllEntities(), []Impact{{Attack: fireball, TargetEntityID: wolf.ID}})
		assert.Equal(w.t, 50, pool(mage), "no kicker: nothing refunded")
		combat.Update(tickSeconds, w.em.GetAllEntities(), []Impact{{Attack: fireball, TargetEntityID: witness.ID}})
		assert.Equal(w.t, 55, pool(mage), "the same crit on a monster refunds")
		return wolf, witness
	}},
}

// A wolf standing in each W3 source keeps its health and takes nothing, with
// player damage off and on, its own archer's hit and another's alike, while
// the same source lands on a witness beside it. FS-X2CMM W3, W5.
func TestWolf_SparedByEveryDelverSideSource(t *testing.T) {
	for _, source := range spareSources {
		for _, damage := range []PlayerDamage{PlayerDamageOff, PlayerDamageOn} {
			for _, own := range []bool{true, false} {
				name := source.name + "/" + damageName(damage)
				if own {
					name += "/own wolf"
				} else {
					name += "/another archer's wolf"
				}
				t.Run(name, func(t *testing.T) {
					w := &spareWorld{t: t, em: ecs.NewEntityManager(), damage: damage, own: own}

					wolf, witness := source.run(w)

					hp := healthT(t, wolf)
					// and no stun (W5): applyHit stuns only a monster, so a spared wolf is never stunned
					assert.Equal(t, hp.MaxHealth, hp.CurrentHealth, "the wolf keeps its health")
					assert.Positive(t, hp.MaxHealth)
					assert.Less(t, health(witness), healthT(t, witness).MaxHealth, "the source landed on its witness")
				})
			}
		}
	}
}

// A monster's strike and a monster's shot still lower the wolf's health,
// with player damage off and on. FS-X2CMM W4. (A monster's area ability
// passing it by: TestMonsterAbility_SlamSparesAHoundInItsCircle.)
func TestWolf_AMonstersStrikeAndShotStillHurtIt(t *testing.T) {
	for _, damage := range []PlayerDamage{PlayerDamageOff, PlayerDamageOn} {
		t.Run("strike/"+damageName(damage), func(t *testing.T) {
			w := &spareWorld{t: t, em: ecs.NewEntityManager(), damage: damage}
			wolf := w.wolfAt(nil, 100, 100)
			troll := striker(w.em, 140, 100, 200)

			intend(troll, components.AttackIntent{Kind: components.AttackMonsterStrike, TargetEntityID: wolf.ID})
			w.combat(neverCrit).Update(tickSeconds, w.em.GetAllEntities(), nil)

			assert.Less(t, healthT(t, wolf).CurrentHealth, healthT(t, wolf).MaxHealth)
		})
		t.Run("shot/"+damageName(damage), func(t *testing.T) {
			w := &spareWorld{t: t, em: ecs.NewEntityManager(), damage: damage}
			wolf := w.wolfAt(nil, 300, 100)
			bones := archer(w.em, 100, 100)
			combat := w.combat(neverCrit)

			intend(bones, components.AttackIntent{Kind: components.AttackMonsterShot, TargetX: 400, TargetY: 100})
			combat.Update(tickSeconds, w.em.GetAllEntities(), nil)
			w.flyOut(combat)

			assert.Less(t, healthT(t, wolf).CurrentHealth, healthT(t, wolf).MaxHealth)
		})
	}
}

// The one rule at the gate: a hit is spared by a hound when a delver or a
// hired ally is its source, whatever it is and whatever else marks it; a
// monster's and a trap's are not. FS-X2CMM W3, W4.
func TestSparesHound_EveryDelverOrAllySourcedHit(t *testing.T) {
	em := ecs.NewEntityManager()
	hound := bodyHoundAt(em, 0, 0)
	member, hirer := uuid.New(), uuid.New()

	tests := []struct {
		name   string
		attack components.AttackSnapshot
		spared bool
	}{
		{"a delver's", components.AttackSnapshot{AttackerMemberID: member}, true},
		{"a delver's unmitigated (a reflect)", components.AttackSnapshot{AttackerMemberID: member, TrueDamage: 6}, true},
		{"a hired ally's", components.AttackSnapshot{AllyOf: hirer}, true},
		{"a monster's", components.AttackSnapshot{FromMonster: true}, false},
		{"a trap's", components.AttackSnapshot{AttackerEntityID: uuid.New(), Power: 10, Coefficient: 1}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.spared, sparesHound(tt.attack, hound))
			for _, damage := range []PlayerDamage{PlayerDamageOff, PlayerDamageOn} {
				assert.Equal(t, !tt.spared, CanHit(tt.attack, hound, damage), damage)
			}
		})
	}
}
