package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §A R4–R6, §C R13–R15, §K R59. I-X2CMM-1.

const testCell = 80.0

// bookDelver is a delver of the class and level at (x, y) with a full pool
// and a book of the pages.
func bookDelver(em *ecs.EntityManager, class string, level int, x, y float64, pages ...components.PageID) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewPlayerComponent(uuid.New(), class, "Wren", false))
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewHealthComponent(100, 100))
	e.AddComponent(components.NewResourceComponent(components.ResourceStamina, 100, 100, 0))
	stats := components.NewStatsComponent(1, 1, 1, 1)
	stats.Level = level
	e.AddComponent(stats)
	e.AddComponent(components.NewBookComponent(pages))
	return e
}

func hardenedCast(caster *ecs.Entity) BookCast {
	page, _ := BookPageOf(string(components.PageHardened))
	return BookCast{Caster: caster, Page: page, CellSize: testCell}
}

func bookOfT(t *testing.T, e *ecs.Entity) *components.BookComponent {
	t.Helper()
	book, ok := bookOf(e)
	require.True(t, ok)
	return book
}

// Each of R4's gates refuses for its own reason, before anything is paid.
func TestBookSystemCast_EachGateRefusesForItsReason(t *testing.T) {
	tests := []struct {
		name  string
		ready func(e *ecs.Entity) BookCast
		want  error
	}{
		{"not in the book", func(e *ecs.Entity) BookCast {
			bookOfT(t, e).Pages = nil
			return hardenedCast(e)
		}, ErrPageNotInBook},
		{"locked", func(e *ecs.Entity) BookCast {
			sc, _ := e.GetComponent(ecs.ComponentTypeStats)
			sc.(*components.StatsComponent).Level = 8
			return hardenedCast(e)
		}, ErrPageLocked},
		{"not offered", func(e *ecs.Entity) BookCast {
			// every page of the table is offered: one of no resolver stands in
			bookOfT(t, e).Pages = []components.PageID{unwrittenPage.ID}
			return BookCast{Caster: e, Page: unwrittenPage, CellSize: testCell}
		}, ErrPageNotOffered},
		{"escaped", func(e *ecs.Entity) BookCast {
			pc, _ := e.GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).Escape = true
			return hardenedCast(e)
		}, ErrCasterOutOfPlay},
		{"pinned", func(e *ecs.Entity) BookCast {
			e.AddComponent(&components.AttackPinComponent{Remaining: 0.1})
			return hardenedCast(e)
		}, ErrCasterPinned},
		{"on cooldown", func(e *ecs.Entity) BookCast {
			bookOfT(t, e).Cooldowns[components.PageHardened] = components.BookCooldown{Remaining: 1, Total: 90}
			return hardenedCast(e)
		}, ErrPageNotReady},
		{"spent", func(e *ecs.Entity) BookCast {
			bookOfT(t, e).Spent[components.PageHardened] = true
			return hardenedCast(e)
		}, ErrPageNotReady},
		{"short of cost", func(e *ecs.Entity) BookCast {
			rc, _ := e.GetComponent(ecs.ComponentTypeResource)
			rc.(*components.ResourceComponent).Current = 44
			return hardenedCast(e)
		}, ErrShortOfCost},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			warrior := bookDelver(em, "warrior", 9, 500, 500, components.PageHardened)
			cast := tt.ready(warrior)
			pool, _ := bookPool(warrior)
			before := pool.Current

			assert.ErrorIs(t, NewBookSystem(em).Cast(cast), tt.want)
			assert.Equal(t, before, pool.Current, "no cost")
			assert.Empty(t, bookOfT(t, warrior).States, "no effect")
		})
	}
}

// A once-per-floor or once-per-delve page is spent by its cast, never given a
// cooldown. A test-only row stands in until such a page is offered. R8.
func TestBookSystemCast_ALimitedPageIsSpent(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := bookDelver(em, "warrior", 9, 500, 500, components.PageHardened)
	cast := hardenedCast(warrior)
	cast.Page.Cooldown, cast.Page.Limit = 0, PageLimitPerFloor

	require.NoError(t, NewBookSystem(em).Cast(cast))
	book := bookOfT(t, warrior)
	assert.True(t, book.Spent[components.PageHardened])
	assert.Empty(t, book.Cooldowns)
	assert.ErrorIs(t, NewBookSystem(em).Cast(cast), ErrPageNotReady)
}

// The target gate judges a cast's target against the page's kind and range,
// from the caster's centre, in cells; never clamped. Test-only rows stand in
// for the pages not yet offered. FS-X2CMM §C R13–R15.
func TestGateTarget_JudgesTheTargetByKindAndRange(t *testing.T) {
	em := ecs.NewEntityManager()
	caster := bookDelver(em, "mage", 20, 0, 0)
	near := bookDelver(em, "warrior", 1, 4*testCell, 0)
	far := bookDelver(em, "warrior", 1, 7*testCell, 0)
	fallen := bookDelver(em, "warrior", 1, testCell, 0)
	hc, _ := fallen.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	lever := em.CreateEntity()
	lever.AddComponent(components.NewTransformComponent(testCell, 0))
	lever.AddComponent(&components.InteractableComponent{})
	stone := em.CreateEntity()
	stone.AddComponent(components.NewTransformComponent(testCell, 0))

	ground := BookPage{Target: TargetGround, RangeCells: 6}
	ally := BookPage{Target: TargetAlly, RangeCells: 6}
	allyOrSelf := BookPage{Target: TargetAlly, AllowsSelf: true, RangeCells: 6}
	thing := BookPage{Target: TargetInteractable, RangeCells: adjacentCells}

	tests := []struct {
		name   string
		page   BookPage
		x      float64
		target *ecs.Entity
		fits   bool
	}{
		{"self ignores the target", BookPage{Target: TargetSelf}, 9999, nil, true},
		{"none ignores the target", BookPage{Target: TargetNone}, 9999, far, true},
		{"ground within range", ground, 6 * testCell, nil, true},
		{"ground beyond range", ground, 6*testCell + 1, nil, false},
		{"an ally within range", ally, 0, near, true},
		{"an ally beyond range", ally, 0, far, false},
		{"a fallen ally", ally, 0, fallen, false},
		{"no ally named", ally, 0, nil, false},
		{"self where the page forbids it", ally, 0, caster, false},
		{"self where the page allows it", allyOrSelf, 0, caster, true},
		{"an interactable adjacent", thing, 0, lever, true},
		{"not an interactable", thing, 0, stone, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cast := BookCast{Caster: caster, Page: tt.page, TargetX: tt.x, Target: tt.target, CellSize: testCell, BookGround: BookGround{Walkable: anyGround}}
			err := gateTarget(cast, nil)
			if tt.fits {
				assert.NoError(t, err)
				return
			}
			assert.ErrorIs(t, err, ErrBadPageTarget)
		})
	}
}

// Only pages with a resolver are offered, and with wave 2 built every page of
// the table has one; a page of none is not. §K R59.
func TestPageOffered_OnlyPagesWithAResolver(t *testing.T) {
	assert.Len(t, AllPageIDs(), 14)
	for _, id := range AllPageIDs() {
		assert.True(t, PageOffered(id), id)
	}
	assert.False(t, PageOffered(unwrittenPage.ID))
}

// unwrittenPage is a page of no resolver, unlocked from level 1: it stands in
// for a page not offered, now that every page of the table is.
var unwrittenPage = BookPage{ID: "unwritten", Class: "warrior", UnlockLevel: 1, Target: TargetSelf}

// Every book holds its own copy of its pages: a class's page table is never
// shared between the worlds that seat it. CLAUDE.md "No mutable state shared
// across worlds". I-X2CMM-22.
func TestNewBookComponent_HoldsItsOwnCopyOfThePages(t *testing.T) {
	table := []components.PageID{components.PageHeave, components.PageHardened}
	one, other := components.NewBookComponent(table), components.NewBookComponent(table)

	one.Pages[0] = components.PageLongNight

	assert.Equal(t, components.PageHeave, table[0], "the table untouched")
	assert.Equal(t, components.PageHeave, other.Pages[0], "another world's book untouched")
}
