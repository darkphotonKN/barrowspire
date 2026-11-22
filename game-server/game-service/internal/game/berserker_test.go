package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	FS-E1ZDG §D R14–17, the Berserker's blood price on the body: two-thirds of
	the class body's max HP, at seating, on level-up and at the pick.
*/

// berserkerAt is a warrior of level holding the Berserker's tier-6 node.
func berserkerAt(level int) types.CharacterInPlay {
	return types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: level,
		PassiveRanks: passivetree.Ranks{"warrior.t6b": 1}}
}

// Acceptance "A level-20 Berserker is seated at max HP round(0.67 × (150 + 19
// × 12)) = 253 plus worn max HP, at full" (R14–15).
func TestSeating_ABerserkerIsSeatedAtTwoThirdsOfTheClassBody_AtFull(t *testing.T) {
	body := seat(t, unstartedRun(t), berserkerAt(20))

	assert.Equal(t, 253, body.health.MaxHealth)
	assert.Equal(t, 253, body.health.CurrentHealth, "seated at full")
}

// R14: worn max HP (Vitality's included) and the tree's add on top of the
// reduced class body, unscaled.
func TestSeating_ABerserkersWornAndTreeMaxHPAddOnTopUnscaled(t *testing.T) {
	seatAt := func(character types.CharacterInPlay) *components.HealthComponent {
		s := newPassiveWorld()
		memberID := uuid.New()
		s.AddPlayer(memberID, character, "")
		gearTick(s)
		return bodyHealth(t, delverEntity(t, s, memberID))
	}
	warrior := berserkerAt(20)
	warrior.PassiveRanks = passivetree.Ranks{"warrior.t2b": 2}
	berserker := berserkerAt(20)
	berserker.PassiveRanks["warrior.t2b"] = 2

	plain, priced := seatAt(warrior), seatAt(berserker)

	assert.Equal(t, plain.MaxHealth-(378-253), priced.MaxHealth, "only the class body's 378 is scaled")
	assert.Equal(t, priced.MaxHealth, priced.CurrentHealth, "seated at full")
}

// R17, Acceptance "At the pick, a warrior at full HP drops to the new max; one
// below it keeps their HP", and Edge "Berserker at the pick with gear max HP".
func TestRaisePassiveRanks_TheBerserkerPickClampsCurrentHP(t *testing.T) {
	pick := func(t *testing.T, wound int) (before, after components.HealthComponent) {
		s := newHubWorld()
		memberID := uuid.New()
		character := berserkerAt(20)
		character.PassiveRanks = passivetree.Ranks{"warrior.t2b": 2}
		s.AddPlayer(memberID, character, "")
		gearTick(s)
		body := bodyHealth(t, delverEntity(t, s, memberID))
		body.CurrentHealth -= wound
		before = *body

		require.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"warrior.t6b": 1}))
		gearTick(s)
		return before, *bodyHealth(t, delverEntity(t, s, memberID))
	}

	t.Run("at full, drops to the new max", func(t *testing.T) {
		before, after := pick(t, 0)
		assert.Equal(t, before.MaxHealth-(378-253), after.MaxHealth, "only the class body's part shrinks")
		assert.Equal(t, after.MaxHealth, after.CurrentHealth)
	})

	t.Run("below the new max, keeps their HP", func(t *testing.T) {
		before, after := pick(t, 200)
		require.Less(t, before.CurrentHealth, after.MaxHealth)
		assert.Equal(t, before.CurrentHealth, after.CurrentHealth)
	})

	t.Run("between the old and new max, clamps to the new", func(t *testing.T) {
		_, after := pick(t, 50)
		assert.Equal(t, after.MaxHealth, after.CurrentHealth)
	})
}

// A Guardian, and a warrior with no specialization, keep the class body whole.
func TestSeating_AGuardianAndAPlainWarriorKeepTheirMaxHP(t *testing.T) {
	guardian := berserkerAt(20)
	guardian.PassiveRanks = passivetree.Ranks{"warrior.t6a": 1}
	plain := berserkerAt(20)
	plain.PassiveRanks = nil

	assert.Equal(t, 378, seat(t, unstartedRun(t), guardian).health.MaxHealth)
	assert.Equal(t, 378, seat(t, unstartedRun(t), plain).health.MaxHealth)
}

// R15, Acceptance "A Berserker's level-up raises max HP by the scaled growth and
// leaves current HP alone", on the growth step directly: at today's cap the
// pick comes at 20, so no seated Berserker ever levels.
func TestGainExperience_ABerserkerGrowsByTheScaledStep(t *testing.T) {
	warrior := Classes["warrior"]

	tests := []struct {
		name  string
		ranks passivetree.Ranks
		want  int
	}{
		// round(0.67 × 366) − round(0.67 × 354) = 245 − 237
		{"a Berserker, 18 to 19", passivetree.Ranks{"warrior.t6b": 1}, 8},
		{"a Guardian, 18 to 19", passivetree.Ranks{"warrior.t6a": 1}, warrior.Growth.MaxHealth},
		{"no specialization, 18 to 19", nil, warrior.Growth.MaxHealth},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entity := ecs.NewEntityManager().CreateEntity()
			entity.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "Wren", false))
			entity.AddComponent(components.NewPassiveRanksComponent(tt.ranks))
			entity.AddComponent(&components.StatsComponent{Level: 18, Experience: int(progression.LevelFloor(18))})
			entity.AddComponent(components.NewHealthComponent(100, 237))

			gainExperience(entity, warrior, int(progression.LevelFloor(19)-progression.LevelFloor(18)))

			body := bodyHealth(t, entity)
			assert.Equal(t, 237+tt.want, body.MaxHealth)
			assert.Equal(t, 100, body.CurrentHealth, "no heal on level-up")
		})
	}
}
