package passivetree_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
)

// FS-E1ZDG §A R1, §B R4, R7, R10: the one specialization-node-to-specialization table
// both services read. None before the pick, and none for a node of another
// class or one the tree does not know.
func TestSpecializationOf(t *testing.T) {
	tests := []struct {
		name  string
		class string
		ranks passivetree.Ranks
		want  string
	}{
		{"guardian", "warrior", passivetree.Ranks{"warrior.t6a": 1}, passivetree.Guardian},
		{"berserker", "warrior", passivetree.Ranks{"warrior.r1": 1, "warrior.m4": 1, "warrior.t6b": 1}, passivetree.Berserker},
		{"spellwarden", "mage", passivetree.Ranks{"mage.t6a": 1}, passivetree.Spellwarden},
		{"pyromancer", "mage", passivetree.Ranks{"mage.t6b": 1}, passivetree.Pyromancer},
		{"hunter", "archer", passivetree.Ranks{"archer.t6a": 1}, passivetree.Hunter},
		{"shadow ranger", "archer", passivetree.Ranks{"archer.t6b": 1}, passivetree.ShadowRanger},
		{"duelist", "mercenary", passivetree.Ranks{"mercenary.t6a": 1}, passivetree.Duelist},
		{"sellsword", "mercenary", passivetree.Ranks{"mercenary.t6b": 1}, passivetree.Sellsword},
		{"no ranks", "warrior", nil, ""},
		{"no specialization node", "warrior", passivetree.Ranks{"warrior.r1": 1, "warrior.t3": 1, "warrior.m4": 1}, ""},
		{"another class's node", "warrior", passivetree.Ranks{"mage.t6a": 1}, ""},
		{"an unknown node", "warrior", passivetree.Ranks{"warrior.t6c": 1}, ""},
		{"rank 0 is not held", "warrior", passivetree.Ranks{"warrior.t6a": 0}, ""},
		{"an unknown class", "bard", passivetree.Ranks{"bard.t6a": 1}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := passivetree.SpecializationOf(tt.class, tt.ranks)
			assert.Equal(t, tt.want, got)
			assert.Equal(t, tt.want != "", ok)
		})
	}
}

// The ids are §A.1's, snake_case, one per class per specialization slot.
func TestSpecializationIDs(t *testing.T) {
	assert.Equal(t,
		[]string{"guardian", "berserker", "spellwarden", "pyromancer", "hunter", "shadow_ranger", "duelist", "sellsword"},
		[]string{
			passivetree.Guardian, passivetree.Berserker, passivetree.Spellwarden, passivetree.Pyromancer,
			passivetree.Hunter, passivetree.ShadowRanger, passivetree.Duelist, passivetree.Sellsword,
		})
}
