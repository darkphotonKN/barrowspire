package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func stanceOf(t *testing.T, e *ecs.Entity) *components.ParryComponent {
	t.Helper()
	pc, ok := e.GetComponent(ecs.ComponentTypeParry)
	require.True(t, ok, "a mercenary carries a parry stance")
	return pc.(*components.ParryComponent)
}

func parryChargesOf(t *testing.T, e *ecs.Entity) *components.ResourceComponent {
	t.Helper()
	rc, ok := e.GetComponent(ecs.ComponentTypeResource)
	require.True(t, ok)
	parryCharges := rc.(*components.ResourceComponent)
	require.Equal(t, components.ResourceParryCharges, parryCharges.Kind)
	return parryCharges
}

// The mercenary's ability is the parry stance, which costs nothing: they are
// seated with it down, no lockout and nothing parried. No other class carries
// one. FS-MAMHR §Requirements 10, 18, 22.
func TestAddPlayer_OnlyAMercenaryCarriesAParryStance(t *testing.T) {
	for _, class := range []string{"mercenary", "warrior", "mage", "archer"} {
		t.Run(class, func(t *testing.T) {
			s := unstartedRun(t)
			_, entity := placeDelver(t, s, class, 500, 500)

			if class != "mercenary" {
				assert.False(t, entity.HasComponent(ecs.ComponentTypeParry))
				return
			}
			assert.Equal(t, components.AttackParry, Classes[class].Ability)
			assert.Zero(t, systems.AttackCost(Classes[class].Ability))
			assert.Equal(t, components.ParryComponent{}, *stanceOf(t, entity))
		})
	}
}

// cast_skill "parry" from a mercenary raises the stance on the next tick; a
// monster's strike on them then is negated for a parry charge. FS-MAMHR
// §Requirements 10–11, 14.
func TestCastSkill_ParryRaisesTheMercsStanceOnTheTick(t *testing.T) {
	s := unstartedRun(t)
	merc, entity := placeDelver(t, s, "mercenary", 500, 500)
	ghoul := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: 540, Y: 500})

	require.NoError(t, s.handleCastSkill(merc, "parry", 0, 0))
	assert.False(t, stanceOf(t, entity).Open, "the handler only records the cast")

	ic, _ := ghoul.GetComponent(ecs.ComponentTypeAttackIntent)
	ic.(*components.AttackIntentComponent).Pending = []components.AttackIntent{{Kind: components.AttackMonsterStrike, TargetEntityID: entity.ID}}
	tick(s)

	assert.True(t, stanceOf(t, entity).Open)
	hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)
	assert.Equal(t, health.MaxHealth, health.CurrentHealth, "negated")
	assert.Equal(t, 1, parryChargesOf(t, entity).Current)
}

// A non-mercenary's parry is a known skill id that does nothing.
// FS-MAMHR §Requirements 18.
func TestCastSkill_ParryFromAnotherClassDoesNothing(t *testing.T) {
	s := unstartedRun(t)
	warrior, entity := placeDelver(t, s, "warrior", 500, 500)

	require.NoError(t, s.handleCastSkill(warrior, "parry", 0, 0))
	tick(s)

	assert.False(t, entity.HasComponent(ecs.ComponentTypeParry))
	assert.Equal(t, 100, currentResource(entity), "nothing spent")
}

// A merc who dies in a run has 0 parry charges and no stance on that tick.
// FS-MAMHR §Requirements 21.
func TestStep_DeadMercLosesParryCharges(t *testing.T) {
	s := unstartedRun(t)
	merc, entity := placeDelver(t, s, "mercenary", 500, 500)
	parryChargesOf(t, entity).Current = 3
	require.NoError(t, s.handleCastSkill(merc, "parry", 0, 0))
	tick(s)
	require.True(t, stanceOf(t, entity).Open)

	hc, _ := entity.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	tick(s)

	assert.Equal(t, 0, parryChargesOf(t, entity).Current)
	assert.False(t, stanceOf(t, entity).Open)
}

// Parry charges are kept across a floor change: the delver entity survives it.
// FS-MAMHR §Requirements 20.
func TestRegenerateFloor_MercKeepsParryCharges(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	merc := uuid.New()
	s.AddPlayer(merc, types.CharacterInPlay{Name: "Wren", Class: "mercenary"}, "")
	entity := delverEntity(t, s, merc)
	parryChargesOf(t, entity).Current = 2
	stanceOf(t, entity).Parries = 2

	require.NoError(t, s.regenerateFloor())

	assert.Equal(t, 2, parryChargesOf(t, delverEntity(t, s, merc)).Current)
	assert.Equal(t, 2, stanceOf(t, delverEntity(t, s, merc)).Parries)
}

// A floor change mid-window, and again mid-lockout, leaves the stance and the
// whiff lockout as they stand: neither is closed, cleared nor restarted, so
// both end on the tick they would have without it. At 30 ticks a second the
// window closes on the 8th tick after its opening (8/30 s > 0.25 s) and the
// lockout, counted from 0.25 s, ends on the 30th tick after that close.
// FS-MAMHR §Requirements 11, 15, 20; Edge States "Floor change mid-window".
func TestRegenerateFloor_StanceAndLockoutRunOnTheirOwnClocks(t *testing.T) {
	require.Equal(t, 30, constants.GameFrameRate, "the tick counts below assume 30 ticks a second")
	s := newRun(t, &countingItemsClient{})
	merc := uuid.New()
	s.AddPlayer(merc, types.CharacterInPlay{Name: "Wren", Class: "mercenary"}, "")
	stance := func() components.ParryComponent { return *stanceOf(t, delverEntity(t, s, merc)) }
	ticks := func(n int) {
		for range n {
			tick(s)
		}
	}

	require.NoError(t, s.handleCastSkill(merc, "parry", 0, 0))
	tick(s) // the stance opens on this tick
	ticks(2)
	midWindow := stance()
	require.True(t, midWindow.Open)

	require.NoError(t, s.regenerateFloor())
	assert.Equal(t, midWindow, stance(), "the floor change leaves the open window as it was")

	ticks(5) // 7 ticks after the opening
	require.True(t, stance().Open, "still within the window")
	tick(s) // the 8th: past 0.25 s, a whiff
	afterClose := stance()
	require.False(t, afterClose.Open)
	assert.InDelta(t, 1.0-(8.0/30-0.25), afterClose.LockoutRemaining, 1e-9, "the lockout counts from the window's end")

	ticks(10)
	midLockout := stance()
	require.Positive(t, midLockout.LockoutRemaining)

	require.NoError(t, s.regenerateFloor())
	assert.Equal(t, midLockout, stance(), "the floor change leaves the lockout as it was")

	ticks(19) // 29 ticks after the close
	assert.Positive(t, stance().LockoutRemaining, "the lockout is not cut short")
	tick(s) // the 30th
	assert.Zero(t, stance().LockoutRemaining, "nor does it run on")
}

// A merc holding 3 parry charges who sends `cut` throws the riposte: the
// server arms it, the client only ever asks for a cut. A level-1 merc's
// riposte lands 49 on a target the cut could not reach, and spends all 3.
// FS-MAMHR §Requirements 23–24, 26.
func TestCastSkill_CutAtThreeParryChargesIsTheRiposte(t *testing.T) {
	s := unstartedRun(t)
	merc, entity := placeDelver(t, s, "mercenary", 500, 500)
	target := unarmoredTarget(s, 580, 500) // past the cut's 55 px
	parryChargesOf(t, entity).Current = 3

	require.NoError(t, s.handleCastSkill(merc, "cut", 600, 500))
	tick(s)

	assert.Equal(t, 1000-49, currentHealth(target))
	assert.Equal(t, 0, parryChargesOf(t, entity).Current)
}

// No skill id asks for a riposte: `riposte` is an unknown skill, records
// nothing and spends nothing. FS-MAMHR §Requirements 24.
func TestCastSkill_RiposteIsNotASkill(t *testing.T) {
	s := unstartedRun(t)
	merc, entity := placeDelver(t, s, "mercenary", 500, 500)
	target := unarmoredTarget(s, 580, 500)
	parryChargesOf(t, entity).Current = 3

	assert.ErrorIs(t, s.handleCastSkill(merc, "riposte", 600, 500), ErrUnknownSkill)
	tick(s)

	assert.Equal(t, 1000, currentHealth(target))
	assert.Equal(t, 3, parryChargesOf(t, entity).Current)
}
