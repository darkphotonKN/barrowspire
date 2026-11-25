package systems

import (
	"errors"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §B R11, §C R13-R14, §D R17, §J R55 as reconciled at wave 2;
// FS-4EC7Z §D R13. I-X2CMM-19.

// cageDesk is the world's open-cage entry point as a test stands it in: it
// records each cage opened and for whom, and refuses with refuse when set.
type cageDesk struct {
	opened  []uuid.UUID
	openers []uuid.UUID
	refuse  error
}

func (d *cageDesk) OpenCage(cage, opener uuid.UUID) error {
	if d.refuse != nil {
		return d.refuse
	}
	d.opened = append(d.opened, cage)
	d.openers = append(d.openers, opener)
	return nil
}

// standCage stands a shut cage at (x, y) in em.
func standCage(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	cage := em.CreateEntity()
	cage.AddComponent(&components.CageComponent{Encounter: uuid.New()})
	cage.AddComponent(components.NewTransformComponent(x, y))
	return cage
}

// pickTheLockCast is a level-3 mercenary at (0, 0) picking target's lock,
// the world's entry point desk.
func pickTheLockCast(t *testing.T, em *ecs.EntityManager, target *ecs.Entity, desk CageOpener) (BookCast, *ecs.Entity) {
	t.Helper()
	merc := bookDelver(em, "mercenary", 3, 0, 0, components.PagePickTheLock)
	page, ok := BookPageOf(string(components.PagePickTheLock))
	require.True(t, ok)
	return BookCast{Caster: merc, Page: page, Target: target, CellSize: testCell, PageEntryPoints: PageEntryPoints{Cages: desk}}, merc
}

// castThrough casts and counts the page's whole cast time, returning the
// cast's own refusal and what its completion refused.
func castThrough(t *testing.T, em *ecs.EntityManager, cast BookCast) ([]CastRefusal, error) {
	t.Helper()
	books := NewBookSystem(em)
	if err := books.Cast(cast); err != nil {
		return nil, err
	}
	var refused []CastRefusal
	for range ticksOf(cast.Page.CastTime) + 1 {
		refused = append(refused, books.AdvanceCasts(castTick, em.GetAllEntities(), nil, cast.BookGround, cast.PageEntryPoints)...)
	}
	return refused, nil
}

// A mercenary beside a cage picks its lock: a 4 s cast, then the world's
// open-cage entry point opens it for the caster as a member; the page costs
// nothing and its 30 s cooldown runs. R55, R11.
func TestBookSystemCast_PickTheLock_OpensTheCageAtCompletion(t *testing.T) {
	em := ecs.NewEntityManager()
	desk := &cageDesk{}
	cage := standCage(em, testCell, testCell) // a diagonal neighbour
	cast, merc := pickTheLockCast(t, em, cage, desk)
	pool, _ := bookPool(merc)
	before := pool.Current
	books := NewBookSystem(em)

	require.NoError(t, books.Cast(cast))
	require.NotNil(t, bookOfT(t, merc).Casting, "a 4 s cast")
	for range ticksOf(4) - 1 {
		books.AdvanceCasts(castTick, em.GetAllEntities(), nil, cast.BookGround, cast.PageEntryPoints)
	}
	assert.Empty(t, desk.opened, "nothing before the cast completes")

	refused := books.AdvanceCasts(castTick, em.GetAllEntities(), nil, cast.BookGround, cast.PageEntryPoints)

	assert.Empty(t, refused)
	assert.Equal(t, []uuid.UUID{cage.ID}, desk.opened)
	assert.Equal(t, []uuid.UUID{memberIDOf(merc)}, desk.openers, "opened for the caster as a member")
	assert.Equal(t, components.BookCooldown{Remaining: 30, Total: 30}, bookOfT(t, merc).Cooldowns[components.PagePickTheLock])
	assert.Equal(t, before, pool.Current, "no cost")
}

// Only a shut cage is picked, and only one adjacent (within 1.5 cells):
// anything else, an open cage too, is refused at the cast, nothing started
// and nothing opened. R55 as
// reconciled at wave 2, R12, R14.
func TestBookSystemCast_PickTheLock_RefusesAnythingButAnAdjacentCage(t *testing.T) {
	cases := map[string]func(em *ecs.EntityManager) *ecs.Entity{
		"no target": func(_ *ecs.EntityManager) *ecs.Entity { return nil },
		"a chest": func(em *ecs.EntityManager) *ecs.Entity {
			chest := em.CreateEntity()
			chest.AddComponent(components.NewTransformComponent(testCell, 0))
			chest.AddComponent(&components.InteractableComponent{})
			return chest
		},
		"a cage two cells off": func(em *ecs.EntityManager) *ecs.Entity { return standCage(em, 2*testCell, 0) },
		"a cage already open": func(em *ecs.EntityManager) *ecs.Entity {
			cage := standCage(em, testCell, 0)
			cc, _ := cage.GetComponent(ecs.ComponentTypeCage)
			cc.(*components.CageComponent).Open = true
			return cage
		},
	}
	for name, target := range cases {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			desk := &cageDesk{}
			cast, merc := pickTheLockCast(t, em, target(em), desk)

			err := NewBookSystem(em).Cast(cast)

			assert.ErrorIs(t, err, ErrBadPageTarget)
			assert.Nil(t, bookOfT(t, merc).Casting)
			assert.Empty(t, desk.opened)
		})
	}
}

// The entry point's refusal at the cast's end (too many allies, the cage
// opened by its key meanwhile) ends the cast with nothing spent, and comes
// back from the tick for the caster to be told. A world with no entry point
// opens no cage. FS-4EC7Z §C R10, §D R13; FS-X2CMM §D R17.
func TestBookSystemCast_PickTheLock_RefusedAtCompletionNothingSpent(t *testing.T) {
	refusal := errors.New("too many follow you already")
	for name, desk := range map[string]CageOpener{"refused": &cageDesk{refuse: refusal}, "no entry point": nil} {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			cast, merc := pickTheLockCast(t, em, standCage(em, testCell, 0), desk)

			refused, err := castThrough(t, em, cast)

			require.NoError(t, err, "taken at the cast")
			require.Len(t, refused, 1)
			assert.Equal(t, memberIDOf(merc), refused[0].Member)
			if desk != nil {
				assert.ErrorIs(t, refused[0].Err, refusal)
			} else {
				assert.ErrorIs(t, refused[0].Err, ErrNoCages)
			}
			assert.Nil(t, bookOfT(t, merc).Casting, "the cast ended")
			assert.NotContains(t, bookOfT(t, merc).Cooldowns, components.PagePickTheLock, "no cooldown")
		})
	}
}

// A cage gone by the cast's end (the floor changed under it) ends the cast
// with nothing, as any target that no longer holds, and is no refusal told.
// R17.
func TestBookSystemCast_PickTheLock_CageGoneEndsWithNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	desk := &cageDesk{}
	cage := standCage(em, testCell, 0)
	cast, merc := pickTheLockCast(t, em, cage, desk)
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))
	em.RemoveEntity(cage.ID)

	var refused []CastRefusal
	for range ticksOf(4) + 1 {
		refused = append(refused, books.AdvanceCasts(castTick, em.GetAllEntities(), nil, cast.BookGround, cast.PageEntryPoints)...)
	}

	assert.Empty(t, refused)
	assert.Empty(t, desk.opened)
	assert.NotContains(t, bookOfT(t, merc).Cooldowns, components.PagePickTheLock)
}
