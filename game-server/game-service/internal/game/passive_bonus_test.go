package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-8RZ51 §F R24–R27: the seated body's passive bonuses, from its ranks.

func bodyHealth(t *testing.T, entity *ecs.Entity) *components.HealthComponent {
	t.Helper()
	hc, ok := entity.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	return hc.(*components.HealthComponent)
}

func bodyPool(t *testing.T, entity *ecs.Entity) *components.ResourceComponent {
	t.Helper()
	rc, ok := entity.GetComponent(ecs.ComponentTypeResource)
	require.True(t, ok)
	return rc.(*components.ResourceComponent)
}

// gearTick runs the world's gear pass once over every entity in s.
func gearTick(s *Session) {
	systems.NewGearSystem(s.EntityManager, GearCaps, UniqueEffects, Attributes).Update(1.0/30, s.EntityManager.GetAllEntities())
}

// Acceptance "Seated with Thick Skin (t2b) at 2, a warrior's max HP is own
// max HP × 1.08 (rounded), gear on top" (R26).
func TestSeating_PercentMaxHPIsOfOwnMaxHPAtSeating_GearOnTop(t *testing.T) {
	own := classAtLevel(Classes["warrior"], 6).Health.MaxHealth
	seat := func(ranks passivetree.Ranks) *ecs.Entity {
		s := newPassiveWorld()
		memberID := uuid.New()
		s.AddPlayer(memberID, rankedWarrior(ranks), "")
		gearTick(s)
		return delverEntity(t, s, memberID)
	}

	bare := bodyHealth(t, seat(nil))
	ranked := bodyHealth(t, seat(passivetree.Ranks{"warrior.t2b": 2}))

	gain := int(math.Round(float64(own) * 0.08))
	assert.Equal(t, bare.MaxHealth+gain, ranked.MaxHealth, "own × 1.08 rounded, Vitality and gear added on top")
	assert.Equal(t, ranked.MaxHealth, ranked.CurrentHealth, "seated full")
}

// rankedCharacter is a level-6 character of class holding ranks.
func rankedCharacter(class string, ranks passivetree.Ranks) types.CharacterInPlay {
	return types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: class, Level: 6, PassiveRanks: ranks}
}

func newHubWorld() *Session {
	return newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
}

// Acceptance "A spend in town raises the HUB body's max and current HP by the
// same amount at once" (R27), here Thick Skin's percent, and Deep Well's max
// and current mana.
func TestRaisePassiveRanks_InTown_TheBodyFeelsItAtOnce(t *testing.T) {
	t.Run("max HP", func(t *testing.T) {
		s := newHubWorld()
		memberID := uuid.New()
		character := rankedWarrior(passivetree.Ranks{"warrior.t2b": 1})
		s.AddPlayer(memberID, character, "")
		gearTick(s)
		body := bodyHealth(t, delverEntity(t, s, memberID))
		body.CurrentHealth -= 30
		maxBefore, currentBefore := body.MaxHealth, body.CurrentHealth

		require.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"warrior.t2b": 2}))

		own := classAtLevel(Classes["warrior"], 6).Health.MaxHealth
		gain := int(math.Round(float64(own)*0.08)) - int(math.Round(float64(own)*0.04))
		after := bodyHealth(t, delverEntity(t, s, memberID))
		assert.Equal(t, maxBefore+gain, after.MaxHealth)
		assert.Equal(t, currentBefore+gain, after.CurrentHealth)

		gearTick(s)
		assert.Equal(t, maxBefore+gain, after.MaxHealth, "the gear pass keeps it")
	})

	t.Run("max mana", func(t *testing.T) {
		s := newHubWorld()
		memberID := uuid.New()
		character := rankedCharacter("mage", nil)
		s.AddPlayer(memberID, character, "")
		pool := bodyPool(t, delverEntity(t, s, memberID))
		maxBefore, currentBefore := pool.Max, pool.Current

		require.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"mage.t2b": 1}))

		assert.Equal(t, maxBefore+15, pool.Max)
		assert.Equal(t, currentBefore+15, pool.Current, "a full bar stays full")
	})
}

// Acceptance "A spend in town does not change a body in a field or run; the
// next seating there has it" (R24, ADR-0082 5).
func TestRaisePassiveRanks_OutOfTown_TheBodyIsUntouched(t *testing.T) {
	for name, bounds := range map[string]WorldBounds{"a run": RunBounds(), "a field": FieldBounds(GentleMeadows())} {
		t.Run(name, func(t *testing.T) {
			s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, bounds)
			memberID := uuid.New()
			character := rankedWarrior(nil)
			s.AddPlayer(memberID, character, "")
			before := *bodyHealth(t, delverEntity(t, s, memberID))

			assert.False(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"warrior.t2b": 2}))

			assert.Equal(t, before, *bodyHealth(t, delverEntity(t, s, memberID)))
			assert.Empty(t, systems.PassiveRanks(delverEntity(t, s, memberID)))

			s.RemovePlayer(memberID.String())
			character.PassiveRanks = passivetree.Ranks{"warrior.t2b": 2}
			s.AddPlayer(memberID, character, "")
			own := classAtLevel(Classes["warrior"], 6).Health.MaxHealth
			assert.Equal(t, own+int(math.Round(float64(own)*0.08)), bodyHealth(t, delverEntity(t, s, memberID)).MaxHealth,
				"the next seating has it")
		})
	}
}
