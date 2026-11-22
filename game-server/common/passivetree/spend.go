package passivetree

import "github.com/darkphotonKN/barrowspire-server/common/errcode"

// Ranks is a character's held ranks by node id. A node not held is absent or 0.
type Ranks map[string]int

// Unspent is the points a character of level holding held has left to spend:
// earned(level) − Σ ranks held, never below 0 (FS-8RZ51 R7). Only nodes the
// definition knows count, each at most its max rank, so a retired or unknown
// id costs nothing (V8). It is derived, never stored.
func Unspent(level int32, held Ranks) int {
	return definition.unspent(level, held)
}

func (t *tree) unspent(level int32, held Ranks) int {
	left := Earned(level)
	for id, rank := range held {
		if n, known := t.byID[id]; known && rank > 0 {
			left -= min(rank, n.MaxRank)
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
	// of is the refusal this one is a reason for, if any: errors.Is matches
	// both.
	of *Refusal
}

func (r *Refusal) Error() string { return "passive spend refused: " + r.rule }

// Unwrap is the refusal r is a reason for, so errors.Is(ErrNotLinked,
// ErrNotReachable) holds.
func (r *Refusal) Unwrap() error {
	if r.of == nil {
		return nil
	}
	return r.of
}

// The spend rule's refusals (V5), one per rule. Match them with errors.Is.
var (
	ErrUnknownNode    = &Refusal{Code: errcode.PassiveUnknownNode, rule: "not one of the class's nodes"}
	ErrRankOutOfOrder = &Refusal{Code: errcode.PassiveRankOutOfOrder, rule: "not the next rank"}
	ErrMaxRank        = &Refusal{Code: errcode.PassiveMaxRank, rule: "already at its highest rank"}
	// ErrSideTaken: another side of the node's exclusive group is taken,
	// for good (V6).
	ErrSideTaken = &Refusal{Code: errcode.PassiveSideTaken, rule: "another side of its group is taken"}
	// ErrNotReachable: not reachable yet (V7). The rule answers one of its
	// two reasons; a refusal read off the wire is this one.
	ErrNotReachable = &Refusal{Code: errcode.PassiveTierLocked, rule: "not reachable yet"}
	// ErrNotLinked: none of the node's links is held.
	ErrNotLinked = &Refusal{Code: errcode.PassiveTierLocked, rule: "not reachable yet: no linked node held", of: ErrNotReachable}
	// ErrLevelTooLow: the character is below the node's level gate.
	ErrLevelTooLow = &Refusal{Code: errcode.PassiveTierLocked, rule: "not reachable yet: level too low", of: ErrNotReachable}
	ErrNoPoints    = &Refusal{Code: errcode.PassiveNoPoints, rule: "no points to spend"}
)

// CheckSpend is the spend rule (V5): may a character of class and level,
// holding held, take nodeID to target rank? It answers Allowed or AlreadyHeld
// (a target at or below the rank held, R10), or the first rule that refused
// it, in V5's order. A target below 1 is the caller's validation; here it
// reads as already held.
func CheckSpend(class string, level int32, held Ranks, nodeID string, target int) (Verdict, error) {
	t, ok := trees[class]
	if !ok {
		return 0, ErrUnknownNode
	}
	return t.checkSpend(level, held, nodeID, target)
}

func (t *tree) checkSpend(level int32, held Ranks, nodeID string, target int) (Verdict, error) {
	node, ok := t.byID[nodeID]
	if !ok {
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
	if t.anotherSideTaken(node, held) {
		return 0, ErrSideTaken
	}
	if !linked(node, held) {
		return 0, ErrNotLinked
	}
	if level < node.MinLevel {
		return 0, ErrLevelTooLow
	}
	if t.unspent(level, held) < 1 {
		return 0, ErrNoPoints
	}
	return Allowed, nil
}

// anotherSideTaken is whether any node on another side of node's exclusive
// group is held. False for a node on no side.
func (t *tree) anotherSideTaken(node Node, held Ranks) bool {
	if node.Exclusive == nil {
		return false
	}
	for _, n := range t.nodes {
		if n.Exclusive != nil && n.Exclusive.Group == node.Exclusive.Group &&
			n.Exclusive.Side != node.Exclusive.Side && held[n.ID] > 0 {
			return true
		}
	}
	return false
}

// linked is whether node is the root or any of its links is held.
func linked(node Node, held Ranks) bool {
	if len(node.Requires) == 0 {
		return true
	}
	for _, id := range node.Requires {
		if held[id] > 0 {
			return true
		}
	}
	return false
}
