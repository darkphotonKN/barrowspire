package serializer

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-8RZ51 §E R23. I-8RZ51-3.

var everyWorld = []types.WorldType{types.WorldTypeHub, types.WorldTypeField, types.WorldTypeRun}

// seatRanked seats a warrior of level holding ranks.
func seatRanked(em *ecs.EntityManager, memberID uuid.UUID, level int, ranks passivetree.Ranks) *components.StatsComponent {
	delver := seatWithResource(em, memberID, "warrior", stamina(100, 100), components.AttackDash)
	stats := components.NewStatsComponent(1, 1, 1, 1)
	stats.Level = level
	delver.AddComponent(stats)
	delver.AddComponent(components.NewPassiveRanksComponent(ranks))
	return stats
}

// current_player carries the ranks held and the points left to spend, in
// every world.
func TestFormatStateToClientState_CurrentPlayerCarriesTheTree(t *testing.T) {
	for _, world := range everyWorld {
		t.Run(string(world), func(t *testing.T) {
			em := ecs.NewEntityManager()
			wren := uuid.New()
			seatRanked(em, wren, 6, passivetree.Ranks{"warrior.t1a": 2, "warrior.t1b": 1})

			_, frame := wireFor(t, em, world, wren)
			me := frame["current_player"].(map[string]any)

			assert.Equal(t, map[string]any{"warrior.t1a": float64(2), "warrior.t1b": float64(1)}, me["passive_ranks"])
			assert.Equal(t, float64(2), me["passive_points"], "level 6 earns 5, 3 held")
		})
	}
}

// None held is an empty object, never null or absent; a level-1 character has
// no point.
func TestFormatStateToClientState_NoRanksHeldIsAnEmptyObject(t *testing.T) {
	em := ecs.NewEntityManager()
	wren := uuid.New()
	seatRanked(em, wren, 1, nil)

	raw, frame := wireFor(t, em, types.WorldTypeHub, wren)
	me := frame["current_player"].(map[string]any)

	assert.Contains(t, raw, `"passive_ranks":{}`)
	assert.Equal(t, float64(0), me["passive_points"])
}

// The points follow the body's current level, so a level-up shows in the
// next frame.
func TestFormatStateToClientState_PassivePointsFollowTheCurrentLevel(t *testing.T) {
	em := ecs.NewEntityManager()
	wren := uuid.New()
	stats := seatRanked(em, wren, 5, passivetree.Ranks{"warrior.t1a": 1})

	_, frame := wireFor(t, em, types.WorldTypeRun, wren)
	require.Equal(t, float64(3), frame["current_player"].(map[string]any)["passive_points"])

	stats.Level = 6
	_, frame = wireFor(t, em, types.WorldTypeRun, wren)
	assert.Equal(t, float64(4), frame["current_player"].(map[string]any)["passive_points"])
}

// Own frame only (ADR-0064): no other_players entry carries the tree, a party
// member's included.
func TestFormatStateToClientState_TheTreeIsTheOwnersAlone(t *testing.T) {
	w := newPartyWorld()
	for _, id := range []uuid.UUID{w.wren, w.mage, w.merc, w.stranger, w.solo} {
		e := delverOf(t, w.em, id)
		e.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"warrior.t1a": 1}))
	}
	for _, world := range everyWorld {
		others := w.frameFor(t, world, w.wren)
		require.NotEmpty(t, others)
		for id, other := range others {
			assert.NotContains(t, other, "passive_ranks", "%s: %s", world, id)
			assert.NotContains(t, other, "passive_points", "%s: %s", world, id)
		}
	}
}

func delverOf(t *testing.T, em *ecs.EntityManager, memberID uuid.UUID) *ecs.Entity {
	t.Helper()
	for _, e := range em.GetAllEntities() {
		if pc, ok := e.GetComponent(ecs.ComponentTypePlayer); ok && pc.(*components.PlayerComponent).MemberID == memberID {
			return e
		}
	}
	t.Fatalf("no body for %s", memberID)
	return nil
}
