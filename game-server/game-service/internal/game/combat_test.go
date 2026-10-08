package game

import (
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
	entity, ok := s.EntityManager.GetEntity(s.AddPlayer(playerID, types.CharacterInPlay{Name: "Delver", Class: class}))
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

func currentMana(e *ecs.Entity) int {
	c, _ := e.GetComponent(ecs.ComponentTypeMana)
	return c.(*components.ManaComponent).CurrentMana
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

func TestCastSkill_HandlerSpendsNoMana(t *testing.T) {
	s := unstartedRun(t)
	archer, entity := placeDelver(t, s, "archer", 500, 500)
	before := currentMana(entity)

	require.NoError(t, s.handleCastSkill(archer, "triple_arrow", 600, 500))
	assert.Equal(t, before, currentMana(entity))

	tick(s)
	assert.Equal(t, before-10, currentMana(entity))
}

func TestCastSkill_UnknownSkillIsRefused(t *testing.T) {
	s := unstartedRun(t)
	delver, _ := placeDelver(t, s, "mage", 500, 500)

	assert.ErrorIs(t, s.handleCastSkill(delver, "meteor", 600, 500), ErrUnknownSkill)
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
