package game

import (
	"context"
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	The worn uniques that ride on combat, through a run's tick: Gravewarden's
	Oath (melee_reflect), Lantern of the Drowned (pierce) and Ashwalk Greaves
	(burning_dash). FS-4R9M9 §Requirements 34–36, 38, 56.
*/

func gravewardensOath() types.ItemConfig {
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotChest, Name: "Gravewarden's Oath",
		DefenseRating: 10, RarityCode: "fabled", UniqueEffectCode: types.UniqueEffectMeleeReflect,
	}
}

func lanternOfTheDrowned() types.ItemConfig {
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeRing, Name: "Lantern of the Drowned",
		RarityCode: "fabled", UniqueEffectCode: types.UniqueEffectPierce,
	}
}

func ashwalkGreaves() types.ItemConfig {
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotLegs, Name: "Ashwalk Greaves",
		DefenseRating: 4, RarityCode: "fabled", UniqueEffectCode: types.UniqueEffectBurningDash,
	}
}

var (
	inChestSlot = func(eq *components.EquipmentComponent, id *uuid.UUID) { eq.ChestSlot = id }
	inLegsSlot  = func(eq *components.EquipmentComponent, id *uuid.UUID) { eq.LegsSlot = id }
)

// rootedMonster is a monster that stays where it stands.
func rootedMonster(s *Session, archetype components.MonsterArchetype, x, y float64) *ecs.Entity {
	m := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: archetype, Level: 4, X: x, Y: y})
	m.RemoveComponent(ecs.ComponentTypeVelocity)
	return m
}

func setHealth(t *testing.T, e *ecs.Entity, hp int) {
	t.Helper()
	hc, ok := e.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	hc.(*components.HealthComponent).CurrentHealth = hp
}

// A troll's strike on a Gravewarden wearer comes back at it as 20% of the
// damage dealt, and a reflected killing blow is a kill credited to the wearer.
// FS-4R9M9 §Requirements 34; §Acceptance Criteria "Uniques".
func TestRun_GravewardensOath_ReflectsATrollsStrikeAndCreditsTheKill(t *testing.T) {
	s, spy := watchedRun(t)
	_, wearer := placeDelver(t, s, "warrior", 500, 500)
	wearing(t, s, wearer, inChestSlot, gravewardensOath())
	troll := rootedMonster(s, components.MonsterArchetypeTroll, 540, 500)
	tick(s) // the gear is seated
	trollBefore, wearerBefore := currentHealth(troll), currentHealth(wearer)

	ic, _ := troll.GetComponent(ecs.ComponentTypeAttackIntent)
	ic.(*components.AttackIntentComponent).Pending = []components.AttackIntent{{Kind: components.AttackMonsterStrike, TargetEntityID: wearer.ID}}
	tick(s)

	dealt := wearerBefore - currentHealth(wearer)
	require.Positive(t, dealt)
	assert.Equal(t, max(1, int(math.Round(float64(dealt)*0.2))), trollBefore-currentHealth(troll))
	assert.Empty(t, spy.records)

	setHealth(t, troll, 1)
	ic.(*components.AttackIntentComponent).Pending = []components.AttackIntent{{Kind: components.AttackMonsterStrike, TargetEntityID: wearer.ID}}
	tick(s)

	require.Len(t, spy.records, 1)
	assert.Equal(t, troll.ID, spy.records[0].MonsterEntityID)
	assert.Equal(t, memberOf(t, wearer), spy.records[0].KillerMemberID)
}

// A Lantern wearer's arrow hits two monsters in a line, each once.
// FS-4R9M9 §Requirements 35; §Acceptance Criteria "Uniques".
func TestRun_LanternOfTheDrowned_ArrowHitsTwoMonstersInALine(t *testing.T) {
	s, _ := watchedRun(t)
	archer, wearer := placeDelver(t, s, "archer", 500, 500)
	wearing(t, s, wearer, inRing1Slot, lanternOfTheDrowned())
	near := rootedMonster(s, components.MonsterArchetypeTroll, 600, 500)
	far := rootedMonster(s, components.MonsterArchetypeTroll, 700, 500)
	beyond := rootedMonster(s, components.MonsterArchetypeTroll, 800, 500)
	tick(s)
	full := currentHealth(beyond)

	require.NoError(t, s.handleCastSkill(archer, "arrow", 900, 500))
	tickFor(s, 1)

	assert.Less(t, currentHealth(near), full)
	assert.Less(t, currentHealth(far), full)
	assert.Equal(t, currentHealth(near), currentHealth(far), "each struck once by the same arrow")
	assert.Equal(t, full, currentHealth(beyond), "the pierce is spent on the second")
}

// trailsInState is the burning trails the delver's broadcast carries.
func trailsInState(t *testing.T, s *Session, playerID uuid.UUID) []*types.TrailState {
	t.Helper()
	stateSerializer := serializer.NewStateSerializer(s.EntityManager)
	backendState, err := stateSerializer.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
	require.NoError(t, err)
	return stateSerializer.FormatStateToClientState(backendState, playerID).Trails
}

// An Ashwalk wearer's dash leaves a trail in world state that burns a monster
// in it every 0.5 s for 3 s, never a delver, and is then gone.
// FS-4R9M9 §Requirements 36, 56; §Acceptance Criteria "Uniques", "Protocol".
func TestRun_AshwalkGreaves_DashLeavesABurningTrailInState(t *testing.T) {
	s, spy := watchedRun(t)
	runner, wearer := placeDelver(t, s, "warrior", 500, 500)
	wearing(t, s, wearer, inLegsSlot, ashwalkGreaves())
	ally, allyEntity := placeDelver(t, s, "warrior", 560, 500)
	troll := rootedMonster(s, components.MonsterArchetypeTroll, 600, 520)
	tick(s)
	trollBefore, allyBefore := currentHealth(troll), currentHealth(allyEntity)

	require.NoError(t, s.handleCastSkill(runner, "dash", 900, 500))
	tick(s)

	trails := trailsInState(t, s, ally)
	require.Len(t, trails, 1)
	assert.Equal(t, types.Position{X: 500, Y: 500}, trails[0].From)
	assert.InDelta(t, 680, trails[0].To.X, 1e-9)
	assert.InDelta(t, 500, trails[0].To.Y, 1e-9)

	tick(s)
	perPulse := trollBefore - currentHealth(troll)
	require.Positive(t, perPulse, "the first pulse lands the tick after the dash")

	tickFor(s, 3)

	assert.Equal(t, trollBefore-6*perPulse, currentHealth(troll), "six pulses in 3 s")
	assert.Equal(t, allyBefore, currentHealth(allyEntity))
	assert.Empty(t, trailsInState(t, s, ally), "gone after 3 s")
	assert.Empty(t, spy.records)
}

// A trail kill is credited to the wearer.
func TestRun_AshwalkGreaves_TrailKillIsCreditedToTheWearer(t *testing.T) {
	s, spy := watchedRun(t)
	runner, wearer := placeDelver(t, s, "warrior", 500, 500)
	wearing(t, s, wearer, inLegsSlot, ashwalkGreaves())
	troll := rootedMonster(s, components.MonsterArchetypeTroll, 600, 500)
	setHealth(t, troll, 1)

	require.NoError(t, s.handleCastSkill(runner, "dash", 900, 500))
	tickFor(s, 0.5)

	require.Len(t, spy.records, 1)
	assert.Equal(t, troll.ID, spy.records[0].MonsterEntityID)
	assert.Equal(t, memberOf(t, wearer), spy.records[0].KillerMemberID)
}

// A floor change clears a burning trail with the floor. FS-4R9M9 §Edge States
// "Burning trail on a floor change".
func TestRun_AshwalkGreaves_FloorChangeClearsTheTrail(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	wearer := delverEntity(t, s, p.carrier)
	wearing(t, s, wearer, inLegsSlot, ashwalkGreaves())

	require.NoError(t, s.handleCastSkill(p.carrier, "dash", 900, 500))
	tick(s)
	require.Len(t, entityIDsWith(s, ecs.ComponentTypeBurningTrail), 1)

	require.NoError(t, s.regenerateFloor())

	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeBurningTrail))
	assert.Empty(t, trailsInState(t, s, p.carrier))
}
