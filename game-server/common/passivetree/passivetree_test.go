package passivetree_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
)

// FS-8RZ51 R4: L − 1 points below 20, and 20 at 20 (two arrive at level 20).
func TestEarned_ByLevel(t *testing.T) {
	tests := []struct {
		level int32
		want  int
	}{
		{1, 0},
		{2, 1},
		{10, 9},
		{19, 18},
		{20, 20},
		// outside 1..20 clamps, as progression does
		{0, 0},
		{25, 20},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.want, passivetree.Earned(tt.level), "Earned(%d)", tt.level)
	}
}

// shapeRow is one row of R2's table, the same for every class.
type shapeRow struct {
	slot    string
	tier    int
	kind    passivetree.Kind
	maxRank int
	gate    func(class string) passivetree.Gate
}

func spentAbove(n int) func(string) passivetree.Gate {
	return func(string) passivetree.Gate { return passivetree.Gate{SpentAbove: n} }
}

func open(string) passivetree.Gate { return passivetree.Gate{} }

func takeT3(class string) passivetree.Gate { return passivetree.Gate{Requires: class + ".t3"} }

// FS-8RZ51 R2: six tiers, 11 nodes, max ranks 2/2/3/3/1/2/2/3/3/1/1.
var r2 = []shapeRow{
	{"t1a", 1, passivetree.KindFiller, 2, open},
	{"t1b", 1, passivetree.KindFiller, 2, open},
	{"t2a", 2, passivetree.KindKicker, 3, spentAbove(4)},
	{"t2b", 2, passivetree.KindKicker, 3, spentAbove(4)},
	{"t3", 3, passivetree.KindAbility, 1, spentAbove(8)},
	{"t4a", 4, passivetree.KindFiller, 2, takeT3},
	{"t4b", 4, passivetree.KindFiller, 2, takeT3},
	{"t5a", 5, passivetree.KindKicker, 3, spentAbove(13)},
	{"t5b", 5, passivetree.KindKicker, 3, spentAbove(13)},
	{"t6a", 6, passivetree.KindSpecialization, 1, spentAbove(18)},
	{"t6b", 6, passivetree.KindSpecialization, 1, spentAbove(18)},
}

func pct(stat passivetree.Stat, n float64) *passivetree.Bonus {
	return &passivetree.Bonus{Stat: stat, Amount: n, Unit: passivetree.UnitPercent}
}

func flat(stat passivetree.Stat, n float64) *passivetree.Bonus {
	return &passivetree.Bonus{Stat: stat, Amount: n, Unit: passivetree.UnitFlat}
}

type valueRow struct {
	perRank *passivetree.Bonus
	kicker  passivetree.Kicker
}

// R28 (fillers) and R29 (kickers) per class, in R2's slot order. t3, t6a and
// t6b carry nothing here: their effects are FS-04EEA's and FS-E1ZDG's (R30, R31).
var r28r29 = map[string][]valueRow{
	"warrior": {
		{pct(passivetree.StatMaxHP, 4), ""},
		{flat(passivetree.StatMaxStamina, 10), ""},
		{pct(passivetree.StatSlashDamage, 6), passivetree.KickerMultiHitSlashRefund},
		{pct(passivetree.StatMaxHP, 4), passivetree.KickerLowHPDamageReduction},
		{nil, ""},
		{flat(passivetree.StatStrength, 2), ""},
		{pct(passivetree.StatStaminaRegen, 10), ""},
		{pct(passivetree.StatStaminaRegen, 10), passivetree.KickerKillStaminaRefund},
		{flat(passivetree.StatDashCost, -3), passivetree.KickerPostDashForcedCrit},
		{nil, ""},
		{nil, ""},
	},
	"mage": {
		{pct(passivetree.StatMaxHP, 4), ""},
		{flat(passivetree.StatMaxMana, 15), ""},
		{pct(passivetree.StatFireballDamage, 6), passivetree.KickerFireballCritRefund},
		{flat(passivetree.StatMaxMana, 15), passivetree.KickerDeepWellRegen},
		{nil, ""},
		{flat(passivetree.StatIntelligence, 2), ""},
		{pct(passivetree.StatManaRegen, 10), ""},
		{flat(passivetree.StatTripleFireballCost, -2), passivetree.KickerFiveFireballVolley},
		{pct(passivetree.StatFireballSpeed, 8), passivetree.KickerFireballExtraPierce},
		{nil, ""},
		{nil, ""},
	},
	"archer": {
		{pct(passivetree.StatMaxHP, 4), ""},
		{flat(passivetree.StatMaxStamina, 10), ""},
		{pct(passivetree.StatAttackSpeed, 4), passivetree.KickerEveryFourthArrowPierces},
		{pct(passivetree.StatMoveSpeed, 3), passivetree.KickerSidestep},
		{nil, ""},
		{flat(passivetree.StatAgility, 2), ""},
		{pct(passivetree.StatStaminaRegen, 10), ""},
		{flat(passivetree.StatCrit, 3), passivetree.KickerShadowShotForcedCrit},
		{pct(passivetree.StatStaminaRegen, 10), passivetree.KickerKillShadowShotRefund},
		{nil, ""},
		{nil, ""},
	},
	"mercenary": {
		{pct(passivetree.StatMaxHP, 4), ""},
		{flat(passivetree.StatStrength, 2), ""},
		{pct(passivetree.StatCutDamage, 6), passivetree.KickerWindUpCutForcedCrit},
		{&passivetree.Bonus{Stat: passivetree.StatParryWindow, Amount: 0.02, Unit: passivetree.UnitSeconds}, passivetree.KickerEarlyParryDoubleCharge},
		{nil, ""},
		{flat(passivetree.StatAgility, 2), ""},
		{pct(passivetree.StatMaxHP, 4), ""},
		{pct(passivetree.StatRiposteDamage, 8), passivetree.KickerRiposteHeal},
		{pct(passivetree.StatCutCooldown, -4), passivetree.KickerKillingCutParryCharge},
		{nil, ""},
		{nil, ""},
	},
}

// Every row of R2 and every per-rank value of R28 and R29, per class.
func TestNodes_EveryClassMatchesTheTable(t *testing.T) {
	for class, values := range r28r29 {
		t.Run(class, func(t *testing.T) {
			want := make([]passivetree.Node, 0, len(r2))
			for i, row := range r2 {
				want = append(want, passivetree.Node{
					ID:      class + "." + row.slot,
					Class:   class,
					Tier:    row.tier,
					Slot:    row.slot,
					Kind:    row.kind,
					MaxRank: row.maxRank,
					Gate:    row.gate(class),
					PerRank: values[i].perRank,
					Kicker:  values[i].kicker,
				})
			}
			assert.Equal(t, want, passivetree.Nodes(class))
		})
	}
}

func TestNodes_UnknownClassHasNone(t *testing.T) {
	assert.Empty(t, passivetree.Nodes("paladin"))
}

// R2: 22 ranks for 20 points, so a full character cannot take everything.
func TestNodes_TwentyTwoRanksForTwentyPoints(t *testing.T) {
	for class := range r28r29 {
		total := 0
		for _, n := range passivetree.Nodes(class) {
			total += n.MaxRank
		}
		// the two tier-6 nodes are one-of-two, so 22 is everything takeable
		assert.Equal(t, 22, total-1, class)
	}
}

// R31: the siblings read the ability and specialization nodes, never slots.
func TestAbilityAndSpecializationNodes(t *testing.T) {
	for class := range r28r29 {
		ability, ok := passivetree.AbilityNode(class)
		assert.True(t, ok, class)
		assert.Equal(t, class+".t3", ability.ID)

		specs, ok := passivetree.SpecializationNodes(class)
		assert.True(t, ok, class)
		assert.Equal(t, class+".t6a", specs[0].ID)
		assert.Equal(t, class+".t6b", specs[1].ID)
	}

	_, ok := passivetree.AbilityNode("paladin")
	assert.False(t, ok)
	_, ok = passivetree.SpecializationNodes("paladin")
	assert.False(t, ok)
}

func TestLookup(t *testing.T) {
	n, ok := passivetree.Lookup("mercenary.t6b")
	assert.True(t, ok)
	assert.Equal(t, passivetree.KindSpecialization, n.Kind)

	_, ok = passivetree.Lookup("mercenary.t7")
	assert.False(t, ok)
}

// The definition is shared by both services; no caller can change it.
func TestNodes_ACallerCannotChangeTheTree(t *testing.T) {
	n, _ := passivetree.Lookup("warrior.t1a")
	n.PerRank.Amount = 99
	nodes := passivetree.Nodes("warrior")
	nodes[0].PerRank.Amount = 99

	again, _ := passivetree.Lookup("warrior.t1a")
	assert.Equal(t, 4.0, again.PerRank.Amount)
}
