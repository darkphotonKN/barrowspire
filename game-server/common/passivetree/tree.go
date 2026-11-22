package passivetree

// Kind is what a node is for (FS-8RZ51 R2).
type Kind string

const (
	// KindFiller is a two-rank passive: its stat each rank.
	KindFiller Kind = "filler"
	// KindKicker is a three-rank passive: its stat each rank, plus its
	// kicker rule at rank 3 (R29).
	KindKicker Kind = "kicker"
	// KindAbility is the tier-3 node, granting the class tree ability
	// (FS-04EEA, R30).
	KindAbility Kind = "ability"
	// KindSpecialization is one of the two tier-6 nodes, granting a
	// specialization (FS-E1ZDG, R31). A character holds at most one.
	KindSpecialization Kind = "specialization"
)

// Stat is what a node's per-rank bonus raises (R28, R29).
type Stat string

const (
	StatMaxHP              Stat = "max_hp"
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

// Gate is what opens a node's tier (R2): ranks held in every smaller tier,
// or (tier 4) a node held. The zero Gate is open.
type Gate struct {
	SpentAbove int    `json:"spentAbove,omitempty"`
	Requires   string `json:"requires,omitempty"`
}

// Node is one node of a class tree. Its ID is permanent once shipped (R5);
// its name and copy are the client's.
type Node struct {
	ID      string `json:"id"`
	Class   string `json:"class"`
	Tier    int    `json:"tier"`
	Slot    string `json:"slot"`
	Kind    Kind   `json:"kind"`
	MaxRank int    `json:"maxRank"`
	Gate    Gate   `json:"gate"`
	// PerRank is nil for the ability and specialization nodes, whose
	// effects are their own features' (R30, R31).
	PerRank *Bonus `json:"perRank,omitempty"`
	// Kicker is empty for every node but a kicker.
	Kicker Kicker `json:"kicker,omitempty"`
}

// classes is the tree's classes, in the order the golden lists them.
var classes = []string{"warrior", "mage", "archer", "mercenary"}

// classValues is R28 and R29 per class: the per-rank bonus of each filler and
// kicker slot, and each kicker's rule.
type classValues struct {
	t1a, t1b, t4a, t4b Bonus
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
		t1a: pct(StatMaxHP, 4), t1b: flat(StatMaxStamina, 10),
		t2a: kicker{pct(StatSlashDamage, 6), KickerMultiHitSlashRefund},
		t2b: kicker{pct(StatMaxHP, 4), KickerLowHPDamageReduction},
		t4a: flat(StatStrength, 2), t4b: pct(StatStaminaRegen, 10),
		t5a: kicker{pct(StatStaminaRegen, 10), KickerKillStaminaRefund},
		t5b: kicker{flat(StatDashCost, -3), KickerPostDashForcedCrit},
	},
	"mage": {
		t1a: pct(StatMaxHP, 4), t1b: flat(StatMaxMana, 15),
		t2a: kicker{pct(StatFireballDamage, 6), KickerFireballCritRefund},
		t2b: kicker{flat(StatMaxMana, 15), KickerDeepWellRegen},
		t4a: flat(StatIntelligence, 2), t4b: pct(StatManaRegen, 10),
		t5a: kicker{flat(StatTripleFireballCost, -2), KickerFiveFireballVolley},
		t5b: kicker{pct(StatFireballSpeed, 8), KickerFireballExtraPierce},
	},
	"archer": {
		t1a: pct(StatMaxHP, 4), t1b: flat(StatMaxStamina, 10),
		t2a: kicker{pct(StatAttackSpeed, 4), KickerEveryFourthArrowPierces},
		t2b: kicker{pct(StatMoveSpeed, 3), KickerSidestep},
		t4a: flat(StatAgility, 2), t4b: pct(StatStaminaRegen, 10),
		t5a: kicker{flat(StatCrit, 3), KickerShadowShotForcedCrit},
		t5b: kicker{pct(StatStaminaRegen, 10), KickerKillShadowShotRefund},
	},
	// The mercenary's parry charges have no max and no regen, so its t1b and
	// t4b raise Strength and max HP instead (R28).
	"mercenary": {
		t1a: pct(StatMaxHP, 4), t1b: flat(StatStrength, 2),
		t2a: kicker{pct(StatCutDamage, 6), KickerWindUpCutForcedCrit},
		t2b: kicker{Bonus{Stat: StatParryWindow, Amount: 0.02, Unit: UnitSeconds}, KickerEarlyParryDoubleCharge},
		t4a: flat(StatAgility, 2), t4b: pct(StatMaxHP, 4),
		t5a: kicker{pct(StatRiposteDamage, 8), KickerRiposteHeal},
		t5b: kicker{pct(StatCutCooldown, -4), KickerKillingCutParryCharge},
	},
}

// The tier gates of R2: ranks held in every smaller tier.
const (
	tier2Gate = 4
	tier3Gate = 8
	tier5Gate = 13
	tier6Gate = 18
)

// buildTree lays one class's values out in R2's shape, in slot order.
func buildTree(class string, v classValues) []Node {
	id := func(slot string) string { return class + "." + slot }
	filler := func(tier int, slot string, gate Gate, b Bonus) Node {
		return Node{ID: id(slot), Class: class, Tier: tier, Slot: slot, Kind: KindFiller, MaxRank: 2, Gate: gate, PerRank: &b}
	}
	kick := func(tier int, slot string, gate Gate, k kicker) Node {
		b := k.perRank
		return Node{ID: id(slot), Class: class, Tier: tier, Slot: slot, Kind: KindKicker, MaxRank: 3, Gate: gate, PerRank: &b, Kicker: k.rule}
	}
	single := func(tier int, slot string, kind Kind, gate Gate) Node {
		return Node{ID: id(slot), Class: class, Tier: tier, Slot: slot, Kind: kind, MaxRank: 1, Gate: gate}
	}
	afterAbility := Gate{Requires: id("t3")}
	return []Node{
		filler(1, "t1a", Gate{}, v.t1a),
		filler(1, "t1b", Gate{}, v.t1b),
		kick(2, "t2a", Gate{SpentAbove: tier2Gate}, v.t2a),
		kick(2, "t2b", Gate{SpentAbove: tier2Gate}, v.t2b),
		single(3, "t3", KindAbility, Gate{SpentAbove: tier3Gate}),
		filler(4, "t4a", afterAbility, v.t4a),
		filler(4, "t4b", afterAbility, v.t4b),
		kick(5, "t5a", Gate{SpentAbove: tier5Gate}, v.t5a),
		kick(5, "t5b", Gate{SpentAbove: tier5Gate}, v.t5b),
		single(6, "t6a", KindSpecialization, Gate{SpentAbove: tier6Gate}),
		single(6, "t6b", KindSpecialization, Gate{SpentAbove: tier6Gate}),
	}
}

var (
	trees = map[string][]Node{}
	byID  = map[string]Node{}
)

func init() {
	for _, class := range classes {
		tree := buildTree(class, values[class])
		trees[class] = tree
		for _, n := range tree {
			byID[n.ID] = n
		}
	}
}

// Nodes is class's tree in slot order (t1a … t6b), or none for an unknown
// class. The nodes are the caller's: changing one never changes the tree.
func Nodes(class string) []Node {
	tree := trees[class]
	out := make([]Node, 0, len(tree))
	for _, n := range tree {
		out = append(out, n.clone())
	}
	return out
}

// Lookup is the node with id, of any class.
func Lookup(id string) (Node, bool) {
	n, ok := byID[id]
	return n.clone(), ok
}

func (n Node) clone() Node {
	if n.PerRank != nil {
		b := *n.PerRank
		n.PerRank = &b
	}
	return n
}

// AbilityNode is class's tier-3 node, the one granting its tree ability
// (FS-04EEA). False for an unknown class.
func AbilityNode(class string) (Node, bool) {
	return Lookup(class + ".t3")
}

// SpecializationNodes is class's two tier-6 nodes, t6a then t6b: the first
// and second rows of FS-E1ZDG's table for the class. False for an unknown
// class.
func SpecializationNodes(class string) ([2]Node, bool) {
	a, okA := Lookup(class + ".t6a")
	b, okB := Lookup(class + ".t6b")
	return [2]Node{a, b}, okA && okB
}
