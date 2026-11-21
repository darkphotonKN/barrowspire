package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// FS-E1ZDG §B R7, R10: a body is the specialization its held ranks name, read
// through the shared table; ranks naming no tier-6 node of its class give none.
func TestSpecialization(t *testing.T) {
	body := func(class string, ranks passivetree.Ranks) *ecs.Entity {
		e := ecs.NewEntityManager().CreateEntity()
		e.AddComponent(components.NewPlayerComponent(uuid.New(), class, "Wren", false))
		if ranks != nil {
			e.AddComponent(components.NewPassiveRanksComponent(ranks))
		}
		return e
	}
	tests := []struct {
		name   string
		entity *ecs.Entity
		want   string
	}{
		{"a berserker", body("warrior", passivetree.Ranks{"warrior.t6b": 1}), passivetree.Berserker},
		{"a shadow ranger", body("archer", passivetree.Ranks{"archer.t6b": 1}), passivetree.ShadowRanger},
		{"no tier-6 node", body("warrior", passivetree.Ranks{"warrior.t1a": 2}), ""},
		{"another class's tier-6 node", body("warrior", passivetree.Ranks{"mage.t6a": 1}), ""},
		{"an unknown node", body("warrior", passivetree.Ranks{"warrior.t9": 1}), ""},
		{"no ranks at all", body("warrior", nil), ""},
		{"no body", ecs.NewEntityManager().CreateEntity(), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, Specialization(tt.entity))
		})
	}
}
