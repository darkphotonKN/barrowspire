package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-5FZ4J §F R39: with a fixed roll, a better chest's item is one rarity
// step up from a chest's: the roll that gives a chest Normal gives it
// Uncommon, Rare gives Runed, and Runed, the highest a chest rolls, stays.
func TestRollDrop_BetterChest_OneRarityStepUp(t *testing.T) {
	w := rarityWeights(testRarities, longsword.Config.ItemType, lootDrop{ItemLevel: 1})
	sum := 0.0
	for _, x := range w {
		sum += x
	}
	// a Float64 landing inside each rarity's share of the weights
	at := func(code string) float64 {
		acc := 0.0
		for i, r := range testRarities {
			if r.Code == code {
				return (acc + w[i]/2) / sum
			}
			acc += w[i]
		}
		t.Fatalf("no %s", code)
		return 0
	}
	cases := []struct{ rolled, better string }{
		{rarityNormal, rarityUncommon},
		{rarityUncommon, rarityRare},
		{rarityRare, rarityRuned},
		{rarityRuned, rarityRuned},
	}
	for _, c := range cases {
		chest, ok := rollDrop(fixedRand{f: at(c.rolled)}, []lootTemplate{longsword}, nil, testRarities, lootDrop{ItemLevel: 1})
		require.True(t, ok)
		require.Equal(t, c.rolled, chest.RarityCode, "a chest's roll")
		better, ok := rollDrop(fixedRand{f: at(c.rolled)}, []lootTemplate{longsword}, nil, testRarities, lootDrop{ItemLevel: 1, RaritySteps: BetterChestRaritySteps})
		require.True(t, ok)
		assert.Equal(t, c.better, better.RarityCode, "the same roll in a better chest, from %s", c.rolled)
	}
}

// A better chest rolls as one, and is a chest on the wire.
func TestContainerKindOf_BetterChest(t *testing.T) {
	em := ecs.NewEntityManager()
	chest := CreateContainerEntity(em, ContainerConfig{Kind: components.ContainerKindChest}, nil)
	cc, _ := chest.GetComponent(ecs.ComponentTypeContainer)
	cc.(*components.ContainerComponent).Better = true
	assert.Equal(t, containerKindBetterChest, containerKindOf(chest))
}
