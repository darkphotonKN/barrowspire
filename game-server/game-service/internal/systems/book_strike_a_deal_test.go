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

// FS-X2CMM §B R11, §C R13-R14, §D R17, §J R56; FS-4EC7Z §D R15. I-X2CMM-20.

// hireDesk is the world's hire entry point as a test stands it in: it
// records each group named and for whom, and refuses with refuse when set.
type hireDesk struct {
	groups []uuid.UUID
	hirers []uuid.UUID
	refuse error
}

func (d *hireDesk) Hire(group, hirer uuid.UUID) error {
	if d.refuse != nil {
		return d.refuse
	}
	d.groups = append(d.groups, group)
	d.hirers = append(d.hirers, hirer)
	return nil
}

// standCutthroat stands a living encounter NPC at (x, y) in em, as one of a
// group the wire shows.
func standCutthroat(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	npc := em.CreateEntity()
	npc.AddComponent(&components.EncounterNPCComponent{Kind: components.EncounterNPCCutthroat, Stance: components.StancePeaceful, Encounter: uuid.New()})
	npc.AddComponent(components.NewTransformComponent(x, y))
	npc.AddComponent(components.NewHealthComponent(100, 100))
	return npc
}

// strikeADealCast is a level-9 mercenary at (0, 0) striking a deal with
// target's group, the world's entry point desk.
func strikeADealCast(t *testing.T, em *ecs.EntityManager, target *ecs.Entity, desk GroupHirer) (BookCast, *ecs.Entity) {
	t.Helper()
	merc := bookDelver(em, "mercenary", 9, 0, 0, components.PageStrikeADeal)
	page, ok := BookPageOf(string(components.PageStrikeADeal))
	require.True(t, ok)
	return BookCast{Caster: merc, Page: page, Target: target, CellSize: testCell, BookGround: BookGround{Hires: desk}}, merc
}

// A mercenary strikes a deal with a group 4 cells off, named by one of its
// NPCs: a 2 s cast, then the world's hire entry point hires that NPC's group
// for the caster as a member; the page costs nothing and its 900 s cooldown
// runs. R56, R11.
func TestBookSystemCast_StrikeADeal_HiresTheGroupAtCompletion(t *testing.T) {
	em := ecs.NewEntityManager()
	desk := &hireDesk{}
	npc := standCutthroat(em, 4*testCell, 0)
	cast, merc := strikeADealCast(t, em, npc, desk)
	pool, _ := bookPool(merc)
	before := pool.Current

	refused, err := castThrough(t, em, cast)

	require.NoError(t, err)
	assert.Empty(t, refused)
	assert.Equal(t, []uuid.UUID{npc.ID}, desk.groups, "the group named by its NPC")
	assert.Equal(t, []uuid.UUID{memberIDOf(merc)}, desk.hirers, "hired for the caster as a member")
	assert.Equal(t, components.BookCooldown{Remaining: 900, Total: 900}, bookOfT(t, merc).Cooldowns[components.PageStrikeADeal])
	assert.Equal(t, before, pool.Current, "no cost, no gold")
}

// Only a living encounter NPC within 4 cells names a group: anything else is
// refused at the cast, nothing started and nothing hired. R56, R14.
func TestBookSystemCast_StrikeADeal_RefusesAnythingButANearEncounterNPC(t *testing.T) {
	cases := map[string]func(em *ecs.EntityManager) *ecs.Entity{
		"no target": func(_ *ecs.EntityManager) *ecs.Entity { return nil },
		"a chest": func(em *ecs.EntityManager) *ecs.Entity {
			chest := em.CreateEntity()
			chest.AddComponent(components.NewTransformComponent(testCell, 0))
			chest.AddComponent(&components.InteractableComponent{})
			return chest
		},
		"a cage": func(em *ecs.EntityManager) *ecs.Entity { return standCage(em, testCell, 0) },
		"a dead one": func(em *ecs.EntityManager) *ecs.Entity {
			npc := standCutthroat(em, testCell, 0)
			hc, _ := npc.GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).CurrentHealth = 0
			return npc
		},
		"one five cells off": func(em *ecs.EntityManager) *ecs.Entity { return standCutthroat(em, 5*testCell, 0) },
	}
	for name, target := range cases {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			desk := &hireDesk{}
			cast, merc := strikeADealCast(t, em, target(em), desk)

			err := NewBookSystem(em).Cast(cast)

			assert.ErrorIs(t, err, ErrBadPageTarget)
			assert.Nil(t, bookOfT(t, merc).Casting)
			assert.Empty(t, desk.groups)
		})
	}
}

// The hire entry point's refusal at the cast's end (not willing, already
// hired, too many allies) ends the cast with nothing spent, and comes back
// from the tick for the caster to be told. A world with no entry point hires
// no one. FS-4EC7Z §D R15; FS-X2CMM §D R17.
func TestBookSystemCast_StrikeADeal_RefusedAtCompletionNothingSpent(t *testing.T) {
	refusal := errors.New("this group will not be hired")
	for name, desk := range map[string]GroupHirer{"refused": &hireDesk{refuse: refusal}, "no entry point": nil} {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			cast, merc := strikeADealCast(t, em, standCutthroat(em, 2*testCell, 0), desk)

			refused, err := castThrough(t, em, cast)

			require.NoError(t, err, "taken at the cast")
			require.Len(t, refused, 1)
			assert.Equal(t, memberIDOf(merc), refused[0].Member)
			if desk != nil {
				assert.ErrorIs(t, refused[0].Err, refusal)
			} else {
				assert.ErrorIs(t, refused[0].Err, ErrNoHires)
			}
			assert.NotContains(t, bookOfT(t, merc).Cooldowns, components.PageStrikeADeal, "no cooldown")
		})
	}
}
