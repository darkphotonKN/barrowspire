package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	FS-E1ZDG §D R16, R18, the Berserker's blood price in combat: 25% attack
	speed past worn attack speed's cap, 10% more raw damage on their own hits,
	and a slash that hits heals once.
*/

var (
	berserkerRanks = passivetree.Ranks{"warrior.t6b": 1}
	guardianRanks  = passivetree.Ranks{"warrior.t6a": 1}
)

// Acceptance "A Berserker's slash cooldown is 0.25 / (1 + (worn + 25) / 100)
// with worn capped at 50": the worn bonus here is the GearSystem's, already
// capped.
func TestBloodPrice_SlashCooldownCountsTheAttackSpeedPastTheCap(t *testing.T) {
	tests := []struct {
		name  string
		ranks passivetree.Ranks
		worn  int
		want  float64
	}{
		{"a Berserker, nothing worn", berserkerRanks, 0, 0.25 / 1.25},
		{"a Berserker at the worn cap", berserkerRanks, 50, 0.25 / 1.75},
		{"a Guardian at the worn cap", guardianRanks, 50, 0.25 / 1.5},
		{"no specialization, nothing worn", nil, 0, 0.25},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newKickerWorld("warrior", tt.ranks, neverCrit)
			w.body.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: tt.worn})

			w.cast(components.AttackSlash, 200, 100)

			remaining, total := cooldownState(w.body, components.AttackSlash)
			assert.InDelta(t, tt.want, remaining, 1e-9)
			assert.InDelta(t, tt.want, total, 1e-9)
		})
	}
}

// Acceptance "A Berserker's slash, no crit, no mitigation, deals 10% more raw
// damage than a Guardian's with the same stats", and Earthbreaker, their own
// attack too.
func TestBloodPrice_TheBerserkersOwnHitsDealTenPercentMore(t *testing.T) {
	dealt := func(ranks passivetree.Ranks, kind components.AttackKind) int {
		w := newKickerWorld("warrior", ranks, neverCrit)
		w.body.AddComponent(components.NewTreeAbilityComponent(components.AttackEarthbreaker, "warrior.t3"))
		target := dummy(w.em, 140, 100)
		w.cast(kind, 200, 100)
		return 1000 - health(target)
	}

	assert.Equal(t, whole(RawDamage(12, 1.5, 8)), dealt(guardianRanks, components.AttackSlash))
	assert.Equal(t, whole(RawDamage(12, 1.5*1.10, 8)), dealt(berserkerRanks, components.AttackSlash))
	assert.Equal(t, dealt(nil, components.AttackSlash), dealt(guardianRanks, components.AttackSlash), "a Guardian is unchanged")

	withTree := passivetree.Ranks{"warrior.t3": 1}
	berserkerWithTree := passivetree.Ranks{"warrior.t3": 1, "warrior.t6b": 1}
	assert.Equal(t, whole(RawDamage(12, 1.5*1.10, 8)), dealt(berserkerWithTree, components.AttackEarthbreaker))
	assert.Equal(t, whole(RawDamage(12, 1.5, 8)), dealt(withTree, components.AttackEarthbreaker))
}

// slashHeal is a Berserker's heal for a slash that hits at max HP maxHP.
func slashHeal(maxHP int) int {
	return max(1, whole(float64(maxHP)*0.015))
}

// Acceptance "A slash hitting three monsters heals once, max(1, round(1.5% × max
// HP)), never above max; a slash hitting nothing heals nothing" (R18).
func TestBloodPrice_ASlashThatHitsHealsOnce(t *testing.T) {
	wounded := func(ranks passivetree.Ranks, current int) *kickerWorld {
		w := newKickerWorld("warrior", ranks, neverCrit)
		healthOf(w.body).CurrentHealth = current
		return w
	}
	maxHP := BloodPricedMaxHealth(ownMaxHealth)

	t.Run("three monsters, one heal", func(t *testing.T) {
		w := wounded(berserkerRanks, 50)
		ghoul(w.em, 140, 100, 1000)
		ghoul(w.em, 130, 120, 1000)
		ghoul(w.em, 130, 80, 1000)
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, maxHP, healthOf(w.body).MaxHealth)
		assert.Equal(t, 50+slashHeal(maxHP), health(w.body))
	})

	t.Run("anything it hits is a target", func(t *testing.T) {
		w := wounded(berserkerRanks, 50)
		dummy(w.em, 140, 100)
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, 50+slashHeal(maxHP), health(w.body))
	})

	t.Run("hitting nothing heals nothing", func(t *testing.T) {
		w := wounded(berserkerRanks, 50)
		ghoul(w.em, 60, 100, 1000) // behind the swing
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, 50, health(w.body))
	})

	t.Run("never above max", func(t *testing.T) {
		w := wounded(berserkerRanks, maxHP-1)
		ghoul(w.em, 140, 100, 1000)
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, maxHP, health(w.body))
	})

	t.Run("at least 1", func(t *testing.T) {
		w := wounded(berserkerRanks, 10)
		healthOf(w.body).MaxHealth = 30 // 1.5% is 0.45
		ghoul(w.em, 140, 100, 1000)
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, 11, health(w.body))
	})

	t.Run("only a slash heals", func(t *testing.T) {
		w := wounded(passivetree.Ranks{"warrior.t3": 1, "warrior.t6b": 1}, 50)
		w.body.AddComponent(components.NewTreeAbilityComponent(components.AttackEarthbreaker, "warrior.t3"))
		target := ghoul(w.em, 140, 100, 1000)
		w.cast(components.AttackEarthbreaker, 200, 100)
		require.Less(t, health(target), 1000, "Earthbreaker landed")
		assert.Equal(t, 50, health(w.body), "Earthbreaker is no slash")
	})

	t.Run("a Guardian's slash heals nothing", func(t *testing.T) {
		w := wounded(guardianRanks, 50)
		ghoul(w.em, 140, 100, 1000)
		w.cast(components.AttackSlash, 200, 100)
		assert.Equal(t, 50, health(w.body))
	})
}

// At seating a rankedBody Berserker holds two-thirds of its
// own max HP, at full.
func TestBloodPrice_ARankedBodyIsSeatedAtTheReducedMax(t *testing.T) {
	w := newKickerWorld("warrior", berserkerRanks, neverCrit)
	assert.Equal(t, 134, healthOf(w.body).MaxHealth) // round(0.67 × 200)
	assert.Equal(t, 134, health(w.body))
	assert.Equal(t, ownMaxHealth, passiveBonus(w.body).OwnMaxHealth, "the basis stays the class body")
}
