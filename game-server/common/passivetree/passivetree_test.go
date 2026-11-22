package passivetree_test

import (
	"strings"
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

// shapeRow is one row of V2's table, the same for every class. perRank names
// a traversal node's bonus; a kicker's is the class's (kickers below).
type shapeRow struct {
	slot     string
	kind     passivetree.Kind
	maxRank  int
	requires []string
	minLevel int32
	side     string // "group:side", or "" for none
	perRank  *passivetree.Bonus
}

var (
	vitality  = flat(passivetree.StatMaxHP, 5)
	might     = flat(passivetree.StatPrimaryAttribute, 2)
	haste     = pct(passivetree.StatAttackSpeed, 2)
	fleetness = pct(passivetree.StatMoveSpeed, 2)
)

// FS-8RZ51 §Change: Tree v2 V2, in V1's order: trunk, upper a, upper b,
// middle, lower a, lower b, end, the specializations.
var v2 = []shapeRow{
	{"r1", passivetree.KindTraversal, 1, nil, 0, "", vitality},
	{"r2", passivetree.KindTraversal, 1, []string{"r1"}, 0, "", might},

	{"ua1", passivetree.KindTraversal, 1, []string{"r2"}, 0, "upper:a", haste},
	{"t2a", passivetree.KindKicker, 3, []string{"ua1"}, 0, "upper:a", nil},
	{"ua2", passivetree.KindTraversal, 1, []string{"t2a"}, 0, "upper:a", vitality},
	{"ua3", passivetree.KindTraversal, 1, []string{"ua2"}, 0, "upper:a", might},
	{"ua4", passivetree.KindTraversal, 1, []string{"ua3"}, 0, "upper:a", haste},

	{"ub1", passivetree.KindTraversal, 1, []string{"r2"}, 0, "upper:b", fleetness},
	{"t2b", passivetree.KindKicker, 3, []string{"ub1"}, 0, "upper:b", nil},
	{"ub2", passivetree.KindTraversal, 1, []string{"t2b"}, 0, "upper:b", vitality},
	{"ub3", passivetree.KindTraversal, 1, []string{"ub2"}, 0, "upper:b", might},
	{"ub4", passivetree.KindTraversal, 1, []string{"ub3"}, 0, "upper:b", fleetness},

	{"m1", passivetree.KindTraversal, 1, []string{"ua1", "ub1"}, 0, "", vitality},
	{"m2", passivetree.KindTraversal, 1, []string{"m1"}, 0, "", might},
	{"t3", passivetree.KindAbility, 1, []string{"m2"}, 10, "", nil},
	{"m3", passivetree.KindTraversal, 1, []string{"t3"}, 0, "", vitality},

	{"la1", passivetree.KindTraversal, 1, []string{"m3"}, 0, "lower:a", haste},
	{"t5a", passivetree.KindKicker, 3, []string{"la1"}, 0, "lower:a", nil},
	{"la2", passivetree.KindTraversal, 1, []string{"t5a"}, 0, "lower:a", vitality},
	{"la3", passivetree.KindTraversal, 1, []string{"la2"}, 0, "lower:a", might},
	{"la4", passivetree.KindTraversal, 1, []string{"la3"}, 0, "lower:a", haste},
	{"la5", passivetree.KindTraversal, 1, []string{"la4"}, 0, "lower:a", vitality},

	{"lb1", passivetree.KindTraversal, 1, []string{"m3"}, 0, "lower:b", fleetness},
	{"t5b", passivetree.KindKicker, 3, []string{"lb1"}, 0, "lower:b", nil},
	{"lb2", passivetree.KindTraversal, 1, []string{"t5b"}, 0, "lower:b", vitality},
	{"lb3", passivetree.KindTraversal, 1, []string{"lb2"}, 0, "lower:b", might},
	{"lb4", passivetree.KindTraversal, 1, []string{"lb3"}, 0, "lower:b", fleetness},
	{"lb5", passivetree.KindTraversal, 1, []string{"lb4"}, 0, "lower:b", vitality},

	{"m4", passivetree.KindTraversal, 1, []string{"la1", "lb1"}, 0, "", vitality},

	{"t6a", passivetree.KindSpecialization, 1, []string{"m4"}, 20, "spec:a", nil},
	{"t6b", passivetree.KindSpecialization, 1, []string{"m4"}, 20, "spec:b", nil},
}

func pct(stat passivetree.Stat, n float64) *passivetree.Bonus {
	return &passivetree.Bonus{Stat: stat, Amount: n, Unit: passivetree.UnitPercent}
}

func flat(stat passivetree.Stat, n float64) *passivetree.Bonus {
	return &passivetree.Bonus{Stat: stat, Amount: n, Unit: passivetree.UnitFlat}
}

type kickerRow struct {
	perRank *passivetree.Bonus
	kicker  passivetree.Kicker
}

// R29 per class, by kicker slot. Unchanged by tree v2 (V3).
var r29 = map[string]map[string]kickerRow{
	"warrior": {
		"t2a": {pct(passivetree.StatSlashDamage, 6), passivetree.KickerMultiHitSlashRefund},
		"t2b": {pct(passivetree.StatMaxHP, 4), passivetree.KickerLowHPDamageReduction},
		"t5a": {pct(passivetree.StatStaminaRegen, 10), passivetree.KickerKillStaminaRefund},
		"t5b": {flat(passivetree.StatDashCost, -3), passivetree.KickerPostDashForcedCrit},
	},
	"mage": {
		"t2a": {pct(passivetree.StatFireballDamage, 6), passivetree.KickerFireballCritRefund},
		"t2b": {flat(passivetree.StatMaxMana, 15), passivetree.KickerDeepWellRegen},
		"t5a": {flat(passivetree.StatTripleFireballCost, -2), passivetree.KickerFiveFireballVolley},
		"t5b": {pct(passivetree.StatFireballSpeed, 8), passivetree.KickerFireballExtraPierce},
	},
	"archer": {
		"t2a": {pct(passivetree.StatAttackSpeed, 4), passivetree.KickerEveryFourthArrowPierces},
		"t2b": {pct(passivetree.StatMoveSpeed, 3), passivetree.KickerSidestep},
		"t5a": {flat(passivetree.StatCrit, 3), passivetree.KickerShadowShotForcedCrit},
		"t5b": {pct(passivetree.StatStaminaRegen, 10), passivetree.KickerKillShadowShotRefund},
	},
	"mercenary": {
		"t2a": {pct(passivetree.StatCutDamage, 6), passivetree.KickerWindUpCutForcedCrit},
		"t2b": {&passivetree.Bonus{Stat: passivetree.StatParryWindow, Amount: 0.02, Unit: passivetree.UnitSeconds}, passivetree.KickerEarlyParryDoubleCharge},
		"t5a": {pct(passivetree.StatRiposteDamage, 8), passivetree.KickerRiposteHeal},
		"t5b": {pct(passivetree.StatCutCooldown, -4), passivetree.KickerKillingCutParryCharge},
	},
}

// Acceptance "Every class's tree matches V2's table": each node's kind, max
// rank, requires, min level, side and per-rank value, in V1's order.
func TestNodes_EveryClassMatchesTheTable(t *testing.T) {
	for class, kickers := range r29 {
		t.Run(class, func(t *testing.T) {
			want := make([]passivetree.Node, 0, len(v2))
			for _, row := range v2 {
				n := passivetree.Node{
					ID:       class + "." + row.slot,
					Class:    class,
					Slot:     row.slot,
					Kind:     row.kind,
					MaxRank:  row.maxRank,
					Requires: []string{},
					MinLevel: row.minLevel,
					PerRank:  row.perRank,
				}
				for _, slot := range row.requires {
					n.Requires = append(n.Requires, class+"."+slot)
				}
				if group, side, ok := strings.Cut(row.side, ":"); ok {
					n.Exclusive = &passivetree.Exclusive{Group: group, Side: side}
				}
				if k, ok := kickers[row.slot]; ok {
					n.PerRank, n.Kicker = k.perRank, k.kicker
				}
				want = append(want, n)
			}
			assert.Equal(t, want, passivetree.Nodes(class))
		})
	}
}

// V3: the fillers are retired, their ids never defined again, and kind
// filler is gone with them.
func TestNodes_TheFillersAreRetired(t *testing.T) {
	for class := range r29 {
		for _, slot := range []string{"t1a", "t1b", "t4a", "t4b"} {
			_, ok := passivetree.Lookup(class + "." + slot)
			assert.False(t, ok, "%s.%s", class, slot)
		}
		for _, n := range passivetree.Nodes(class) {
			assert.NotEqual(t, passivetree.Kind("filler"), n.Kind, n.ID)
		}
	}
}

// V14: each class's primary attributes; the mercenary's cut scales on both.
func TestPrimaryAttributes(t *testing.T) {
	assert.Equal(t, []passivetree.Attribute{passivetree.AttributeStrength}, passivetree.PrimaryAttributes("warrior"))
	assert.Equal(t, []passivetree.Attribute{passivetree.AttributeIntelligence}, passivetree.PrimaryAttributes("mage"))
	assert.Equal(t, []passivetree.Attribute{passivetree.AttributeAgility}, passivetree.PrimaryAttributes("archer"))
	assert.Equal(t, []passivetree.Attribute{passivetree.AttributeStrength, passivetree.AttributeAgility}, passivetree.PrimaryAttributes("mercenary"))
	assert.Empty(t, passivetree.PrimaryAttributes("paladin"))

	mine := passivetree.PrimaryAttributes("mercenary")
	mine[0] = passivetree.AttributeIntelligence
	assert.Equal(t, passivetree.AttributeStrength, passivetree.PrimaryAttributes("mercenary")[0], "the slice is the caller's")
}

func TestNodes_UnknownClassHasNone(t *testing.T) {
	assert.Empty(t, passivetree.Nodes("paladin"))
}

// R31: the siblings read the ability and specialization nodes, never slots.
func TestAbilityAndSpecializationNodes(t *testing.T) {
	for class := range r29 {
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

// V9: which side of a group is taken, read from the ranks.
func TestSideTaken(t *testing.T) {
	held := passivetree.Ranks{"warrior.r1": 1, "warrior.r2": 1, "warrior.ub1": 1}
	side, ok := passivetree.SideTaken("warrior", held, passivetree.GroupUpper)
	assert.True(t, ok)
	assert.Equal(t, "b", side)

	_, ok = passivetree.SideTaken("warrior", held, passivetree.GroupLower)
	assert.False(t, ok, "no lower side taken")
	_, ok = passivetree.SideTaken("warrior", passivetree.Ranks{"warrior.t6a": 0}, passivetree.GroupSpec)
	assert.False(t, ok, "rank 0 is not held")
	_, ok = passivetree.SideTaken("warrior", passivetree.Ranks{"mage.t6a": 1}, passivetree.GroupSpec)
	assert.False(t, ok, "another class's node")
	_, ok = passivetree.SideTaken("paladin", held, passivetree.GroupUpper)
	assert.False(t, ok, "an unknown class")

	side, ok = passivetree.SideTaken("mage", passivetree.Ranks{"mage.t6a": 1}, passivetree.GroupSpec)
	assert.True(t, ok)
	assert.Equal(t, "a", side)
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
	n, _ := passivetree.Lookup("warrior.m1")
	n.PerRank.Amount = 99
	n.Requires[0] = "warrior.t6a"
	nodes := passivetree.Nodes("warrior")
	nodes[0].PerRank.Amount = 99
	nodes[2].Exclusive.Side = "b"

	again, _ := passivetree.Lookup("warrior.m1")
	assert.Equal(t, 5.0, again.PerRank.Amount)
	assert.Equal(t, []string{"warrior.ua1", "warrior.ub1"}, again.Requires)
	root, _ := passivetree.Lookup("warrior.r1")
	assert.Equal(t, 5.0, root.PerRank.Amount)
	side, _ := passivetree.Lookup("warrior.ua1")
	assert.Equal(t, "a", side.Exclusive.Side)
}
