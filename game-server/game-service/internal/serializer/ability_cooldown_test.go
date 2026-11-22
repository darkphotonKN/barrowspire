package serializer

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-Q18Q3 §A R1–R3, R6. I-Q18Q3-1.

const cooldownTick = 1.0 / 60

// seatCaster puts a delver in the world who can cast their right-click: a
// class resource, the ability, and somewhere for intents and cooldowns to go.
func seatCaster(em *ecs.EntityManager, memberID uuid.UUID, class string, pool components.ResourceComponent, ability components.AttackKind) *ecs.Entity {
	delver := seatWithResource(em, memberID, class, pool, ability)
	delver.AddComponent(components.NewAttackIntentComponent())
	delver.AddComponent(components.NewCooldownComponent())
	return delver
}

func cast(e *ecs.Entity, kind components.AttackKind) {
	c, _ := e.GetComponent(ecs.ComponentTypeAttackIntent)
	ic := c.(*components.AttackIntentComponent)
	ic.Pending = append(ic.Pending, components.AttackIntent{Kind: kind, TargetX: 200, TargetY: 10})
}

func abilityCooldownOf(t *testing.T, em *ecs.EntityManager, worldType types.WorldType, recipient uuid.UUID) map[string]any {
	t.Helper()
	_, frame := wireFor(t, em, worldType, recipient)
	me := frame["current_player"].(map[string]any)
	require.Contains(t, me, "ability_cooldown")
	return me["ability_cooldown"].(map[string]any)
}

// A warrior's dash reads its full 0.4 s on the tick it resolves, the same
// total while it falls, and {0, 0} once it has run out, in every world.
func TestFormatStateToClientState_AbilityCooldownRunsOutOnTheWire(t *testing.T) {
	for _, world := range []types.WorldType{types.WorldTypeRun, types.WorldTypeField, types.WorldTypeHub} {
		t.Run(string(world), func(t *testing.T) {
			em := ecs.NewEntityManager()
			warrior := uuid.New()
			body := seatCaster(em, warrior, "warrior", stamina(100, 100), components.AttackDash)
			combat := systems.NewCombatSystem(em, func() float64 { return 0.999 }, systems.PlayerDamageOff, systems.UniqueEffectTuning{})

			assert.Equal(t, map[string]any{"remaining": float64(0), "total": float64(0)},
				abilityCooldownOf(t, em, world, warrior), "ready")

			cast(body, components.AttackDash)
			combat.Update(cooldownTick, em.GetAllEntities(), nil)
			assert.Equal(t, map[string]any{"remaining": 0.4, "total": 0.4}, abilityCooldownOf(t, em, world, warrior))

			combat.Update(cooldownTick, em.GetAllEntities(), nil)
			got := abilityCooldownOf(t, em, world, warrior)
			assert.InDelta(t, 0.4-cooldownTick, got["remaining"], 1e-9)
			assert.Equal(t, 0.4, got["total"])

			for range int(math.Ceil(0.4 / cooldownTick)) {
				combat.Update(cooldownTick, em.GetAllEntities(), nil)
			}
			assert.Equal(t, map[string]any{"remaining": float64(0), "total": float64(0)},
				abilityCooldownOf(t, em, world, warrior), "run out")
		})
	}
}

// The cooldown read is the delver's own right-click: another kind's cooldown
// running beside it does not show.
func TestFormatStateToClientState_AbilityCooldownIsTheRightClicksOwn(t *testing.T) {
	tests := []struct {
		name    string
		class   string
		pool    components.ResourceComponent
		ability components.AttackKind
		running map[components.AttackKind]float64
		want    map[string]any
	}{
		{"archer's shadow shot", "archer", stamina(100, 100), components.AttackShadowShot,
			map[components.AttackKind]float64{components.AttackShadowShot: 1.2, components.AttackArrow: 0.5},
			map[string]any{"remaining": 1.2, "total": 1.2}},
		{"mage's triple fireball, a fireball's running", "mage", mana(150, 150), components.AttackTripleFireball,
			map[components.AttackKind]float64{components.AttackFireball: 0.5},
			map[string]any{"remaining": float64(0), "total": float64(0)}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			id := uuid.New()
			body := seatCaster(em, id, tt.class, tt.pool, tt.ability)
			cc, _ := body.GetComponent(ecs.ComponentTypeCooldown)
			cooldowns := cc.(*components.CooldownComponent)
			for kind, length := range tt.running {
				cooldowns.Remaining[kind], cooldowns.Total[kind] = length, length
			}

			assert.Equal(t, tt.want, abilityCooldownOf(t, em, types.WorldTypeRun, id))
		})
	}
}

// A merc's right-click cooldown is the whiff lockout: remaining is the
// parry_lockout beside it, total the length it started at. FS-Q18Q3 §A R2.
func TestFormatStateToClientState_AMercsAbilityCooldownIsTheWhiffLockout(t *testing.T) {
	tests := []struct {
		name   string
		stance components.ParryComponent
		want   map[string]any
	}{
		{"locked out", components.ParryComponent{LockoutRemaining: 0.5, LockoutTotal: 0.98},
			map[string]any{"remaining": 0.5, "total": 0.98}},
		{"stance open", components.ParryComponent{Open: true, OpenFor: 0.1},
			map[string]any{"remaining": float64(0), "total": float64(0)}},
		{"neither", components.ParryComponent{},
			map[string]any{"remaining": float64(0), "total": float64(0)}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			merc := uuid.New()
			seatMerc(em, merc, 1, tt.stance)

			_, frame := wireFor(t, em, types.WorldTypeRun, merc)
			me := frame["current_player"].(map[string]any)

			assert.Equal(t, tt.want, me["ability_cooldown"])
			assert.Equal(t, me["parry_lockout"], tt.want["remaining"])
		})
	}
}

// A delver with no ability has no ability_cooldown, and no other_players entry
// carries one, a party member's included. FS-Q18Q3 §A R1, R6.
func TestFormatStateToClientState_AbilityCooldownIsTheOwnersAlone(t *testing.T) {
	w := newPartyWorld()
	for _, world := range []types.WorldType{types.WorldTypeRun, types.WorldTypeField, types.WorldTypeHub} {
		others := w.frameFor(t, world, w.wren)
		require.NotEmpty(t, others)
		for id, other := range others {
			assert.NotContains(t, other, "ability_cooldown", "%s: %s", world, id)
			assert.NotContains(t, other, "tree_ability_cooldown", "%s: %s", world, id)
		}
	}

	em := ecs.NewEntityManager()
	bare := uuid.New()
	delver := em.CreateEntity()
	delver.AddComponent(components.NewPlayerComponent(bare, "warrior", "Wren", false))
	delver.AddComponent(components.NewTransformComponent(10, 10))
	delver.AddComponent(components.NewVelocityComponent(0, 0, 1))
	delver.AddComponent(components.NewItemIDListComponent([]uuid.UUID{}))
	_, frame := wireFor(t, em, types.WorldTypeRun, bare)
	assert.NotContains(t, frame["current_player"], "ability_cooldown")
}
