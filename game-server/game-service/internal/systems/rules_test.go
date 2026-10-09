package systems_test

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const rulesTick = 1.0 / 30

// runWorld is a run's world with its run-level entity and a party of n delvers.
func runWorld(t *testing.T, n int) (*ecs.EntityManager, []*ecs.Entity) {
	t.Helper()

	em := ecs.NewEntityManager()
	game.CreateMatchProgressEntity(em)

	party := make([]*ecs.Entity, 0, n)
	for i := 0; i < n; i++ {
		party = append(party, game.CreatePlayerEntity(em, game.PlayerConfig{MemberID: uuid.New(), Username: "delver", Class: game.Classes["warrior"]}))
	}

	return em, party
}

func escape(t *testing.T, delver *ecs.Entity) {
	t.Helper()
	pc, ok := delver.GetComponent(ecs.ComponentTypePlayer)
	require.True(t, ok)
	pc.(*components.PlayerComponent).Escape = true
}

func die(t *testing.T, delver *ecs.Entity) {
	t.Helper()
	hc, ok := delver.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	health := hc.(*components.HealthComponent)
	health.CurrentHealth = 0
	health.IsEliminated = true
}

// ticks runs the rules n times and counts the end signals they sent.
func ticks(em *ecs.EntityManager, n int) int {
	rules := systems.NewRulesSystem()
	endSessionCh := make(chan bool, n)

	for i := 0; i < n; i++ {
		rules.Update(rulesTick, em.GetAllEntities(), endSessionCh)
	}

	return len(endSessionCh)
}

// The co-op end rule: a run ends when every delver on its roster has resolved,
// and says so once. FS-77AB6 §Requirements 15–16.
func TestRulesSystem_TwoDelvers_ContinuesAfterOneResolves_EndsOnceWhenBothHave(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(*testing.T, *ecs.Entity)
	}{
		{"first escapes", escape},
		{"first dies", die},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em, party := runWorld(t, 2)

			assert.Zero(t, ticks(em, 5), "nobody has resolved")

			tt.resolve(t, party[0])
			assert.Zero(t, ticks(em, 5), "the second delver is still in play")

			die(t, party[1])
			assert.Equal(t, 1, ticks(em, 5), "the end is signalled exactly once")
			assert.Zero(t, ticks(em, 5), "and never again")
		})
	}
}

func TestRulesSystem_OneDelver_EndsOnlyWhenThatDelverResolves(t *testing.T) {
	em, party := runWorld(t, 1)

	assert.Zero(t, ticks(em, 5), "a one-delver run must not end at once")

	escape(t, party[0])
	assert.Equal(t, 1, ticks(em, 5))
}

// A delver removed by disconnect cleanup has left the run: the rest decide it.
func TestRulesSystem_DelverRemovedByCleanup_CountsAsGone(t *testing.T) {
	em, party := runWorld(t, 2)
	rules := systems.NewRulesSystem()
	endSessionCh := make(chan bool, 10)

	rules.Update(rulesTick, em.GetAllEntities(), endSessionCh)
	em.RemoveEntity(party[0].ID)
	rules.Update(rulesTick, em.GetAllEntities(), endSessionCh)
	require.Empty(t, endSessionCh, "the remaining delver is still in play")

	die(t, party[1])
	rules.Update(rulesTick, em.GetAllEntities(), endSessionCh)
	assert.Len(t, endSessionCh, 1)
}

// A run being built has nobody on it yet; that is not a resolved party.
func TestRulesSystem_EmptyRoster_DoesNotEnd(t *testing.T) {
	em, _ := runWorld(t, 0)

	assert.Zero(t, ticks(em, 5))
}

// The hub has no run-level entity and never ends.
func TestRulesSystem_NoMatchProgress_NeverEnds(t *testing.T) {
	em := ecs.NewEntityManager()
	game.CreatePlayerEntity(em, game.PlayerConfig{MemberID: uuid.New(), Username: "resident", Class: game.Classes["warrior"]})

	assert.Zero(t, ticks(em, 5))
}
