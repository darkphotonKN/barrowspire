package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A fall is no hit: a Guardian who falls dies, their Last Stand ready.
// FS-E1ZDG §C R13; §Acceptance Criteria "Guardian".
func TestFall_AGuardianWithLastStandReadyDies(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	guardian := uuid.New()
	s.AddPlayer(guardian, types.CharacterInPlay{Name: "Wren", Class: "warrior", PassiveRanks: passivetree.Ranks{"warrior.t6a": 1}}, "")
	require.Equal(t, passivetree.Guardian, systems.Specialization(delverEntity(t, s, guardian)))

	require.NoError(t, s.Fall(guardian))

	body := delverEntity(t, s, guardian)
	hc, _ := body.GetComponent(ecs.ComponentTypeHealth)
	assert.Zero(t, hc.(*components.HealthComponent).CurrentHealth)
	assert.False(t, systems.InPlay(body))
}
