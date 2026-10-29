package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A merc who dies loses their parry charges and has their stance and whiff
// lockout cleared on the tick of death; `parries` is the run's count and stays.
// FS-MAMHR §Requirements 21; Edge States "Merc dies with the stance open".
func TestEliminationSystem_DeadMercLosesParryChargesStanceAndLockout(t *testing.T) {
	tests := []struct {
		name   string
		stance components.ParryComponent
	}{
		{"stance open", components.ParryComponent{Open: true, OpenFor: 0.1, Negated: true, Parries: 3}},
		{"lockout running", components.ParryComponent{LockoutRemaining: 0.6, Parries: 3}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			merc := parryMerc(em, 100, 100)
			*parryOf(merc) = tt.stance
			resourceOf(merc).Current = 3
			kill(merc)

			eliminated := NewEliminationSystem().Update(tickSeconds, em.GetAllEntities(), uuid.New())

			require.Len(t, eliminated, 1)
			assert.Equal(t, 0, pool(merc), "parry charges lost")
			assert.Equal(t, components.ParryComponent{Parries: 3}, *parryOf(merc), "stance and lockout cleared")
		})
	}
}

// Death takes only parry charges: another class's resource is left as it was.
func TestEliminationSystem_DeathLeavesOtherClassResourcesAlone(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := delver(em, 100, 100)
	resourceOf(warrior).Current = 40
	kill(warrior)

	NewEliminationSystem().Update(tickSeconds, em.GetAllEntities(), uuid.New())

	assert.Equal(t, 40, pool(warrior))
}
