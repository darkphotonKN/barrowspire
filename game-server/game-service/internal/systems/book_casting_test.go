package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §C R14, §D R16–R20, §E R21. I-X2CMM-2.

const castTick = 1.0 / 30

// anyGround is a floor with no rock: every point is walkable.
func anyGround(_, _ float64) bool { return true }

// witchlightCast is a level-2 mage at (0, 0) casting Witchlight at (x, 0).
func witchlightCast(em *ecs.EntityManager, x float64) (*ecs.Entity, BookCast) {
	mage := bookDelver(em, "mage", 2, 0, 0, components.PageWitchlight)
	page, _ := BookPageOf(string(components.PageWitchlight))
	return mage, BookCast{Caster: mage, Page: page, TargetX: x, CellSize: testCell, BookGround: BookGround{Walkable: anyGround}}
}

// castTicks counts the casts of the world through n ticks, nothing else in it
// moving or striking.
func castTicks(s *BookSystem, em *ecs.EntityManager, n int) {
	for range n {
		s.Update(castTick, em.GetAllEntities())
		s.AdvanceCasts(castTick, em.GetAllEntities(), nil, BookGround{Walkable: anyGround})
	}
}

func bookEffectsOf(em *ecs.EntityManager) []*components.BookEffectComponent {
	var effects []*components.BookEffectComponent
	for _, e := range em.GetAllEntities() {
		if c, ok := e.GetComponent(ecs.ComponentTypeBookEffect); ok {
			effects = append(effects, c.(*components.BookEffectComponent))
		}
	}
	return effects
}

// A cast with a cast time starts casting on its tick and has its effect only
// once the cast time has run out: nothing is paid until then. 1 s at 30 ticks
// a second completes on the 30th tick, the cast's own counted. R16–R17, R21.
func TestBookSystemCast_WitchlightSetsDownItsLightOnlyAfterItsCastTime(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := witchlightCast(em, 5*testCell)
	books := NewBookSystem(em)

	require.NoError(t, books.Cast(cast))
	book := bookOfT(t, mage)
	require.NotNil(t, book.Casting, "the mage is casting")
	assert.Equal(t, components.PageWitchlight, book.Casting.Page)
	assert.Equal(t, 1.0, book.Casting.Total)
	pool, _ := bookPool(mage)
	assert.Equal(t, 100, pool.Current, "nothing paid at the start")
	assert.Empty(t, book.Cooldowns)

	// the cast's own tick, then 28 more: still casting
	books.AdvanceCasts(castTick, em.GetAllEntities(), nil, BookGround{Walkable: anyGround})
	castTicks(books, em, 28)
	require.NotNil(t, book.Casting, "still casting before 1 s")
	assert.Empty(t, bookEffectsOf(em), "no light yet")

	castTicks(books, em, 1)
	assert.Nil(t, book.Casting, "the cast is done")
	assert.Equal(t, 80, pool.Current, "20 mana paid on completion")
	assert.Equal(t, components.BookCooldown{Remaining: 45, Total: 45}, book.Cooldowns[components.PageWitchlight])
	effects := bookEffectsOf(em)
	require.Len(t, effects, 1)
	assert.Equal(t, components.BookEffectWitchlight, effects[0].Kind)
	assert.Equal(t, 20.0, effects[0].Remaining)
}

// The light stands where it was aimed for 20 s, then it goes. R21.
func TestBookSystemUpdate_AWitchlightGoesAfter20Seconds(t *testing.T) {
	em := ecs.NewEntityManager()
	_, cast := witchlightCast(em, 5*testCell)
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))
	castTicks(books, em, 31)
	require.Len(t, bookEffectsOf(em), 1)

	var light *ecs.Entity
	for _, e := range em.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeBookEffect) {
			light = e
		}
	}
	at, _ := bodyCentre(light)
	assert.Equal(t, components.TransformComponent{X: 5 * testCell, Y: 0}, *at, "at the aimed point")

	castTicks(books, em, 20*30-2)
	assert.Len(t, bookEffectsOf(em), 1, "still lit before 20 s")
	castTicks(books, em, 3)
	assert.Empty(t, bookEffectsOf(em), "gone after 20 s")
}

// A cast in progress breaks with nothing spent when the caster moves, takes a
// hit that costs health, has another cast go off, or leaves play; the check is
// made before the cast time's end, so a break on the last tick has no effect.
// R18.
func TestBookSystemAdvanceCasts_BreaksWithNothingSpent(t *testing.T) {
	tests := []struct {
		name    string
		breakIt func(em *ecs.EntityManager, mage *ecs.Entity) []uuid.UUID
	}{
		{"moved", func(_ *ecs.EntityManager, mage *ecs.Entity) []uuid.UUID {
			at, _ := bodyCentre(mage)
			at.Y += 0.5
			return nil
		}},
		{"a hit that costs health", func(_ *ecs.EntityManager, mage *ecs.Entity) []uuid.UUID {
			hc, _ := mage.GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).CurrentHealth--
			return nil
		}},
		{"another cast went off", func(_ *ecs.EntityManager, mage *ecs.Entity) []uuid.UUID {
			return []uuid.UUID{mage.ID}
		}},
		{"dead", func(_ *ecs.EntityManager, mage *ecs.Entity) []uuid.UUID {
			hc, _ := mage.GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).CurrentHealth = 0
			return nil
		}},
		{"escaped", func(_ *ecs.EntityManager, mage *ecs.Entity) []uuid.UUID {
			pc, _ := mage.GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).Escape = true
			return nil
		}},
		{"gone from the world", func(em *ecs.EntityManager, mage *ecs.Entity) []uuid.UUID {
			em.RemoveEntity(mage.ID)
			return nil
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage, cast := witchlightCast(em, 5*testCell)
			books := NewBookSystem(em)
			require.NoError(t, books.Cast(cast))
			castTicks(books, em, 29)
			book := bookOfT(t, mage)
			require.NotNil(t, book.Casting, "one tick from completing")
			// the tick's entities are read before anything takes a body out
			entities := em.GetAllEntities()
			books.MarkHealth(entities)

			attackers := tt.breakIt(em, mage)
			books.AdvanceCasts(castTick, entities, attackers, BookGround{Walkable: anyGround})

			assert.Nil(t, book.Casting, "the cast is broken")
			pool, _ := bookPool(mage)
			assert.Equal(t, 100, pool.Current, "no cost")
			assert.Empty(t, book.Cooldowns, "no cooldown")
			assert.Empty(t, bookEffectsOf(em), "no light")
		})
	}
}

// A heal between the casts' health marks hides no hit and passes for none: only
// health lost in the combat after MarkHealth breaks the cast. R18.
func TestBookSystemAdvanceCasts_AHealBeforeTheMarkBreaksNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := witchlightCast(em, 5*testCell)
	hc, _ := mage.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 50
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))

	hc.(*components.HealthComponent).CurrentHealth = 60
	books.MarkHealth(em.GetAllEntities())
	books.AdvanceCasts(castTick, em.GetAllEntities(), nil, BookGround{Walkable: anyGround})

	assert.NotNil(t, bookOfT(t, mage).Casting, "a heal breaks nothing")
}

// A page cast while casting is refused, instant or not, and the cast in
// progress runs on. R19.
func TestBookSystemCast_RefusedWhileCasting(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := witchlightCast(em, 5*testCell)
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))
	started := *bookOfT(t, mage).Casting

	assert.ErrorIs(t, books.Cast(cast), ErrAlreadyCasting)
	assert.Equal(t, started, *bookOfT(t, mage).Casting, "the cast in progress runs on")
}

// At completion the cost is checked again: a mage whose mana fell below the
// page's cost during the cast gets nothing, and pays nothing. R17.
func TestBookSystemAdvanceCasts_CompletionRechecksTheCost(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := witchlightCast(em, 5*testCell)
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))
	pool, _ := bookPool(mage)
	pool.Current = 19

	castTicks(books, em, 31)

	book := bookOfT(t, mage)
	assert.Nil(t, book.Casting, "the cast ends")
	assert.Equal(t, 19, pool.Current, "no cost")
	assert.Empty(t, book.Cooldowns, "no cooldown")
	assert.Empty(t, bookEffectsOf(em), "no light")
}

// At completion the target is judged again, within range plus one cell: a
// ground point that is no longer walkable ends the cast with nothing. R17.
func TestBookSystemAdvanceCasts_CompletionRechecksTheTarget(t *testing.T) {
	em := ecs.NewEntityManager()
	_, cast := witchlightCast(em, 5*testCell)
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))

	for range 31 {
		books.AdvanceCasts(castTick, em.GetAllEntities(), nil, BookGround{Walkable: func(_, _ float64) bool { return false }})
	}

	assert.Empty(t, bookEffectsOf(em), "no light on rock")
}

// An ally page's target that walked a step past the range still completes
// within range plus one cell, and fails beyond it. R17, edge state "Ally walks
// out of range during the cast".
func TestBookSystemAdvanceCasts_AnAllyWithinRangePlusOneCellStillCounts(t *testing.T) {
	for _, tt := range []struct {
		name  string
		to    float64
		holds bool
	}{
		{"half a cell past", 6.5 * testCell, true},
		{"one cell past", 7 * testCell, true},
		{"beyond one cell past", 7*testCell + 1, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage := bookDelver(em, "mage", 20, 0, 0)
			ally := bookDelver(em, "warrior", 1, 6*testCell, 0)
			cast := BookCast{Caster: mage, Page: BookPage{Target: TargetAlly, RangeCells: 6}, Target: ally, CellSize: testCell}
			require.NoError(t, gateTarget(cast, nil))

			at, _ := bodyCentre(ally)
			at.X = tt.to
			recheck := cast
			recheck.Page.RangeCells += castRangeSlackCells
			err := gateTarget(recheck, nil)

			if tt.holds {
				assert.NoError(t, err)
				return
			}
			assert.ErrorIs(t, err, ErrBadPageTarget)
		})
	}
}

// A floor change ends a cast in progress with nothing. R18.
func TestReadyBookForNewFloor_EndsACastInProgress(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := witchlightCast(em, 5*testCell)
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))

	ReadyBookForNewFloor(mage)
	castTicks(books, em, 31)

	assert.Nil(t, bookOfT(t, mage).Casting)
	assert.Empty(t, bookEffectsOf(em), "no light")
	pool, _ := bookPool(mage)
	assert.Equal(t, 100, pool.Current)
}

// A ground point must be a walkable cell and within range, never clamped. R14.
func TestGateTarget_AGroundPointInAWallIsRefused(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := witchlightCast(em, 5*testCell)
	cast.Walkable = func(x, _ float64) bool { return math.Abs(x-5*testCell) > 1 }

	assert.ErrorIs(t, NewBookSystem(em).Cast(cast), ErrBadPageTarget)
	assert.Nil(t, bookOfT(t, mage).Casting)
}

// A point inside a wall's rect is inside it; one on its far edge is not.
func TestPointInWall(t *testing.T) {
	em := ecs.NewEntityManager()
	wall := em.CreateEntity()
	wall.AddComponent(components.NewWallComponent(uuid.Nil, uuid.New(), 100, 50))
	wall.AddComponent(components.NewTransformComponent(200, 300))

	assert.True(t, PointInWall(em.GetAllEntities(), 250, 320))
	assert.True(t, PointInWall(em.GetAllEntities(), 200, 300), "on its top-left corner")
	assert.False(t, PointInWall(em.GetAllEntities(), 300, 320), "on its right edge")
	assert.False(t, PointInWall(em.GetAllEntities(), 150, 320))
}
