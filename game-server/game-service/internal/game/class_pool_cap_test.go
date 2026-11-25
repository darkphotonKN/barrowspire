package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// armedCosts are the rows a class pays for that are neither its ability nor
// its tree ability: the mercenary's riposte, armed by a parry, never cast.
var armedCosts = map[string][]components.AttackKind{
	"mercenary": {components.AttackRiposte},
}

// No cost a class pays exceeds its base pool: its class ability, its tree
// ability, every page of its book, and any armed row, each against the max
// it is seated with (stamina, mana, or parry charges for the mercenary). A
// cost above the base pool is one a fresh delver can never pay.
// FS-8AY7S §Change: A cost never exceeds the class's base pool P1.
func TestClasses_EveryAbilityAndPageCost_AtMostTheClassBasePool(t *testing.T) {
	require.NotEmpty(t, Classes)
	for class, config := range Classes {
		t.Run(class, func(t *testing.T) {
			pool := config.Resource
			require.Positive(t, pool.Max, "a base pool to check against")

			costs := map[string]int{
				"ability " + string(config.Ability):          systems.AttackCost(config.Ability),
				"tree ability " + string(config.TreeAbility): systems.TreeAbilityCost(config.TreeAbility),
			}
			for _, kind := range armedCosts[class] {
				costs["armed "+string(kind)] = systems.AttackCost(kind)
			}
			require.NotEmpty(t, config.Book, "a class book")
			for _, id := range config.Book {
				page, ok := systems.BookPageOf(string(id))
				require.True(t, ok, "page %s is in the page table", id)
				require.Equal(t, class, page.Class, "page %s is the %s's", id, class)
				costs["page "+string(id)] = page.Cost
			}

			for name, cost := range costs {
				assert.LessOrEqual(t, cost, pool.Max, "%s's %s costs %d, over its base %d %s", class, name, cost, pool.Max, pool.Kind)
			}
		})
	}
}
