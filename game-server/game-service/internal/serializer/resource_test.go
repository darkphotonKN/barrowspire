package serializer

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seatWithResource puts a minimal delver in the world with a class resource
// and an ability, and hands back the entity.
func seatWithResource(em *ecs.EntityManager, memberID uuid.UUID, class string, pool components.ResourceComponent, ability components.AttackKind) *ecs.Entity {
	delver := em.CreateEntity()
	delver.AddComponent(components.NewPlayerComponent(memberID, class, "Wren", false))
	delver.AddComponent(components.NewTransformComponent(10, 10))
	delver.AddComponent(components.NewVelocityComponent(0, 0, 1))
	delver.AddComponent(components.NewItemIDListComponent([]uuid.UUID{}))
	delver.AddComponent(components.NewHealthComponent(90, 150))
	delver.AddComponent(&pool)
	delver.AddComponent(components.NewAbilityComponent(ability))
	return delver
}

// wireFor serializes the world and returns the frame one recipient is sent,
// as the JSON the client reads.
func wireFor(t *testing.T, em *ecs.EntityManager, worldType types.WorldType, recipient uuid.UUID) (raw string, frame map[string]any) {
	t.Helper()

	s := NewStateSerializer(em)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), worldType, em.GetAllEntities())
	require.NoError(t, err)

	encoded, err := json.Marshal(s.FormatStateToClientState(backendState, recipient))
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(encoded, &frame))
	return string(encoded), frame
}

func stamina(current, maximum int) components.ResourceComponent {
	return components.ResourceComponent{Kind: components.ResourceStamina, Current: current, Max: maximum, RegenPerSecond: 20}
}

func mana(current, maximum int) components.ResourceComponent {
	return components.ResourceComponent{Kind: components.ResourceMana, Current: current, Max: maximum, RegenPerSecond: 4}
}

// Each recipient is told their own class resource and nobody else's: a
// teammate shows health only. FS-8AY7S §Requirements 16–18.
func TestFormatStateToClientState_TellsEachDelverTheirOwnResourceOnly(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior, mage := uuid.New(), uuid.New()
	seatWithResource(em, warrior, "warrior", stamina(100, 100), components.AttackDash)
	seatWithResource(em, mage, "mage", mana(150, 150), components.AttackTripleFireball)

	tests := []struct {
		name      string
		recipient uuid.UUID
		want      map[string]any
	}{
		{"the warrior", warrior, map[string]any{"kind": "stamina", "current": float64(100), "max": float64(100), "ability_cost": float64(25)}},
		{"the mage", mage, map[string]any{"kind": "mana", "current": float64(150), "max": float64(150), "ability_cost": float64(15)}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw, frame := wireFor(t, em, types.WorldTypeRun, tt.recipient)

			me := frame["current_player"].(map[string]any)
			assert.Equal(t, tt.want, me["resource"])
			assert.Equal(t, float64(90), me["current_health"])
			assert.Equal(t, float64(150), me["max_health"])

			others := frame["other_players"].([]any)
			require.Len(t, others, 1)
			teammate := others[0].(map[string]any)
			assert.NotContains(t, teammate, "resource", "a teammate's resource is never sent")
			assert.Equal(t, float64(90), teammate["current_health"], "a teammate's health is")
			assert.Equal(t, float64(150), teammate["max_health"])

			assert.False(t, strings.Contains(raw, "current_mana"), "no current_mana anywhere")
			assert.False(t, strings.Contains(raw, "max_mana"), "no max_mana anywhere")
		})
	}
}

// A fractional pool goes on the wire rounded down, so a client comparing
// current with ability_cost agrees with the server. FS-8AY7S §Requirements 17,
// Edge States "Fractional pool on the wire".
func TestFormatStateToClientState_RoundsAFractionalPoolDown(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := uuid.New()
	pool := stamina(24, 100)
	pool.Accrued = components.ResourceSubUnitsPerPoint * 9 / 10 // 24.9
	seatWithResource(em, warrior, "warrior", pool, components.AttackDash)

	_, frame := wireFor(t, em, types.WorldTypeRun, warrior)

	resource := frame["current_player"].(map[string]any)["resource"].(map[string]any)
	assert.Equal(t, float64(24), resource["current"])
	assert.Equal(t, float64(25), resource["ability_cost"])
}

// The archer's ability is Shadow Shot at 40 stamina. FS-8AY7S §Requirements
// 12, 17; FS-JTNPR §Requirements 5.
func TestFormatStateToClientState_PricesTheArchersAbility(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := uuid.New()
	seatWithResource(em, archer, "archer", stamina(100, 100), components.AttackShadowShot)

	_, frame := wireFor(t, em, types.WorldTypeRun, archer)

	resource := frame["current_player"].(map[string]any)["resource"].(map[string]any)
	assert.Equal(t, float64(40), resource["ability_cost"])
}

// The resource is sent in the hub too, and to a delver left behind on an
// earlier floor, who still receives their own state. FS-8AY7S §Requirements 19.
func TestFormatStateToClientState_SendsTheResourceInTheHubAndWhenLeftBehind(t *testing.T) {
	t.Run("in the hub", func(t *testing.T) {
		em := ecs.NewEntityManager()
		mage := uuid.New()
		seatWithResource(em, mage, "mage", mana(150, 150), components.AttackTripleFireball)

		_, frame := wireFor(t, em, types.WorldTypeHub, mage)

		assert.Equal(t, "mana", frame["current_player"].(map[string]any)["resource"].(map[string]any)["kind"])
	})

	t.Run("left behind", func(t *testing.T) {
		em := ecs.NewEntityManager()
		standing, leftBehind := uuid.New(), uuid.New()
		seatWithResource(em, standing, "mage", mana(150, 150), components.AttackTripleFireball)
		body := seatWithResource(em, leftBehind, "warrior", stamina(40, 100), components.AttackDash)
		pc, _ := body.GetComponent(ecs.ComponentTypePlayer)
		pc.(*components.PlayerComponent).LeftBehind = true

		_, own := wireFor(t, em, types.WorldTypeRun, leftBehind)
		_, other := wireFor(t, em, types.WorldTypeRun, standing)

		me := own["current_player"].(map[string]any)
		assert.Equal(t, map[string]any{"kind": "stamina", "current": float64(40), "max": float64(100), "ability_cost": float64(25)}, me["resource"])
		assert.Empty(t, other["other_players"], "the body is not on this floor")
		assert.Equal(t, "mana", other["current_player"].(map[string]any)["resource"].(map[string]any)["kind"])
	})
}

// A delver with no class resource (an older body, a bare test entity) is sent
// none rather than a made-up one.
func TestFormatStateToClientState_OmitsAMissingResource(t *testing.T) {
	em := ecs.NewEntityManager()
	memberID := uuid.New()
	seatDelver(em, memberID, 1, 0)

	_, frame := wireFor(t, em, types.WorldTypeRun, memberID)

	assert.NotContains(t, frame["current_player"], "resource")
}
