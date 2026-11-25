package serializer

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

// FS-Q18Q3 §A R4–R6. I-Q18Q3-2.

// nameTreeAbility has the delver's class name its tree ability at node, and
// seats the ranks on their body: the node held when held is true.
func nameTreeAbility(delver *ecs.Entity, kind components.AttackKind, node string, held bool) {
	delver.AddComponent(components.NewTreeAbilityComponent(kind, node))
	ranks := passivetree.Ranks{}
	if held {
		ranks[node] = 1
	}
	delver.AddComponent(components.NewPassiveRanksComponent(ranks))
}

func ownFrame(t *testing.T, em *ecs.EntityManager, worldType types.WorldType, recipient uuid.UUID) map[string]any {
	t.Helper()
	_, frame := wireFor(t, em, worldType, recipient)
	return frame["current_player"].(map[string]any)
}

// A delver who does not hold their tree ability is told neither its cooldown
// nor its cost, whether their class names one or not. FS-Q18Q3 §A R4–R5.
func TestFormatStateToClientState_NoTreeAbilityFieldsWhileNotHeld(t *testing.T) {
	tests := []struct {
		name string
		seat func(*ecs.Entity)
	}{
		{"named, the node not held", func(e *ecs.Entity) {
			nameTreeAbility(e, components.AttackEarthbreaker, "warrior.t3", false)
		}},
		{"nothing named", func(*ecs.Entity) {}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			warrior := uuid.New()
			tt.seat(seatCaster(em, warrior, "warrior", stamina(100, 100), components.AttackDash))

			me := ownFrame(t, em, types.WorldTypeRun, warrior)
			assert.NotContains(t, me, "tree_ability_cooldown")
			require.Contains(t, me, "resource")
			assert.NotContains(t, me["resource"], "tree_ability_cost")
		})
	}
}

// A warrior holding Earthbreaker is told its cost, 60, and its cooldown:
// {0, 0} ready, {10, 10} on the tick a slam resolves, in every world.
// FS-Q18Q3 §A R4–R5; FS-04EEA §B starting values.
func TestFormatStateToClientState_TheHeldTreeAbilitysCostAndCooldown(t *testing.T) {
	for _, world := range []types.WorldType{types.WorldTypeRun, types.WorldTypeField, types.WorldTypeHub} {
		t.Run(string(world), func(t *testing.T) {
			em := ecs.NewEntityManager()
			warrior := uuid.New()
			body := seatCaster(em, warrior, "warrior", stamina(100, 100), components.AttackDash)
			nameTreeAbility(body, components.AttackEarthbreaker, "warrior.t3", true)
			combat := systems.NewCombatSystem(em, func() float64 { return 0.999 }, systems.PlayerDamageOff, systems.UniqueEffectTuning{})

			me := ownFrame(t, em, world, warrior)
			assert.Equal(t, map[string]any{"remaining": float64(0), "total": float64(0)}, me["tree_ability_cooldown"], "ready")
			assert.Equal(t, float64(60), me["resource"].(map[string]any)["tree_ability_cost"])

			cast(body, components.AttackEarthbreaker)
			combat.Update(cooldownTick, em.GetAllEntities(), nil)
			me = ownFrame(t, em, world, warrior)
			assert.Equal(t, map[string]any{"remaining": float64(10), "total": float64(10)}, me["tree_ability_cooldown"])
			assert.Equal(t, map[string]any{"remaining": float64(0), "total": float64(0)}, me["ability_cooldown"],
				"the right-click's own slot is untouched")
		})
	}
}

// A mercenary holding Settle the Debt is told its least cost, 1, and the cut's
// slot as its cooldown. FS-Q18Q3 §A R4–R5; FS-04EEA §F R29–R30, R33.
func TestFormatStateToClientState_AMercsTreeAbilityIsTheCutsSlot(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := uuid.New()
	body := seatMerc(em, merc, 2, components.ParryComponent{})
	nameTreeAbility(body, components.AttackSettleTheDebt, "mercenary.t3", true)
	body.AddComponent(components.NewCooldownComponent())
	cc, _ := body.GetComponent(ecs.ComponentTypeCooldown)
	cooldowns := cc.(*components.CooldownComponent)
	cooldowns.Remaining[components.AttackCut], cooldowns.Total[components.AttackCut] = 0.25, 0.25

	me := ownFrame(t, em, types.WorldTypeRun, merc)
	assert.Equal(t, map[string]any{"remaining": 0.25, "total": 0.25}, me["tree_ability_cooldown"])
	assert.Equal(t, float64(1), me["resource"].(map[string]any)["tree_ability_cost"])
}

// A teammate holding their tree ability carries its cost with their resource,
// which rides as one struct, but never its cooldown. FS-Q18Q3 §A R5–R6.
func TestFormatStateToClientState_ATeammatesTreeAbilityCooldownIsNeverSent(t *testing.T) {
	em := ecs.NewEntityManager()
	wren, mate := uuid.New(), uuid.New()
	party := uuid.New()
	seatCaster(em, wren, "warrior", stamina(100, 100), components.AttackDash)
	body := seatCaster(em, mate, "warrior", stamina(100, 100), components.AttackDash)
	nameTreeAbility(body, components.AttackEarthbreaker, "warrior.t3", true)
	w := &partyWorld{em: em, parties: &fixedParties{partyOf: map[uuid.UUID]uuid.UUID{wren: party, mate: party}}}

	for _, world := range []types.WorldType{types.WorldTypeRun, types.WorldTypeField, types.WorldTypeHub} {
		other := w.frameFor(t, world, wren)[mate]
		require.NotNil(t, other, world)
		assert.NotContains(t, other, "tree_ability_cooldown", world)
		assert.Equal(t, float64(60), other["resource"].(map[string]any)["tree_ability_cost"], world)
	}
}
