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

// Ranks spent above each gate, one short and exactly met.
var (
	spent3  = map[string]int{"t1a": 2, "t1b": 1}
	spent4  = map[string]int{"t1a": 2, "t1b": 2}
	spent10 = map[string]int{"t1a": 2, "t1b": 2, "t2a": 3, "t2b": 3}
	spent11 = with(spent10, "t3", 1)
	spent12 = with(spent11, "t4a", 1)
	spent13 = with(spent11, "t4a", 2)
	spent17 = map[string]int{"t1a": 2, "t1b": 2, "t2a": 3, "t2b": 3, "t3": 1, "t4a": 2, "t4b": 2, "t5a": 2}
	spent18 = with(spent17, "t5a", 3)
)

func with(base map[string]int, slot string, rank int) map[string]int {
	out := map[string]int{slot: rank}
	for k, v := range base {
		if k != slot {
			out[k] = v
		}
	}
	return out
}

// FS-8RZ51 §Acceptance Criteria "Points and rules": each refusal, and each
// allowed one step later.
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
		{"another class's node", "warrior", 10, w(nil), "mage.t1a", 1, passivetree.ErrUnknownNode},
		{"another class's node, as its own class", "mage", 10, passivetree.Ranks{}, "mage.t1a", 1, nil},
		{"an unknown id", "warrior", 10, w(nil), "warrior.t9", 1, passivetree.ErrUnknownNode},
		{"an unknown class", "paladin", 10, passivetree.Ranks{}, "paladin.t1a", 1, passivetree.ErrUnknownNode},
		{"an unknown id, a real one", "warrior", 10, w(nil), "warrior.t1b", 1, nil},

		{"rank 2 with rank 0 held", "warrior", 10, w(nil), "warrior.t1a", 2, passivetree.ErrRankOutOfOrder},
		{"rank 2 with rank 1 held", "warrior", 10, w(map[string]int{"t1a": 1}), "warrior.t1a", 2, nil},

		{"rank 3 of a 2-rank filler", "warrior", 10, w(map[string]int{"t1b": 2}), "warrior.t1b", 3, passivetree.ErrMaxRank},
		{"rank 2 of a 2-rank filler", "warrior", 10, w(map[string]int{"t1b": 1}), "warrior.t1b", 2, nil},
		{"rank 2 of the 1-rank ability", "warrior", 15, w(spent11), "warrior.t3", 2, passivetree.ErrMaxRank},

		{"a tier-2 node with 3 spent above", "warrior", 10, w(spent3), "warrior.t2a", 1, passivetree.ErrTierLocked},
		{"a tier-2 node with 4 spent above", "warrior", 10, w(spent4), "warrior.t2a", 1, nil},

		{"the tier-3 node with 7 spent above", "warrior", 10, w(map[string]int{"t1a": 2, "t1b": 2, "t2a": 3}), "warrior.t3", 1, passivetree.ErrTierLocked},
		{"the tier-3 node with 8 spent above", "warrior", 10, w(map[string]int{"t1a": 2, "t1b": 2, "t2a": 3, "t2b": 1}), "warrior.t3", 1, nil},

		{"a tier-4 node without t3", "warrior", 15, w(spent10), "warrior.t4a", 1, passivetree.ErrTierLocked},
		{"a tier-4 node with t3", "warrior", 15, w(spent11), "warrior.t4a", 1, nil},

		{"a tier-5 node with 12 spent above", "warrior", 15, w(spent12), "warrior.t5a", 1, passivetree.ErrTierLocked},
		{"a tier-5 node with 13 spent above", "warrior", 15, w(spent13), "warrior.t5a", 1, nil},

		{"a tier-6 node with 17 spent above", "warrior", 20, w(spent17), "warrior.t6a", 1, passivetree.ErrTierLocked},
		{"a tier-6 node with 18 spent above", "warrior", 20, w(spent18), "warrior.t6a", 1, nil},

		{"t6b with t6a held", "warrior", 20, w(with(spent18, "t6a", 1)), "warrior.t6b", 1, passivetree.ErrSpecializationTaken},
		{"t6b with t6a not held", "warrior", 20, w(spent18), "warrior.t6b", 1, nil},
		{"t6a with t6b held", "warrior", 20, w(with(spent18, "t6b", 1)), "warrior.t6a", 1, passivetree.ErrSpecializationTaken},

		{"a tier-1 node at 0 unspent (level 1)", "warrior", 1, w(nil), "warrior.t1a", 1, passivetree.ErrNoPoints},
		{"a tier-1 node at 1 unspent (level 2)", "warrior", 2, w(nil), "warrior.t1a", 1, nil},
		{"a tier-2 node at 0 unspent", "warrior", 5, w(spent4), "warrior.t2a", 1, passivetree.ErrNoPoints},
		{"a tier-2 node at 1 unspent", "warrior", 6, w(spent4), "warrior.t2a", 1, nil},
		{"a tier-6 node at 0 unspent", "warrior", 19, w(spent18), "warrior.t6a", 1, passivetree.ErrNoPoints},
		{"a tier-6 node at level 20", "warrior", 20, w(spent18), "warrior.t6a", 1, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.GreaterOrEqual(t, passivetree.Unspent(tt.level, tt.held), 0, "unspent")

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
		{"the rank held", 10, w(map[string]int{"t1a": 1}), "warrior.t1a", 1},
		{"below the rank held", 10, w(map[string]int{"t1a": 2}), "warrior.t1a", 1},
		{"at max rank", 10, w(map[string]int{"t1a": 2}), "warrior.t1a", 2},
		{"at 0 unspent", 2, w(map[string]int{"t1a": 1}), "warrior.t1a", 1},
		{"the specialization held", 20, w(with(spent18, "t6a", 1)), "warrior.t6a", 1},
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
		{passivetree.ErrTierLocked, errcode.PassiveTierLocked},
		{passivetree.ErrNoPoints, errcode.PassiveNoPoints},
		{passivetree.ErrSpecializationTaken, errcode.PassiveSpecializationTaken},
	}
	for _, tt := range tests {
		var refused *passivetree.Refusal
		require.True(t, errors.As(tt.err, &refused), "%v", tt.err)
		assert.Equal(t, tt.code, refused.Code)
	}
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
		{"level 10, 4 held", 10, w(spent4), 5},
		{"level 20, 18 held", 20, w(spent18), 2},
		{"more held than earned", 1, w(map[string]int{"t1a": 2}), 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, passivetree.Unspent(tt.level, tt.held))
		})
	}
}
