package passivetree

import "github.com/darkphotonKN/barrowspire-server/common/errcode"

// Ranks is a character's held ranks by node id. A node not held is absent or 0.
type Ranks map[string]int

// Unspent is the points a character of level holding held has left to spend:
// earned(level) − Σ ranks held, never below 0 (FS-8RZ51 R7). It is derived,
// never stored.
func Unspent(level int32, held Ranks) int {
	left := Earned(level)
	for _, rank := range held {
		if rank > 0 {
			left -= rank
		}
	}
	return max(left, 0)
}

// Higher is a and b merged by the higher rank of each node (R20): ranks only
// rise, so two answers merged in either order give the same ranks. A new map,
// never nil; neither side is written, and a node at 0 is left out.
func Higher(a, b Ranks) Ranks {
	merged := make(Ranks, max(len(a), len(b)))
	for _, side := range []Ranks{a, b} {
		for node, rank := range side {
			if rank > merged[node] {
				merged[node] = rank
			}
		}
	}
	return merged
}

// Verdict is a spend the rule lets through.
type Verdict int

const (
	// Allowed: take the target rank, spending one point.
	Allowed Verdict = iota + 1
	// AlreadyHeld: the target rank is already held, so the spend changes
	// nothing and is a success (R10). A retried spend lands here.
	AlreadyHeld
)

// Refusal is the spend rule saying no. Code is the errcode the services
// answer with (errcode.Refuse(r.Code)).
type Refusal struct {
	Code errcode.Code
	rule string
}

func (r *Refusal) Error() string { return "passive spend refused: " + r.rule }

// The spend rule's refusals (R9), one per rule. Match them with errors.Is.
var (
	ErrUnknownNode         = &Refusal{Code: errcode.PassiveUnknownNode, rule: "not one of the class's nodes"}
	ErrRankOutOfOrder      = &Refusal{Code: errcode.PassiveRankOutOfOrder, rule: "not the next rank"}
	ErrMaxRank             = &Refusal{Code: errcode.PassiveMaxRank, rule: "already at its highest rank"}
	ErrTierLocked          = &Refusal{Code: errcode.PassiveTierLocked, rule: "tier locked"}
	ErrNoPoints            = &Refusal{Code: errcode.PassiveNoPoints, rule: "no points to spend"}
	ErrSpecializationTaken = &Refusal{Code: errcode.PassiveSpecializationTaken, rule: "the other specialization is held"}
)

// CheckSpend is the spend rule (R9): may a character of class and level,
// holding held, take nodeID to target rank? It answers Allowed or AlreadyHeld
// (a target at or below the rank held, R10), or the first rule that refused
// it, in R9's order. A target below 1 is the caller's validation; here it
// reads as already held.
func CheckSpend(class string, level int32, held Ranks, nodeID string, target int) (Verdict, error) {
	node, ok := Lookup(nodeID)
	if !ok || node.Class != class {
		return 0, ErrUnknownNode
	}
	have := held[nodeID]
	if target <= have {
		return AlreadyHeld, nil
	}
	if target != have+1 {
		return 0, ErrRankOutOfOrder
	}
	if target > node.MaxRank {
		return 0, ErrMaxRank
	}
	if !gateMet(node, held) {
		return 0, ErrTierLocked
	}
	if Unspent(level, held) < 1 {
		return 0, ErrNoPoints
	}
	if node.Kind == KindSpecialization && otherSpecializationHeld(node, held) {
		return 0, ErrSpecializationTaken
	}
	return Allowed, nil
}

// gateMet is node's tier gate against held: the node it requires held, and
// at least SpentAbove ranks held in the class's smaller tiers.
func gateMet(node Node, held Ranks) bool {
	if node.Gate.Requires != "" && held[node.Gate.Requires] < 1 {
		return false
	}
	spent := 0
	for _, n := range trees[node.Class] {
		if n.Tier < node.Tier {
			spent += max(held[n.ID], 0)
		}
	}
	return spent >= node.Gate.SpentAbove
}

func otherSpecializationHeld(node Node, held Ranks) bool {
	for _, n := range trees[node.Class] {
		if n.Kind == KindSpecialization && n.ID != node.ID && held[n.ID] > 0 {
			return true
		}
	}
	return false
}
