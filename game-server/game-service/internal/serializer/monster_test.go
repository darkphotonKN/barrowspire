package serializer

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// addMonster stands a monster in the world the way a run spawns one.
func addMonster(em *ecs.EntityManager, name string, x, y float64, current, maxHealth int) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.MonsterComponent{
		Archetype: components.MonsterArchetypeTroll,
		Level:     4,
		Name:      name,
		Action:    components.MonsterActionIdle,
		FacingX:   0,
		FacingY:   1,
	})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(0, 0, 90))
	e.AddComponent(components.NewHealthComponent(current, maxHealth))
	return e
}

// wireOf is a client state as the client receives it.
func wireOf(t *testing.T, state *types.ClientGameState) map[string]any {
	t.Helper()
	raw, err := json.Marshal(state)
	require.NoError(t, err)
	var wire map[string]any
	require.NoError(t, json.Unmarshal(raw, &wire))
	return wire
}

// A run's broadcast carries every monster with everything the client draws it
// from, under the snake_case names it reads. FS-77AB6 §Requirements 32.
func TestFormatStateToClientState_CarriesEveryMonsterInARun(t *testing.T) {
	em := ecs.NewEntityManager()
	troll := addMonster(em, "Troll", 300, 200, 150, 207)
	addMonster(em, "Troll", 600, 400, 207, 207)
	s := NewStateSerializer(em, nil)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	clientState := s.FormatStateToClientState(backendState, uuid.New())

	require.Len(t, clientState.Monsters, 2)

	wire := wireOf(t, clientState)
	monsters, ok := wire["monsters"].([]any)
	require.True(t, ok, "monsters is on the wire as a list")

	var got map[string]any
	for _, m := range monsters {
		if m.(map[string]any)["entity_id"] == troll.ID.String() {
			got = m.(map[string]any)
		}
	}
	require.NotNil(t, got, "the troll is in the broadcast by its entity id")

	assert.Equal(t, map[string]any{
		"entity_id":      troll.ID.String(),
		"archetype":      "troll",
		"name":           "Troll",
		"level":          float64(4),
		"elite":          false,
		"boss":           false,
		"position":       map[string]any{"x": float64(300), "y": float64(200)},
		"facing":         map[string]any{"x": float64(0), "y": float64(1)},
		"action":         "idle",
		"current_health": float64(150),
		"max_health":     float64(207),
	}, got)
}

// A monster at no health lies dead in the broadcast, whatever it was doing.
func TestSerializeBackendState_MonsterAtNoHealthIsDead(t *testing.T) {
	em := ecs.NewEntityManager()
	addMonster(em, "Ghoul", 300, 200, 0, 40)
	s := NewStateSerializer(em, nil)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)

	require.Len(t, backendState.Monsters, 1)
	assert.Equal(t, string(components.MonsterActionDead), backendState.Monsters[0].Action)
}

// A demon's fire claw goes out as the `claw` action, the only wire change for
// it; a demon at no health mid-claw lies dead. FS-VHGE7 §B R24–25.
func TestSerializeBackendState_DemonClawIsTheClawActionUntilDead(t *testing.T) {
	tests := []struct {
		name   string
		health int
		want   components.MonsterAction
	}{
		{"alive mid-claw", 900, components.MonsterActionClaw},
		{"killed mid-claw", 0, components.MonsterActionDead},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			e := addMonster(em, "Demon", 300, 200, tt.health, 1200)
			mc, _ := e.GetComponent(ecs.ComponentTypeEnemy)
			mc.(*components.MonsterComponent).Action = components.MonsterActionClaw
			s := NewStateSerializer(em, nil)

			backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
			require.NoError(t, err)

			require.Len(t, backendState.Monsters, 1)
			assert.Equal(t, string(tt.want), backendState.Monsters[0].Action)
		})
	}
}

// The hub never holds a monster, and its broadcast does not mention them.
// FS-77AB6 §Requirements 32.
func TestFormatStateToClientState_HubCarriesNoMonsters(t *testing.T) {
	em := ecs.NewEntityManager()
	s := NewStateSerializer(em, nil)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeHub, em.GetAllEntities())
	require.NoError(t, err)
	clientState := s.FormatStateToClientState(backendState, uuid.New())

	_, hasMonsters := wireOf(t, clientState)["monsters"]
	assert.False(t, hasMonsters, "the hub broadcast carries a monsters key")
}

// The pooled state is reset between ticks: a monster from one broadcast never
// lingers into the next.
func TestRestBackendStatePool_ClearsMonsters(t *testing.T) {
	em := ecs.NewEntityManager()
	addMonster(em, "Ghoul", 300, 200, 40, 40)
	s := NewStateSerializer(em, nil)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	require.Len(t, backendState.Monsters, 1)

	s.RestBackendStatePool(backendState)

	assert.Empty(t, backendState.Monsters)
}

// monsterWire is the first monster of a run's broadcast as the client reads it.
func monsterWire(t *testing.T, em *ecs.EntityManager) map[string]any {
	t.Helper()
	s := NewStateSerializer(em, nil)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	monsters, ok := wireOf(t, s.FormatStateToClientState(backendState, uuid.New()))["monsters"].([]any)
	require.True(t, ok)
	require.Len(t, monsters, 1)
	return monsters[0].(map[string]any)
}

// A monster's pending ability rides its state while it winds up: an area's or
// a cone's centre, radius, full angle and seconds left; a shot's kind and
// seconds left only. With none pending there is no `ability`. FS-C8VM7 §B R17.
func TestMonsterState_CarriesItsPendingAbility(t *testing.T) {
	tests := []struct {
		name    string
		ability components.MonsterAbility
		pending components.PendingAbility
		want    map[string]any
	}{
		{
			"a ground slam",
			components.MonsterAbility{Kind: components.MonsterAbilityGroundSlam, Shape: components.AbilityAreaAroundSelf, Radius: 130},
			components.PendingAbility{Remaining: 0.5, X: 300, Y: 200, FacingX: 1},
			map[string]any{"kind": "ground_slam", "x": float64(300), "y": float64(200), "radius": float64(130), "arc": float64(0), "remaining": 0.5},
		},
		{
			"a cleave",
			components.MonsterAbility{Kind: components.MonsterAbilityCleave, Shape: components.AbilityCone, Radius: 110, Arc: 120},
			components.PendingAbility{Remaining: 0.25, X: 300, Y: 200, FacingX: 1},
			map[string]any{"kind": "cleave", "x": float64(300), "y": float64(200), "radius": float64(110), "arc": float64(120), "remaining": 0.25},
		},
		{
			"a rock",
			components.MonsterAbility{Kind: components.MonsterAbilityRock, Shape: components.AbilityShots, ShotRadius: 18},
			components.PendingAbility{Remaining: 0.75, X: 300, Y: 200, FacingX: 1},
			map[string]any{"kind": "rock", "x": float64(0), "y": float64(0), "radius": float64(0), "arc": float64(0), "remaining": 0.75},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			e := addMonster(em, "Blood Troll", 300, 200, 100, 100)
			mc, _ := e.GetComponent(ecs.ComponentTypeEnemy)
			m := mc.(*components.MonsterComponent)
			m.Ability, m.AbilityPending, m.Action = tt.ability, tt.pending, components.MonsterActionAbility

			got := monsterWire(t, em)

			assert.Equal(t, "ability", got["action"])
			assert.Equal(t, tt.want, got["ability"])
		})
	}

	t.Run("none pending", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := addMonster(em, "Blood Troll", 300, 200, 100, 100)
		mc, _ := e.GetComponent(ecs.ComponentTypeEnemy)
		mc.(*components.MonsterComponent).Ability = components.MonsterAbility{Kind: components.MonsterAbilityGroundSlam, Shape: components.AbilityAreaAroundSelf, Radius: 130}

		_, has := monsterWire(t, em)["ability"]

		assert.False(t, has)
	})
}
