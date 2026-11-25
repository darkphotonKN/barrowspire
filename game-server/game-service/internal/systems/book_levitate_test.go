package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §C R15, §D R17, §E R23. I-X2CMM-3.

// lift sets the delver afloat for the seconds given, a book seated if they
// carry none.
func lift(e *ecs.Entity, seconds float64) *ecs.Entity {
	if _, ok := bookOf(e); !ok {
		e.AddComponent(components.NewBookComponent(nil))
	}
	setBookState(e, components.BookStateAfloat, seconds)
	return e
}

// An afloat delver's every attack row, the class ability (the dash, the
// triple fireball, the parry) and the tree ability are refused as if on
// cooldown: nothing lands, nothing is spent, no cooldown and no pin start, and
// the refused cast is no attack the tick records. R23.
func TestCombatSystem_AnAfloatDelversCastsAreRefused(t *testing.T) {
	casts := append(pinningCasts,
		struct {
			name string
			cast func(em *ecs.EntityManager) *ecs.Entity
		}{"dash", func(em *ecs.EntityManager) *ecs.Entity {
			d := delver(em, 300, 300)
			dashToward(d, 400, 300)
			return d
		}},
		struct {
			name string
			cast func(em *ecs.EntityManager) *ecs.Entity
		}{"earthbreaker", func(em *ecs.EntityManager) *ecs.Entity {
			w := earthbreakerWarrior(em, 300, 300, true)
			intend(w, components.AttackIntent{Kind: components.AttackEarthbreaker, TargetX: 400, TargetY: 300})
			return w
		}},
	)

	for _, tt := range casts {
		t.Run(tt.name, func(t *testing.T) {
			w := newDashWorldAt(worldTick)
			caster := lift(tt.cast(w.em), 8)
			dummy(w.em, 340, 300) // in reach of every cone and strike
			resourceBefore := pool(caster)

			w.tick()

			assert.True(t, unhurt(w.em, caster), "no damage")
			assert.Empty(t, projectiles(w.em), "no projectile")
			assert.Equal(t, resourceBefore, pool(caster), "nothing spent")
			assert.Empty(t, castKind(caster), "no cooldown started")
			assert.False(t, dashing(caster), "no charge")
			assert.False(t, pinned(caster), "no pin")
			assert.NotContains(t, w.combat.Attackers(), caster.ID, "no attack recorded")
		})
	}

	t.Run("parry", func(t *testing.T) {
		w := newDashWorldAt(worldTick)
		m := lift(parryMerc(w.em, 300, 300), 8)
		castParry(m)

		w.tick()

		assert.False(t, parryOf(m).Open, "the stance stays down")
		assert.NotContains(t, w.combat.Attackers(), m.ID, "no cast recorded")
	})
}

// Once afloat has run out the same delver's slash lands again. R23.
func TestCombatSystem_AfloatOverTheDelverAttacksAgain(t *testing.T) {
	w := newDashWorldAt(worldTick)
	d := lift(delver(w.em, 300, 300), 8)
	delete(bookOfT(t, d).States, components.BookStateAfloat)
	intend(d, components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 300})
	dummy(w.em, 340, 300)

	w.tick()

	assert.False(t, unhurt(w.em, d), "the slash lands")
	assert.True(t, pinned(d))
}

// levitateCast is a level-9 mage at (0, 0) levitating the target.
func levitateCast(em *ecs.EntityManager, target func(mage *ecs.Entity) *ecs.Entity) (*ecs.Entity, BookCast) {
	mage := bookDelver(em, "mage", 9, 0, 0, components.PageLevitate)
	page, _ := BookPageOf(string(components.PageLevitate))
	return mage, BookCast{Caster: mage, Page: page, Target: target(mage), CellSize: testCell, BookGround: BookGround{Walkable: anyGround}}
}

// A completed Levitate makes its target afloat for 8 s, then it runs out; the
// cast is 1.5 s, 45 ticks with its own. R23.
func TestBookSystemCast_LevitateLiftsItsTargetFor8Seconds(t *testing.T) {
	em := ecs.NewEntityManager()
	ally := bookDelver(em, "warrior", 1, 4*testCell, 0)
	mage, cast := levitateCast(em, func(*ecs.Entity) *ecs.Entity { return ally })
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))

	castTicks(books, em, 44)
	assert.NotContains(t, bookOfT(t, ally).States, components.BookStateAfloat, "not before the cast completes")
	castTicks(books, em, 1)

	assert.Equal(t, 8.0, bookOfT(t, ally).States[components.BookStateAfloat], "afloat 8 s")
	assert.Empty(t, bookOfT(t, mage).States, "the mage stays grounded")
	pool, _ := bookPool(mage)
	assert.Equal(t, 65, pool.Current, "35 mana")

	castTicks(books, em, 8*30-1)
	assert.Contains(t, bookOfT(t, ally).States, components.BookStateAfloat, "afloat until 8 s")
	castTicks(books, em, 2)
	assert.NotContains(t, bookOfT(t, ally).States, components.BookStateAfloat, "grounded after 8 s")
}

// A second Levitate on an afloat delver restarts the 8 s. R23.
func TestBookSystemCast_ASecondLevitateRestartsAfloat(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := levitateCast(em, func(mage *ecs.Entity) *ecs.Entity { return mage })
	lift(mage, 2)
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))

	castTicks(books, em, 45)

	assert.Equal(t, 8.0, bookOfT(t, mage).States[components.BookStateAfloat], "restarted at 8 s")
}

// The ally a Levitate names is judged again as its cast completes: still
// within range plus one cell it is lifted, a step further it is not, and
// nothing is spent. R17.
func TestBookSystemAdvanceCasts_LevitateOnAnAllyWhoWalkedOff(t *testing.T) {
	for _, tt := range []struct {
		name  string
		to    float64
		lifts bool
	}{
		{"one cell further", 7 * testCell, true},
		{"two cells further", 8 * testCell, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			ally := bookDelver(em, "warrior", 1, 6*testCell, 0)
			mage, cast := levitateCast(em, func(*ecs.Entity) *ecs.Entity { return ally })
			books := NewBookSystem(em)
			require.NoError(t, books.Cast(cast))

			castTicks(books, em, 20)
			at, _ := bodyCentre(ally)
			at.X = tt.to
			castTicks(books, em, 26)

			pool, _ := bookPool(mage)
			if tt.lifts {
				assert.Contains(t, bookOfT(t, ally).States, components.BookStateAfloat)
				assert.Equal(t, 65, pool.Current)
				return
			}
			assert.Empty(t, bookOfT(t, ally).States, "no afloat")
			assert.Equal(t, 100, pool.Current, "no cost")
			assert.Empty(t, bookOfT(t, mage).Cooldowns, "no cooldown")
		})
	}
}
