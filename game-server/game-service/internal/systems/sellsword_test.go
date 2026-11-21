package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/stretchr/testify/assert"
)

/*
	FS-E1ZDG §J R33–36, the Sellsword: a parry-charge max of 5, a cut that
	never ripostes, and per charge held as a cast resolves +5% cut damage and
	+5% attack speed. A dummy 80 px down the aim stands past the cut's 55 px
	reach and inside the riposte's 90, so only a riposte touches it; one at
	40 px takes the cut.
*/

var sellswordRanks = passivetree.Ranks{"mercenary.t6b": 1}

// newSellswordWorld is a Sellsword holding charges parry charges of their max
// of 5, as seating builds them.
func newSellswordWorld(charges int) *kickerWorld {
	w := newMercWorld(sellswordRanks, neverCrit, charges)
	ApplySellswordPool(w.body)
	return w
}

func TestApplySellswordPool_ASellswordsMaxIsFiveAndTheCountStays(t *testing.T) {
	w := newMercWorld(sellswordRanks, neverCrit, 2)

	ApplySellswordPool(w.body)

	assert.Equal(t, 5, resourceOf(w.body).Max)
	assert.Equal(t, 2, pool(w.body), "the count does not move")
}

func TestApplySellswordPool_AnyOtherBodyIsLeftAlone(t *testing.T) {
	for _, ranks := range []passivetree.Ranks{{}, duelistRanks} {
		w := newMercWorld(ranks, neverCrit, 2)

		ApplySellswordPool(w.body)

		assert.Equal(t, 3, resourceOf(w.body).Max, "ranks %v", ranks)
		assert.Equal(t, 2, pool(w.body))
	}
	warrior := newKickerWorld("warrior", sellswordRanks, neverCrit)
	before := *resourceOf(warrior.body)
	ApplySellswordPool(warrior.body)
	assert.Equal(t, before, *resourceOf(warrior.body), "another class's pool, even holding the node id")
}

// R33: at every count up to the max, the cut is a cut, and spends nothing.
func TestSellsword_ACutAtAnyCountIsACut(t *testing.T) {
	for charges := 0; charges <= 5; charges++ {
		w := newSellswordWorld(charges)
		near := dummyOffAim(w.em, 40, 0)
		far := dummyOffAim(w.em, 80, 0)

		w.cast(components.AttackCut, 200, 100)

		assert.Equal(t, 1000, health(far), "at %d, no riposte's reach", charges)
		assert.Equal(t, 1000-cutDamage(5*float64(charges), false), health(near), "at %d, the cut", charges)
		assert.Equal(t, charges, pool(w.body), "at %d, nothing spent", charges)
	}
}

// R35: each charge held is +5% of the cut's raw damage, before crit, and +5%
// attack speed added after worn attack speed's cap, so at 4 the cut's raw
// damage is 1.20× and its cooldown 0.25 / (1 + (worn + 20) / 100).
func TestSellsword_EachChargeSharpensAndQuickensTheCut(t *testing.T) {
	tests := []struct {
		name string
		worn int // already capped, as the gear system leaves it
	}{
		{"nothing worn", 0},
		{"some worn", 30},
		{"worn at its cap", 50},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newSellswordWorld(4)
			w.body.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: tt.worn})
			near := dummyOffAim(w.em, 40, 0)

			w.cast(components.AttackCut, 200, 100)

			assert.Equal(t, 1000-cutDamage(20, false), health(near))
			assert.InDelta(t, 0.25/(1+float64(tt.worn+20)/100), cooldownsOf(w.body)[components.AttackCut], 1e-9)
		})
	}

	t.Run("the crit multiplies the raised raw damage", func(t *testing.T) {
		w := newMercWorld(sellswordRanks, alwaysCrit, 4)
		ApplySellswordPool(w.body)
		near := dummyOffAim(w.em, 40, 0)

		w.cast(components.AttackCut, 200, 100)

		assert.Equal(t, 1000-cutDamage(20, true), health(near))
	})
}

func TestSellsword_NoChargesNoBonus(t *testing.T) {
	w := newSellswordWorld(0)
	near := dummyOffAim(w.em, 40, 0)

	w.cast(components.AttackCut, 200, 100)

	assert.Equal(t, 1000-cutDamage(0, false), health(near))
	assert.InDelta(t, 0.25, cooldownsOf(w.body)[components.AttackCut], 1e-9)
}

// Only a Sellsword's charges are stacks: a Duelist's and an unspecialized
// merc's cut is as it was.
func TestSellsword_AnyOtherMercsCutIsUnraised(t *testing.T) {
	for _, ranks := range []passivetree.Ranks{{}, duelistRanks} {
		w := newMercWorld(ranks, neverCrit, 1)
		near := dummyOffAim(w.em, 40, 0)

		w.cast(components.AttackCut, 200, 100)

		assert.Equal(t, 1000-cutDamage(0, false), health(near), "ranks %v", ranks)
		assert.InDelta(t, 0.25, cooldownsOf(w.body)[components.AttackCut], 1e-9)
	}
}

// Parries climb to 5 and stop; one at 5 still negates the strike and counts
// (Edge States "Sellsword at 5 who parries").
func TestSellsword_ParriesClimbToFiveAndStop(t *testing.T) {
	w := newSellswordWorld(0)
	troll := striker(w.em, 140, 100, 200)

	for parry := 1; parry <= 6; parry++ {
		w.parryNow()
		strikeOn(troll, w.body)
		w.tick()

		assert.Equal(t, ownMaxHealth, health(w.body), "parry %d negated", parry)
		assert.Equal(t, min(parry, 5), pool(w.body), "parry %d", parry)
		assert.Equal(t, parry, parryOf(w.body).Parries, "parry %d counted", parry)
	}
}

// R36: a Sellsword's five charges are Settle the Debt's to spend, all five,
// at coefficient 5 × 1.0. The flurry is not a cut, so the stacks do not raise
// its damage; its cooldown, the cut's slot, is shortened by the five held as
// it resolves.
func TestSellsword_SettleTheDebtSpendsAllFive(t *testing.T) {
	w := newMercWorld(passivetree.Ranks{"mercenary.t3": 1, "mercenary.t6b": 1}, neverCrit, 0)
	ApplySellswordPool(w.body)
	w.body.AddComponent(components.NewTreeAbilityComponent(components.AttackSettleTheDebt, "mercenary.t3"))
	troll := striker(w.em, 140, 100, 5000)
	for range 5 {
		w.parryNow()
		strikeOn(troll, w.body)
		w.tick()
	}
	if !assert.Equal(t, 5, pool(w.body), "five parries banked") {
		return
	}
	target := dummyOffAim(w.em, 60, 90)

	w.cast(components.AttackSettleTheDebt, 400, 100)

	assert.Equal(t, 1000-mercFlurry(5), health(target), "at coefficient 5")
	assert.Equal(t, 0, pool(w.body), "every charge spent")
	assert.InDelta(t, 0.25/1.25, cooldownsOf(w.body)[components.AttackCut], 1e-9)
}

// mercFlurry is a rankedBody mercenary's unmitigated, non-crit Settle the Debt
// at n parry charges.
func mercFlurry(n int) int {
	return int(math.Round(RawDamage(12, 1.0*float64(n), 8)))
}
