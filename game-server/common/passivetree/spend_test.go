package passivetree_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
)

// w is a warrior's held ranks by slot.
func w(slots map[string]int) passivetree.Ranks {
	held := passivetree.Ranks{}
	for slot, rank := range slots {
		held["warrior."+slot] = rank
	}
	return held
}

// Held states along the warrior's tree (V2), each the one before plus a node.
var (
	toR2  = map[string]int{"r1": 1, "r2": 1}
	toM2  = with(with(toR2, "ua1", 1), "m1", 1, "m2", 1)
	toM3  = with(toM2, "t3", 1, "m3", 1)
	toM4  = with(toM3, "la1", 1, "m4", 1)
	toT6a = with(toM4, "t6a", 1)
)

// with is base and the slot ranks given in pairs, a new map.
func with(base map[string]int, pairs ...any) map[string]int {
	out := make(map[string]int, len(base)+len(pairs)/2)
	for k, v := range base {
		out[k] = v
	}
	for i := 0; i < len(pairs); i += 2 {
		out[pairs[i].(string)] = pairs[i+1].(int)
	}
	return out
}

// FS-8RZ51 §Change: Tree v2 §Acceptance Criteria "Graph and rule (common)":
// each refusal of V5, and each allowed one step later.
func TestCheckSpend_RefusesByRuleAndAllowsOneStepLater(t *testing.T) {
	tests := []struct {
		name    string
		class   string
		level   int32
		held    passivetree.Ranks
		node    string
		target  int
		wantErr error
	}{
		{"r1 at level 2 with nothing held", "warrior", 2, w(nil), "warrior.r1", 1, nil},
		{"r2 with r1 unheld", "warrior", 10, w(nil), "warrior.r2", 1, passivetree.ErrNotLinked},
		{"r2 with r1 held", "warrior", 10, w(map[string]int{"r1": 1}), "warrior.r2", 1, nil},

		{"another class's node", "warrior", 10, w(nil), "mage.r1", 1, passivetree.ErrUnknownNode},
		{"another class's node, as its own class", "mage", 10, passivetree.Ranks{}, "mage.r1", 1, nil},
		{"an unknown id", "warrior", 10, w(nil), "warrior.t9", 1, passivetree.ErrUnknownNode},
		{"a retired id", "warrior", 10, w(nil), "warrior.t1a", 1, passivetree.ErrUnknownNode},
		{"an unknown class", "paladin", 10, passivetree.Ranks{}, "paladin.r1", 1, passivetree.ErrUnknownNode},

		{"rank 2 with rank 0 held", "warrior", 10, w(toR2), "warrior.ua1", 2, passivetree.ErrRankOutOfOrder},
		{"kicker rank 3 with rank 1 held", "warrior", 10, w(with(toR2, "ua1", 1, "t2a", 1)), "warrior.t2a", 3, passivetree.ErrRankOutOfOrder},
		{"kicker rank 2 with rank 1 held", "warrior", 10, w(with(toR2, "ua1", 1, "t2a", 1)), "warrior.t2a", 2, nil},

		{"rank 2 of a traversal node", "warrior", 10, w(map[string]int{"r1": 1}), "warrior.r1", 2, passivetree.ErrMaxRank},
		{"rank 4 of a kicker", "warrior", 10, w(with(toR2, "ua1", 1, "t2a", 3)), "warrior.t2a", 4, passivetree.ErrMaxRank},
		{"rank 2 of the ability", "warrior", 15, w(toM3), "warrior.t3", 2, passivetree.ErrMaxRank},

		{"m1 with only ua1 held", "warrior", 10, w(with(toR2, "ua1", 1)), "warrior.m1", 1, nil},
		{"m1 with only ub1 held", "warrior", 10, w(with(toR2, "ub1", 1)), "warrior.m1", 1, nil},
		{"m1 with neither upper first node", "warrior", 10, w(toR2), "warrior.m1", 1, passivetree.ErrNotLinked},

		{"ub1 with ua1 held", "warrior", 10, w(with(toR2, "ua1", 1)), "warrior.ub1", 1, passivetree.ErrSideTaken},
		{"t2b with ua1 held", "warrior", 10, w(with(toR2, "ua1", 1)), "warrior.t2b", 1, passivetree.ErrSideTaken},
		{"ub2 with ua1 held", "warrior", 10, w(with(toR2, "ua1", 1)), "warrior.ub2", 1, passivetree.ErrSideTaken},
		{"ua1 with ub1 held", "warrior", 10, w(with(toR2, "ub1", 1)), "warrior.ua1", 1, passivetree.ErrSideTaken},
		{"t2a with ua1 held, its own side", "warrior", 10, w(with(toR2, "ua1", 1)), "warrior.t2a", 1, nil},

		{"t6b with t6a held", "warrior", 20, w(toT6a), "warrior.t6b", 1, passivetree.ErrSideTaken},
		{"t6a with t6b held", "warrior", 20, w(with(toM4, "t6b", 1)), "warrior.t6a", 1, passivetree.ErrSideTaken},

		{"t3 with m2 held at level 9", "warrior", 9, w(toM2), "warrior.t3", 1, passivetree.ErrLevelTooLow},
		{"t3 with m2 held at level 10", "warrior", 10, w(toM2), "warrior.t3", 1, nil},
		{"t6a with m4 held at level 19", "warrior", 19, w(toM4), "warrior.t6a", 1, passivetree.ErrLevelTooLow},
		{"t6a with m4 held at level 20", "warrior", 20, w(toM4), "warrior.t6a", 1, nil},
		{"t6a with m4 unheld at level 20", "warrior", 20, w(toM3), "warrior.t6a", 1, passivetree.ErrNotLinked},

		{"side taken and unlinked answers side taken", "warrior", 10, w(with(toR2, "ua1", 1)), "warrior.ub3", 1, passivetree.ErrSideTaken},
		{"side taken at 0 unspent answers side taken", "warrior", 4, w(with(toR2, "ua1", 1)), "warrior.ub1", 1, passivetree.ErrSideTaken},
		{"unlinked at 0 unspent answers not reachable", "warrior", 1, w(nil), "warrior.r2", 1, passivetree.ErrNotLinked},

		{"r1 at 0 unspent (level 1)", "warrior", 1, w(nil), "warrior.r1", 1, passivetree.ErrNoPoints},
		{"ua1 at 0 unspent", "warrior", 3, w(toR2), "warrior.ua1", 1, passivetree.ErrNoPoints},
		{"ua1 at 1 unspent", "warrior", 4, w(toR2), "warrior.ua1", 1, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			verdict, err := passivetree.CheckSpend(tt.class, tt.level, tt.held, tt.node, tt.target)
			if tt.wantErr != nil {
				require.Error(t, err)
				assert.True(t, errors.Is(err, tt.wantErr), "err = %v, want %v", err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, passivetree.Allowed, verdict)
		})
	}
}

// Every lower:b node is refused side taken once la1 is held (V6).
func TestCheckSpend_TakingASideLocksEveryNodeOfTheOther(t *testing.T) {
	held := w(with(toM3, "la1", 1))
	for _, n := range passivetree.Nodes("warrior") {
		if n.Exclusive == nil || n.Exclusive.Group != passivetree.GroupLower || n.Exclusive.Side != "b" {
			continue
		}
		_, err := passivetree.CheckSpend("warrior", 20, held, n.ID, 1)
		assert.ErrorIs(t, err, passivetree.ErrSideTaken, n.ID)
	}
}

// R10: a target already reached is a no-op success, even when a fresh spend
// would be refused, so a retried spend never takes a second point.
func TestCheckSpend_ATargetAlreadyHeldIsANoOp(t *testing.T) {
	tests := []struct {
		name   string
		level  int32
		held   passivetree.Ranks
		node   string
		target int
	}{
		{"the rank held", 10, w(map[string]int{"r1": 1}), "warrior.r1", 1},
		{"below the rank held", 10, w(with(toR2, "ua1", 1, "t2a", 2)), "warrior.t2a", 1},
		{"at max rank", 10, w(with(toR2, "ua1", 1, "t2a", 3)), "warrior.t2a", 3},
		{"at 0 unspent", 2, w(map[string]int{"r1": 1}), "warrior.r1", 1},
		{"on a locked side", 10, w(with(toR2, "ua1", 1, "ub1", 1)), "warrior.ub1", 1},
		{"the specialization held", 20, w(toT6a), "warrior.t6a", 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			verdict, err := passivetree.CheckSpend("warrior", tt.level, tt.held, tt.node, tt.target)
			require.NoError(t, err)
			assert.Equal(t, passivetree.AlreadyHeld, verdict)
		})
	}
}

// Each refusal names its rule's errcode, for the services to answer with.
func TestCheckSpend_RefusalsCarryTheirCode(t *testing.T) {
	tests := []struct {
		err  error
		code errcode.Code
	}{
		{passivetree.ErrUnknownNode, errcode.PassiveUnknownNode},
		{passivetree.ErrRankOutOfOrder, errcode.PassiveRankOutOfOrder},
		{passivetree.ErrMaxRank, errcode.PassiveMaxRank},
		{passivetree.ErrSideTaken, errcode.PassiveSideTaken},
		{passivetree.ErrNotReachable, errcode.PassiveTierLocked},
		{passivetree.ErrNotLinked, errcode.PassiveTierLocked},
		{passivetree.ErrLevelTooLow, errcode.PassiveTierLocked},
		{passivetree.ErrNoPoints, errcode.PassiveNoPoints},
	}
	for _, tt := range tests {
		var refused *passivetree.Refusal
		require.True(t, errors.As(tt.err, &refused), "%v", tt.err)
		assert.Equal(t, tt.code, refused.Code)
	}
}

// V7: both reasons a node is not reachable yet are ErrNotReachable, the one
// a refusal read off the wire is; neither is the other.
func TestCheckSpend_NotReachableHasTwoReasons(t *testing.T) {
	assert.ErrorIs(t, passivetree.ErrNotLinked, passivetree.ErrNotReachable)
	assert.ErrorIs(t, passivetree.ErrLevelTooLow, passivetree.ErrNotReachable)
	assert.NotErrorIs(t, passivetree.ErrNotLinked, passivetree.ErrLevelTooLow)
	assert.NotErrorIs(t, passivetree.ErrNotReachable, passivetree.ErrNotLinked)
	assert.NotErrorIs(t, passivetree.ErrSideTaken, passivetree.ErrNotReachable)
}

// R7: earned(level) − Σ ranks held, never below 0.
func TestUnspent(t *testing.T) {
	tests := []struct {
		name  string
		level int32
		held  passivetree.Ranks
		want  int
	}{
		{"level 1, nothing held", 1, nil, 0},
		{"level 10, nothing held", 10, w(nil), 9},
		{"level 10, 4 held", 10, w(with(toR2, "ua1", 1, "m1", 1)), 5},
		{"level 20, 10 held", 20, w(toT6a), 10},
		{"more held than earned", 1, w(map[string]int{"r1": 1}), 0},
		// V8: only nodes the definition knows cost, each at most its max
		{"a retired id costs nothing", 10, w(map[string]int{"t1a": 2}), 9},
		{"an unknown id costs nothing", 10, passivetree.Ranks{"paladin.r1": 3}, 9},
		{"a rank above max counts its max", 10, w(with(toR2, "ua1", 1, "t2a", 7)), 3},
		{"a rank below 0 costs nothing", 10, w(map[string]int{"r1": -2}), 9},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, passivetree.Unspent(tt.level, tt.held))
		})
	}
}

// R20: ranks only rise, so two answers merged in either order leave the
// higher rank of each node; neither side is written.
func TestHigher_TakesTheHigherRankPerNode(t *testing.T) {
	older := w(map[string]int{"t2a": 1, "r1": 1})
	newer := w(map[string]int{"t2a": 2, "ua1": 1})
	want := w(map[string]int{"t2a": 2, "r1": 1, "ua1": 1})

	assert.Equal(t, want, passivetree.Higher(older, newer))
	assert.Equal(t, want, passivetree.Higher(newer, older))
	assert.Equal(t, w(map[string]int{"t2a": 1, "r1": 1}), older, "neither side is written")
	assert.Equal(t, passivetree.Ranks{}, passivetree.Higher(nil, nil), "never nil")
	assert.Equal(t, w(map[string]int{"r1": 1}), passivetree.Higher(w(map[string]int{"r1": 1, "r2": 0}), nil), "a node at 0 is not held")
}
