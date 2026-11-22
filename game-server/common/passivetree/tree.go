package passivetree

import "slices"

// Kind is what a node is for (FS-8RZ51 §Change: Tree v2 V1, V13).
type Kind string

const (
	// KindTraversal is a one-rank node that carries a character across the
	// tree, the same four in every class (V13).
	KindTraversal Kind = "traversal"
	// KindKicker is a three-rank passive: its stat each rank, plus its
	// kicker rule at rank 3 (R29).
	KindKicker Kind = "kicker"
	// KindAbility is the node granting the class tree ability (FS-04EEA,
	// R30).
	KindAbility Kind = "ability"
	// KindSpecialization is one of the nodes granting a specialization
	// (FS-E1ZDG, R31). They are the sides of the spec group, so a character
	// holds at most one.
	KindSpecialization Kind = "specialization"
)

// Stat is what a node's per-rank bonus raises (R29, V14).
type Stat string

const (
	StatMaxHP Stat = "max_hp"
	// StatPrimaryAttribute raises each of the class's primary attributes
	// by the full amount (V14, PrimaryAttributes).
	StatPrimaryAttribute   Stat = "primary_attribute"
	StatMaxStamina         Stat = "max_stamina"
	StatMaxMana            Stat = "max_mana"
	StatStrength           Stat = "strength"
	StatIntelligence       Stat = "intelligence"
	StatAgility            Stat = "agility"
	StatStaminaRegen       Stat = "stamina_regen"
	StatManaRegen          Stat = "mana_regen"
	StatSlashDamage        Stat = "slash_damage"
	StatFireballDamage     Stat = "fireball_damage"
	StatCutDamage          Stat = "cut_damage"
	StatRiposteDamage      Stat = "riposte_damage"
	StatDashCost           Stat = "dash_cost"
	StatTripleFireballCost Stat = "triple_fireball_cost"
	StatFireballSpeed      Stat = "fireball_speed"
	StatAttackSpeed        Stat = "attack_speed"
	StatMoveSpeed          Stat = "move_speed"
	StatCrit               Stat = "crit"
	StatParryWindow        Stat = "parry_window"
	StatCutCooldown        Stat = "cut_cooldown"
)

// Unit says how a Bonus's Amount reads.
type Unit string

const (
	// UnitPercent is a percent of the stat's base: max HP of the character's
	// own max HP (R26), regen of the class's base regen, a damage of the
	// attack's coefficient.
	UnitPercent Unit = "percent"
	// UnitFlat adds Amount in the stat's own unit (points, mana, stamina).
	UnitFlat Unit = "flat"
	// UnitSeconds adds Amount seconds.
	UnitSeconds Unit = "seconds"
)

// Bonus is what one rank of a node gives. Every rank gives the same; a
// negative Amount lowers the stat (a cost or a cooldown).
type Bonus struct {
	Stat   Stat    `json:"stat"`
	Amount float64 `json:"amount"`
	Unit   Unit    `json:"unit"`
}

// Kicker is a kicker node's rank-3 rule (R29), an id the game systems switch
// on. Its numbers and words live with the system that runs it.
type Kicker string

const (
	KickerMultiHitSlashRefund     Kicker = "multi_hit_slash_refund"
	KickerLowHPDamageReduction    Kicker = "low_hp_damage_reduction"
	KickerKillStaminaRefund       Kicker = "kill_stamina_refund"
	KickerPostDashForcedCrit      Kicker = "post_dash_forced_crit"
	KickerFireballCritRefund      Kicker = "fireball_crit_refund"
	KickerDeepWellRegen           Kicker = "deep_well_regen"
	KickerFiveFireballVolley      Kicker = "five_fireball_volley"
	KickerFireballExtraPierce     Kicker = "fireball_extra_pierce"
	KickerEveryFourthArrowPierces Kicker = "every_fourth_arrow_pierces"
	KickerSidestep                Kicker = "sidestep"
	KickerShadowShotForcedCrit    Kicker = "shadow_shot_forced_crit"
	KickerKillShadowShotRefund    Kicker = "kill_shadow_shot_refund"
	KickerWindUpCutForcedCrit     Kicker = "wind_up_cut_forced_crit"
	KickerEarlyParryDoubleCharge  Kicker = "early_parry_double_charge"
	KickerRiposteHeal             Kicker = "riposte_heal"
	KickerKillingCutParryCharge   Kicker = "killing_cut_parry_charge"
)

// The exclusive groups every class's tree has (V6). A group is data: any
// node may name any group, with any number of sides.
const (
	GroupUpper = "upper"
	GroupLower = "lower"
	// GroupSpec is the specialization pair: its sides are t6a and t6b.
	GroupSpec = "spec"
)

// Exclusive is the side of an exclusive group a node sits on (V6): taking any
// node of one side locks every other side of the group for good.
type Exclusive struct {
	Group string `json:"group"`
	Side  string `json:"side"`
}

// Node is one node of a class tree. Its ID is permanent once shipped (R5);
// its name and copy are the client's.
type Node struct {
	ID      string `json:"id"`
	Class   string `json:"class"`
	Slot    string `json:"slot"`
	Kind    Kind   `json:"kind"`
	MaxRank int    `json:"maxRank"`
	// Requires is the node's links (V1): node ids, any one of them held at
	// rank ≥ 1 makes it reachable. Empty for the root.
	Requires []string `json:"requires"`
	// MinLevel is the level the node waits for, 0 when none.
	MinLevel int32 `json:"minLevel"`
	// Exclusive is nil for a node on no side.
	Exclusive *Exclusive `json:"exclusive,omitempty"`
	// PerRank is nil for the ability and specialization nodes, whose
	// effects are their own features' (R30, R31).
	PerRank *Bonus `json:"perRank,omitempty"`
	// Kicker is empty for every node but a kicker.
	Kicker Kicker `json:"kicker,omitempty"`
}

// Attribute is a character attribute a Might node raises (V14).
type Attribute string

const (
	AttributeStrength     Attribute = "strength"
	AttributeIntelligence Attribute = "intelligence"
	AttributeAgility      Attribute = "agility"
)

// primaryAttributes is V14's table: each one named gets Might's full amount.
// The mercenary's cut scales on the average of both.
var primaryAttributes = map[string][]Attribute{
	"warrior":   {AttributeStrength},
	"mage":      {AttributeIntelligence},
	"archer":    {AttributeAgility},
	"mercenary": {AttributeStrength, AttributeAgility},
}

// PrimaryAttributes is class's primary attributes (V14), none for an unknown
// class. The slice is the caller's.
func PrimaryAttributes(class string) []Attribute {
	return slices.Clone(primaryAttributes[class])
}

// classes is the tree's classes, in the order the golden lists them.
var classes = []string{"warrior", "mage", "archer", "mercenary"}

// classValues is R29 per class: the per-rank bonus of each kicker slot, and
// each kicker's rule.
type classValues struct {
	t2a, t2b, t5a, t5b kicker
}

type kicker struct {
	perRank Bonus
	rule    Kicker
}

func pct(stat Stat, n float64) Bonus  { return Bonus{Stat: stat, Amount: n, Unit: UnitPercent} }
func flat(stat Stat, n float64) Bonus { return Bonus{Stat: stat, Amount: n, Unit: UnitFlat} }

var values = map[string]classValues{
	"warrior": {
		t2a: kicker{pct(StatSlashDamage, 6), KickerMultiHitSlashRefund},
		t2b: kicker{pct(StatMaxHP, 4), KickerLowHPDamageReduction},
		t5a: kicker{pct(StatStaminaRegen, 10), KickerKillStaminaRefund},
		t5b: kicker{flat(StatDashCost, -3), KickerPostDashForcedCrit},
	},
	"mage": {
		t2a: kicker{pct(StatFireballDamage, 6), KickerFireballCritRefund},
		t2b: kicker{flat(StatMaxMana, 15), KickerDeepWellRegen},
		t5a: kicker{flat(StatTripleFireballCost, -2), KickerFiveFireballVolley},
		t5b: kicker{pct(StatFireballSpeed, 8), KickerFireballExtraPierce},
	},
	"archer": {
		t2a: kicker{pct(StatAttackSpeed, 4), KickerEveryFourthArrowPierces},
		t2b: kicker{pct(StatMoveSpeed, 3), KickerSidestep},
		t5a: kicker{flat(StatCrit, 3), KickerShadowShotForcedCrit},
		t5b: kicker{pct(StatStaminaRegen, 10), KickerKillShadowShotRefund},
	},
	"mercenary": {
		t2a: kicker{pct(StatCutDamage, 6), KickerWindUpCutForcedCrit},
		t2b: kicker{Bonus{Stat: StatParryWindow, Amount: 0.02, Unit: UnitSeconds}, KickerEarlyParryDoubleCharge},
		t5a: kicker{pct(StatRiposteDamage, 8), KickerRiposteHeal},
		t5b: kicker{pct(StatCutCooldown, -4), KickerKillingCutParryCharge},
	},
}

// The traversal nodes' per-rank values, the same in every class (V14; all
// placeholders, tuned under Tunes FS-8RZ51).
var (
	vitality  = flat(StatMaxHP, 5)
	might     = flat(StatPrimaryAttribute, 2)
	haste     = pct(StatAttackSpeed, 2)
	fleetness = pct(StatMoveSpeed, 2)
)

// The level gates (V2): the ability waits for 10, the specializations for 20.
const (
	abilityLevel        = 10
	specializationLevel = 20
)

// buildTree lays one class's values out in V2's shape, in V1's order: trunk,
// upper side a, upper side b, middle, lower side a, lower side b, end, the
// specializations.
func buildTree(class string, v classValues) []Node {
	id := func(slot string) string { return class + "." + slot }
	node := func(slot string, kind Kind, maxRank int, side *Exclusive, from []string) Node {
		n := Node{ID: id(slot), Class: class, Slot: slot, Kind: kind, MaxRank: maxRank, Requires: []string{}, Exclusive: side}
		for _, s := range from {
			n.Requires = append(n.Requires, id(s))
		}
		return n
	}
	step := func(slot string, b Bonus, side *Exclusive, from ...string) Node {
		n := node(slot, KindTraversal, 1, side, from)
		n.PerRank = &b
		return n
	}
	kick := func(slot string, k kicker, side *Exclusive, from string) Node {
		n := node(slot, KindKicker, 3, side, []string{from})
		b := k.perRank
		n.PerRank, n.Kicker = &b, k.rule
		return n
	}
	gated := func(slot string, kind Kind, level int32, side *Exclusive, from string) Node {
		n := node(slot, kind, 1, side, []string{from})
		n.MinLevel = level
		return n
	}
	on := func(group, side string) *Exclusive { return &Exclusive{Group: group, Side: side} }
	ua, ub := on(GroupUpper, "a"), on(GroupUpper, "b")
	la, lb := on(GroupLower, "a"), on(GroupLower, "b")

	return []Node{
		step("r1", vitality, nil),
		step("r2", might, nil, "r1"),

		step("ua1", haste, ua, "r2"),
		kick("t2a", v.t2a, ua, "ua1"),
		step("ua2", vitality, ua, "t2a"),
		step("ua3", might, ua, "ua2"),
		step("ua4", haste, ua, "ua3"),

		step("ub1", fleetness, ub, "r2"),
		kick("t2b", v.t2b, ub, "ub1"),
		step("ub2", vitality, ub, "t2b"),
		step("ub3", might, ub, "ub2"),
		step("ub4", fleetness, ub, "ub3"),

		step("m1", vitality, nil, "ua1", "ub1"),
		step("m2", might, nil, "m1"),
		gated("t3", KindAbility, abilityLevel, nil, "m2"),
		step("m3", vitality, nil, "t3"),

		step("la1", haste, la, "m3"),
		kick("t5a", v.t5a, la, "la1"),
		step("la2", vitality, la, "t5a"),
		step("la3", might, la, "la2"),
		step("la4", haste, la, "la3"),
		step("la5", vitality, la, "la4"),

		step("lb1", fleetness, lb, "m3"),
		kick("t5b", v.t5b, lb, "lb1"),
		step("lb2", vitality, lb, "t5b"),
		step("lb3", might, lb, "lb2"),
		step("lb4", fleetness, lb, "lb3"),
		step("lb5", vitality, lb, "lb4"),

		step("m4", vitality, nil, "la1", "lb1"),

		gated("t6a", KindSpecialization, specializationLevel, on(GroupSpec, "a"), "m4"),
		gated("t6b", KindSpecialization, specializationLevel, on(GroupSpec, "b"), "m4"),
	}
}

// tree is one graph of nodes and the rule over it. The rule reads only a
// node's requires, minLevel and exclusive (V11), so any tree built of nodes
// is ruled on by the same code.
type tree struct {
	nodes []Node
	byID  map[string]Node
}

func newTree(nodes []Node) *tree {
	t := &tree{nodes: nodes, byID: make(map[string]Node, len(nodes))}
	for _, n := range nodes {
		t.byID[n.ID] = n
	}
	return t
}

var (
	// trees is each class's tree.
	trees = map[string]*tree{}
	// definition is every class's nodes as one tree: what Lookup and
	// Unspent know.
	definition *tree
)

func init() {
	var every []Node
	for _, class := range classes {
		nodes := buildTree(class, values[class])
		trees[class] = newTree(nodes)
		every = append(every, nodes...)
	}
	definition = newTree(every)
}

// Nodes is class's tree in definition order (V1), or none for an unknown
// class. The nodes are the caller's: changing one never changes the tree.
func Nodes(class string) []Node {
	t, ok := trees[class]
	if !ok {
		return []Node{}
	}
	out := make([]Node, 0, len(t.nodes))
	for _, n := range t.nodes {
		out = append(out, n.clone())
	}
	return out
}

// Lookup is the node with id, of any class.
func Lookup(id string) (Node, bool) {
	n, ok := definition.byID[id]
	return n.clone(), ok
}

func (n Node) clone() Node {
	if n.PerRank != nil {
		b := *n.PerRank
		n.PerRank = &b
	}
	if n.Exclusive != nil {
		e := *n.Exclusive
		n.Exclusive = &e
	}
	n.Requires = slices.Clone(n.Requires)
	return n
}

// AbilityNode is class's ability node, t3, the one granting its tree ability
// (FS-04EEA). False for an unknown class.
func AbilityNode(class string) (Node, bool) {
	return Lookup(class + ".t3")
}

// SpecializationNodes is class's two specialization nodes, t6a then t6b: the
// first and second rows of FS-E1ZDG's table for the class. False for an
// unknown class.
func SpecializationNodes(class string) ([2]Node, bool) {
	a, okA := Lookup(class + ".t6a")
	b, okB := Lookup(class + ".t6b")
	return [2]Node{a, b}, okA && okB
}

// SideTaken is the side of group a character of class holding held has
// taken (V6, V9): the side of the first of group's nodes, in definition
// order, held at rank ≥ 1. False while no side of it is taken, and for an
// unknown class or group.
func SideTaken(class string, held Ranks, group string) (string, bool) {
	t, ok := trees[class]
	if !ok {
		return "", false
	}
	return t.sideTaken(held, group)
}

func (t *tree) sideTaken(held Ranks, group string) (string, bool) {
	for _, n := range t.nodes {
		if n.Exclusive != nil && n.Exclusive.Group == group && held[n.ID] > 0 {
			return n.Exclusive.Side, true
		}
	}
	return "", false
}
