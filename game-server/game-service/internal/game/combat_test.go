package game

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// unstartedRun is a run nobody but the test ticks, with crits pinned off.
func unstartedRun(t *testing.T) *Session {
	t.Helper()

	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, nil, RunBounds())
	s.combatSystem = systems.NewCombatSystem(em, func() float64 { return 0.999 }, s.playerDamage, UniqueEffects)

	return s
}

// placeDelver adds a delver of the class and stands them at (x, y).
func placeDelver(t *testing.T, s *Session, class string, x, y float64) (uuid.UUID, *ecs.Entity) {
	t.Helper()

	playerID := uuid.New()
	entity, ok := s.EntityManager.GetEntity(s.AddPlayer(playerID, types.CharacterInPlay{Name: "Delver", Class: class}, ""))
	require.True(t, ok)

	tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
	transform := tc.(*components.TransformComponent)
	transform.X, transform.Y = x, y

	return playerID, entity
}

// unarmoredTarget is something with health and a place and nothing to mitigate with.
func unarmoredTarget(s *Session, x, y float64) *ecs.Entity {
	e := s.EntityManager.CreateEntity()
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewHealthComponent(1000, 1000))
	return e
}

func currentHealth(e *ecs.Entity) int {
	c, _ := e.GetComponent(ecs.ComponentTypeHealth)
	return c.(*components.HealthComponent).CurrentHealth
}

func currentResource(e *ecs.Entity) int {
	c, _ := e.GetComponent(ecs.ComponentTypeResource)
	return c.(*components.ResourceComponent).Current
}

// The warrior slash used to cut health straight from the message goroutine. Now
// the handler only records the swing; the tick lands it.
func TestCastSkill_SlashLandsOnTheTickNotInTheHandler(t *testing.T) {
	s := unstartedRun(t)
	warrior, _ := placeDelver(t, s, "warrior", 500, 500)
	target := unarmoredTarget(s, 540, 500)

	require.NoError(t, s.handleCastSkill(warrior, "slash", 600, 500))
	assert.Equal(t, 1000, currentHealth(target), "the handler must not apply damage")

	tick(s)
	assert.Less(t, currentHealth(target), 1000, "the tick resolves the slash")
}

func TestCastSkill_HandlerSpendsNothing(t *testing.T) {
	s := unstartedRun(t)
	archer, entity := placeDelver(t, s, "archer", 500, 500)
	before := currentResource(entity)

	require.NoError(t, s.handleCastSkill(archer, "shadow_shot", 600, 500))
	assert.Equal(t, before, currentResource(entity))

	tick(s)
	assert.Equal(t, before-100, currentResource(entity))
}

func TestCastSkill_UnknownSkillIsRefused(t *testing.T) {
	s := unstartedRun(t)
	delver, _ := placeDelver(t, s, "mage", 500, 500)

	assert.ErrorIs(t, s.handleCastSkill(delver, "meteor", 600, 500), ErrUnknownSkill)
}

// The volley's ids are gone, not remapped: an old client's cast is an unknown
// skill like any other. FS-JTNPR §Requirements 3.
func TestCastSkill_TheVolleysOldIdsAreUnknown(t *testing.T) {
	for _, skillID := range []string{"triple_arrow", "multishot_arrow"} {
		t.Run(skillID, func(t *testing.T) {
			s := unstartedRun(t)
			archer, _ := placeDelver(t, s, "archer", 500, 500)

			assert.ErrorIs(t, s.handleCastSkill(archer, skillID, 600, 500), ErrUnknownSkill)
		})
	}
}

// Coefficients are tuned so a level-1 unequipped delver deals about what the old
// hard-coded numbers did. FS-77AB6 §Acceptance Criteria "Combat".
func TestLevelOneUnequipped_DamageMatchesTheOldNumbers(t *testing.T) {
	tests := []struct {
		class   string
		skillID string
		old     int
	}{
		{"warrior", "slash", 25},
		{"archer", "arrow", 20},
		{"mage", "fireball", 25},
	}

	for _, tt := range tests {
		t.Run(tt.class+" "+tt.skillID, func(t *testing.T) {
			s := unstartedRun(t)
			delver, _ := placeDelver(t, s, tt.class, 500, 500)
			target := unarmoredTarget(s, 540, 500)

			require.NoError(t, s.handleCastSkill(delver, tt.skillID, 600, 500))
			for i := 0; i < 30 && currentHealth(target) == 1000; i++ {
				tick(s) // projectiles need a tick or two to arrive
			}

			dealt := 1000 - currentHealth(target)
			assert.InDelta(t, tt.old, dealt, 0.2*float64(tt.old), "dealt %d against the old %d", dealt, tt.old)
		})
	}
}

// Each class names its tree ability beside its right-click. FS-04EEA §A R2.
func TestClasses_EachNamesItsTreeAbility(t *testing.T) {
	want := map[string]components.AttackKind{
		"warrior":   components.AttackEarthbreaker,
		"mage":      components.AttackBlink,
		"archer":    components.AttackArrowRain,
		"mercenary": components.AttackSettleTheDebt,
	}
	require.Len(t, Classes, len(want))
	for class, kind := range want {
		assert.Equal(t, kind, Classes[class].TreeAbility, class)
	}
}

// A seated delver holds their class's tree ability once they hold their tree's
// tier-3 node, and not before. FS-04EEA §A R2–R3.
func TestAddPlayer_SeatsTheTreeAbilityHeldOnlyWithTheTierThreeNode(t *testing.T) {
	for class, kind := range map[string]components.AttackKind{
		"warrior":   components.AttackEarthbreaker,
		"mage":      components.AttackBlink,
		"archer":    components.AttackArrowRain,
		"mercenary": components.AttackSettleTheDebt,
	} {
		t.Run(class, func(t *testing.T) {
			s := unstartedRun(t)
			without, _ := s.EntityManager.GetEntity(s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Delver", Class: class}, ""))
			_, held := systems.HeldTreeAbility(without)
			assert.False(t, held, "no tier-3 node")

			node, ok := passivetree.AbilityNode(class)
			require.True(t, ok)
			with, _ := s.EntityManager.GetEntity(s.AddPlayer(uuid.New(), types.CharacterInPlay{
				Name: "Delver", Class: class, PassiveRanks: passivetree.Ranks{node.ID: 1},
			}, ""))
			got, held := systems.HeldTreeAbility(with)
			assert.True(t, held)
			assert.Equal(t, kind, got)
		})
	}
}

// Earthbreaker cast through the handler resolves on the tick for a warrior
// holding the node, and does nothing at all for one without. FS-04EEA §A R3.
func TestCastSkill_EarthbreakerOnlyForAWarriorHoldingTheNode(t *testing.T) {
	node, _ := passivetree.AbilityNode("warrior")
	for _, tt := range []struct {
		name  string
		ranks passivetree.Ranks
		hit   bool
	}{
		{"with the node", passivetree.Ranks{node.ID: 1}, true},
		{"without the node", nil, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := unstartedRun(t)
			playerID := uuid.New()
			entity, ok := s.EntityManager.GetEntity(s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior", PassiveRanks: tt.ranks}, ""))
			require.True(t, ok)
			tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
			transform := tc.(*components.TransformComponent)
			transform.X, transform.Y = 500, 500
			behind := unarmoredTarget(s, 440, 500)

			require.NoError(t, s.handleCastSkill(playerID, "earthbreaker", 600, 500))
			tick(s)

			if tt.hit {
				assert.Less(t, currentHealth(behind), 1000, "all round, behind included")
				assert.Equal(t, 40, currentResource(entity))
				return
			}
			assert.Equal(t, 1000, currentHealth(behind))
			assert.Equal(t, 100, currentResource(entity))
		})
	}
}

// Settle the Debt cast through the handler resolves on the tick for a
// mercenary holding the node, spending every parry charge on a hit behind
// them as well; one without the node keeps them all. FS-04EEA §A R3, §F R30–R31.
func TestCastSkill_SettleTheDebtOnlyForAMercHoldingTheNode(t *testing.T) {
	node, _ := passivetree.AbilityNode("mercenary")
	for _, tt := range []struct {
		name  string
		ranks passivetree.Ranks
		hit   bool
	}{
		{"with the node", passivetree.Ranks{node.ID: 1}, true},
		{"without the node", nil, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := unstartedRun(t)
			playerID := uuid.New()
			entity, ok := s.EntityManager.GetEntity(s.AddPlayer(playerID, types.CharacterInPlay{Name: "Vael", Class: "mercenary", PassiveRanks: tt.ranks}, ""))
			require.True(t, ok)
			tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
			transform := tc.(*components.TransformComponent)
			transform.X, transform.Y = 500, 500
			rc, _ := entity.GetComponent(ecs.ComponentTypeResource)
			parryCharges := rc.(*components.ResourceComponent)
			require.Equal(t, components.ResourceParryCharges, parryCharges.Kind)
			parryCharges.Current = 2
			behind := unarmoredTarget(s, 440, 500)

			require.NoError(t, s.handleCastSkill(playerID, "settle_the_debt", 600, 500))
			tick(s)

			if tt.hit {
				assert.Less(t, currentHealth(behind), 1000, "all round, behind included")
				assert.Equal(t, 0, currentResource(entity))
				return
			}
			assert.Equal(t, 1000, currentHealth(behind))
			assert.Equal(t, 2, currentResource(entity))
		})
	}
}
