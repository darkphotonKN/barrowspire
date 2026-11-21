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

// FS-E1ZDG §J R34, R36: a Sellsword's parry-charge pool, from seating, the
// pick, a death and a floor change.

func mercCharacter(ranks passivetree.Ranks) types.CharacterInPlay {
	return types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "mercenary", Level: 20, PassiveRanks: ranks}
}

func parryPoolOf(t *testing.T, e *ecs.Entity) *components.ResourceComponent {
	t.Helper()
	rc, ok := e.GetComponent(ecs.ComponentTypeResource)
	require.True(t, ok)
	pool := rc.(*components.ResourceComponent)
	require.Equal(t, components.ResourceParryCharges, pool.Kind)
	return pool
}

func TestAddPlayer_ASellswordIsSeatedAtZeroOfFive(t *testing.T) {
	tests := []struct {
		name    string
		ranks   passivetree.Ranks
		wantMax int
	}{
		{"a Sellsword", passivetree.Ranks{"mercenary.t6b": 1}, 5},
		{"a Duelist", passivetree.Ranks{"mercenary.t6a": 1}, 3},
		{"an unspecialized merc", passivetree.Ranks{"mercenary.t1a": 1}, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, world := range []WorldBounds{HubBounds(), RunBounds()} {
				s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, world)
				memberID := uuid.New()

				s.AddPlayer(memberID, mercCharacter(tt.ranks), "")

				pool := parryPoolOf(t, delverEntity(t, s, memberID))
				assert.Equal(t, tt.wantMax, pool.Max)
				assert.Zero(t, pool.Current, "seated at 0")
			}
		})
	}
}

// At the pick in town the max becomes 5 and the count does not move.
func TestRaisePassiveRanks_TheSellswordPickRaisesTheMaxToFive(t *testing.T) {
	s := newHubWorld()
	memberID := uuid.New()
	character := mercCharacter(passivetree.Ranks{"mercenary.t1a": 1})
	s.AddPlayer(memberID, character, "")
	body := delverEntity(t, s, memberID)
	parryPoolOf(t, body).Current = 2

	require.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"mercenary.t6b": 1}))

	pool := parryPoolOf(t, body)
	assert.Equal(t, 5, pool.Max)
	assert.Equal(t, 2, pool.Current, "the count stays")
}

func TestRaisePassiveRanks_TheDuelistPickKeepsThree(t *testing.T) {
	s := newHubWorld()
	memberID := uuid.New()
	character := mercCharacter(passivetree.Ranks{"mercenary.t1a": 1})
	s.AddPlayer(memberID, character, "")

	require.True(t, s.RaisePassiveRanks(memberID, character.ID, passivetree.Ranks{"mercenary.t6a": 1}))

	assert.Equal(t, 3, parryPoolOf(t, delverEntity(t, s, memberID)).Max)
}

// A Sellsword who dies is at 0 charges, and so no stacks; the max stays 5.
func TestSellsword_DeathTakesTheChargesToZero(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	memberID := uuid.New()
	s.AddPlayer(memberID, mercCharacter(passivetree.Ranks{"mercenary.t6b": 1}), "")
	body := delverEntity(t, s, memberID)
	parryPoolOf(t, body).Current = 5

	combat := systems.NewCombatSystem(s.EntityManager, func() float64 { return 0.999 }, systems.PlayerDamageOff, UniqueEffects)
	combat.Update(1.0/30, s.EntityManager.GetAllEntities(), []systems.Impact{{
		TargetEntityID: body.ID,
		Attack: components.AttackSnapshot{
			AttackerEntityID: uuid.New(), Kind: components.AttackMonsterStrike, FromMonster: true,
			DamageType: components.DamagePhysical, Power: 5000, Coefficient: 1,
		},
	}})
	hc, _ := body.GetComponent(ecs.ComponentTypeHealth)
	require.Zero(t, hc.(*components.HealthComponent).CurrentHealth, "dead")
	systems.NewEliminationSystem().Update(1.0/30, s.EntityManager.GetAllEntities(), s.ID)

	pool := parryPoolOf(t, body)
	assert.Zero(t, pool.Current)
	assert.Equal(t, 5, pool.Max)
}

// Edge States "Sellsword's stacks across a floor change": kept, as the
// charges are.
func TestRegenerateFloor_KeepsTheSellswordsCharges(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	memberID := uuid.New()
	s.AddPlayer(memberID, mercCharacter(passivetree.Ranks{"mercenary.t6b": 1}), "")
	body := delverEntity(t, s, memberID)
	parryPoolOf(t, body).Current = 4

	require.NoError(t, s.regenerateFloor())

	pool := parryPoolOf(t, body)
	assert.Equal(t, 4, pool.Current)
	assert.Equal(t, 5, pool.Max)
}
