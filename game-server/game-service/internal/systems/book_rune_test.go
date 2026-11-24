package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §E R24, §F R34. I-X2CMM-4.

// runePoint is where these tests lay their rune: 3 cells east of the mage.
const runePoint = 3 * testCell

// bindingGlyphCast is a level-13 mage at (0, 0) casting Binding Glyph at
// (x, 0), with a full pool of mana.
func bindingGlyphCast(em *ecs.EntityManager, x float64) (*ecs.Entity, BookCast) {
	mage := bookDelver(em, "mage", 13, 0, 0, components.PageBindingGlyph)
	page, _ := BookPageOf(string(components.PageBindingGlyph))
	return mage, BookCast{Caster: mage, Page: page, TargetX: x, CellSize: testCell, BookWorld: BookWorld{Walkable: anyGround}}
}

// layRune casts Binding Glyph at the rune point and counts the cast through
// to its completion, the world otherwise still: the rune stands, nothing yet
// caught on it.
func layRune(t *testing.T, em *ecs.EntityManager, books *BookSystem) *ecs.Entity {
	t.Helper()
	_, cast := bindingGlyphCast(em, runePoint)
	require.NoError(t, books.Cast(cast))
	books.AdvanceCasts(castTick, em.GetAllEntities(), nil, BookWorld{Walkable: anyGround})
	for range ticksOf(2.5) {
		books.AdvanceCasts(castTick, em.GetAllEntities(), nil, BookWorld{Walkable: anyGround})
	}
	r := runeOf(em)
	require.NotNil(t, r, "the rune is laid")
	return r
}

// ticksOf is the ticks of castTick that seconds take.
func ticksOf(seconds float64) int { return int(seconds/castTick + 0.5) }

// runeOf is the floor's rune, nil when none stands.
func runeOf(em *ecs.EntityManager) *ecs.Entity {
	for _, e := range em.GetAllEntities() {
		if c, ok := e.GetComponent(ecs.ComponentTypeBookEffect); ok && c.(*components.BookEffectComponent).Kind == components.BookEffectRune {
			return e
		}
	}
	return nil
}

// caught is the monsters the rune has held so far.
func caught(t *testing.T, r *ecs.Entity) int {
	t.Helper()
	c, ok := r.GetComponent(ecs.ComponentTypeRune)
	require.True(t, ok)
	return len(c.(*components.RuneComponent).Caught)
}

// A completed Binding Glyph pays 40 mana, starts its 60 s cooldown and lays a
// rune at the point for 30 s, after its 2.5 s cast time. R24; §B.
func TestBookSystemCast_BindingGlyphLaysARuneAfterItsCastTime(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := bindingGlyphCast(em, runePoint)
	books := NewBookSystem(em)

	require.NoError(t, books.Cast(cast))
	books.AdvanceCasts(castTick, em.GetAllEntities(), nil, BookWorld{Walkable: anyGround})
	castTicks(books, em, ticksOf(2.5)-1)
	assert.Nil(t, runeOf(em), "no rune before 2.5 s")

	castTicks(books, em, 1)
	r := runeOf(em)
	require.NotNil(t, r, "the rune is laid at 2.5 s")
	pool, _ := bookPool(mage)
	assert.Equal(t, 60, pool.Current, "40 mana")
	assert.Equal(t, components.BookCooldown{Remaining: 60, Total: 60}, bookOfT(t, mage).Cooldowns[components.PageBindingGlyph])
	at, _ := centreOf(r)
	assert.Equal(t, components.TransformComponent{X: runePoint, Y: 0}, *at)
	effect, _ := r.GetComponent(ecs.ComponentTypeBookEffect)
	assert.Equal(t, 30.0, effect.(*components.BookEffectComponent).Remaining)
	assert.Equal(t, mage.ID, effect.(*components.BookEffectComponent).CasterID)
}

// A point 6 cells off is taken, one 7 cells off refused. R24; §B, §C R14.
func TestBookSystemCast_BindingGlyphReachesSixCells(t *testing.T) {
	for _, tt := range []struct {
		cells float64
		want  error
	}{{6, nil}, {7, ErrBadPageTarget}} {
		em := ecs.NewEntityManager()
		_, cast := bindingGlyphCast(em, tt.cells*testCell)
		assert.ErrorIs(t, NewBookSystem(em).Cast(cast), tt.want, tt.cells)
	}
}

// A rune laid under a monster stuns it on the rune's first tick, for 4 s, and
// a boss for 2 s; a monster whose centre is just outside the 0.75-cell ring
// and a dead one are left be. R24; §Edge States "Rune laid on a monster".
func TestBookSystemUpdate_ARuneLaidUnderAMonsterStunsItOnTheFirstTick(t *testing.T) {
	tests := []struct {
		name   string
		offset float64 // from the rune's centre, in cells
		set    func(m *ecs.Entity)
		want   float64
	}{
		{"a monster at its centre", 0, func(*ecs.Entity) {}, 4},
		{"a monster just inside its ring", 0.74, func(*ecs.Entity) {}, 4},
		{"a boss", 0, func(m *ecs.Entity) { monster(m).Boss = true }, 2},
		{"a monster just outside its ring", 0.76, func(*ecs.Entity) {}, 0},
		{"a dead monster", 0, func(m *ecs.Entity) { kill(m) }, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			books := NewBookSystem(em)
			m := hunter(em, runePoint+tt.offset*testCell, 0)
			tt.set(m)
			layRune(t, em, books)
			require.Zero(t, monster(m).StunRemaining, "nothing caught as it is laid")

			books.Update(castTick, em.GetAllEntities())

			assert.Equal(t, tt.want, monster(m).StunRemaining)
			if tt.want > 0 {
				assert.Equal(t, components.MonsterActionStunned, monster(m).Action)
			}
		})
	}
}

// Four monsters walk in one after another: the first three are stunned, the
// rune goes on the third, and the fourth walks over where it was untouched.
// R24.
func TestBookSystemUpdate_ARuneCatchesTheFirstThreeThenGoes(t *testing.T) {
	em := ecs.NewEntityManager()
	books := NewBookSystem(em)
	var walkers []*ecs.Entity
	for i := range 4 {
		walkers = append(walkers, hunter(em, runePoint, float64(i+2)*testCell))
	}
	r := layRune(t, em, books)

	for i, m := range walkers {
		at, _ := centreOf(m)
		at.Y = 0 // walks onto the rune
		books.Update(castTick, em.GetAllEntities())
		if i < 3 {
			assert.Equal(t, 4.0, monster(m).StunRemaining, "walker %d is caught", i)
			assert.Equal(t, i+1, caught(t, r))
		}
	}

	assert.Zero(t, monster(walkers[3]).StunRemaining, "the fourth walks over")
	assert.Nil(t, runeOf(em), "the rune went on its third catch")
}

// When more than its last catches stand inside on one tick, the nearest are
// caught first. R24 [derived: the order on a shared tick].
func TestBookSystemUpdate_ARuneCatchesTheNearestFirst(t *testing.T) {
	em := ecs.NewEntityManager()
	books := NewBookSystem(em)
	var ms []*ecs.Entity
	for _, off := range []float64{0.6, 0.1, 0.4, 0.2} {
		ms = append(ms, hunter(em, runePoint+off*testCell, 0))
	}
	layRune(t, em, books)

	books.Update(castTick, em.GetAllEntities())

	assert.Zero(t, monster(ms[0]).StunRemaining, "the farthest is left")
	for _, m := range ms[1:] {
		assert.Equal(t, 4.0, monster(m).StunRemaining)
	}
	assert.Nil(t, runeOf(em))
}

// A monster is caught once per rune: once its stun runs out it may stand on
// the rune unheld, and the rune still waits for two more. R24.
func TestBookSystemUpdate_AMonsterIsCaughtOncePerRune(t *testing.T) {
	em := ecs.NewEntityManager()
	books := NewBookSystem(em)
	m := hunter(em, runePoint, 0)
	r := layRune(t, em, books)

	books.Update(castTick, em.GetAllEntities())
	require.Equal(t, 4.0, monster(m).StunRemaining)
	monster(m).StunRemaining = 0 // its stun has run out, still on the rune

	books.Update(castTick, em.GetAllEntities())

	assert.Zero(t, monster(m).StunRemaining, "not caught twice")
	assert.Equal(t, 1, caught(t, r))
	assert.NotNil(t, runeOf(em), "the rune waits on")
}

// A rune nothing crosses goes after 30 s. R24.
func TestBookSystemUpdate_ARuneWithNoCatchGoesAfter30Seconds(t *testing.T) {
	em := ecs.NewEntityManager()
	books := NewBookSystem(em)
	layRune(t, em, books)

	castTicks(books, em, ticksOf(30)-1)
	assert.NotNil(t, runeOf(em), "still laid before 30 s")
	castTicks(books, em, 2)
	assert.Nil(t, runeOf(em), "gone after 30 s")
}

// The rune's stun is the stun: a longer one already on the monster is kept.
// R24, FS-04EEA §C R16.
func TestBookSystemUpdate_ARuneKeepsALongerStun(t *testing.T) {
	em := ecs.NewEntityManager()
	books := NewBookSystem(em)
	m := hunter(em, runePoint, 0)
	r := layRune(t, em, books)
	stun(monster(m), 6)

	books.Update(castTick, em.GetAllEntities())

	assert.Equal(t, 6.0, monster(m).StunRemaining)
	assert.Equal(t, 1, caught(t, r), "held all the same, so caught")
}
